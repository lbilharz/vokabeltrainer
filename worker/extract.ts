import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { mergeReadings, type MergedItem, type ReadItem } from "../shared/extract";
import * as schema from "./db/schema";
import { readSession } from "./session";

export const extract = new Hono<{ Bindings: Env }>();

/** Das Bildmodell. Nur hier ändern. */
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Größtes Bild in Bytes. Als Base64 ist es ein Drittel länger. */
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_BODY_BYTES / 3) * 4;
const MAX_PER_DAY = 30;
const MAX_ITEMS = 400;
const TIMEOUT_MS = 45_000;
const RETRY_DELAY_MS = 2000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Getesteter Prompt aus tools/test_erkennung.py. */
const PROMPT = `Das Foto zeigt eine Vokabelseite aus einem Französisch-Schulbuch für deutsche Schüler.
Lies alle Vokabeleinträge in der gedruckten Reihenfolge.

Für jeden Eintrag:
- "fr": das fett gedruckte französische Stichwort, genau wie gedruckt. Mit Artikel, mit weiblicher Form,
  mit Platzhaltern wie "qn/qc", "(à qn)" und "+ inf.". Ohne Lautschrift in eckigen Klammern.
  Ohne Wortart-Kürzel wie adj., adv., f., m., pl.
- "de": die deutsche Übersetzung aus der rechten Spalte, genau wie gedruckt. Nur der aufrechte Text.
  Steht dort nur eine kursive Erklärung (zum Beispiel bei Städtenamen), dann nimm diese Erklärung.
- "n": Merkhinweise zu diesem Eintrag, mehrere mit " · " getrennt. Dazu gehören kursive Zusätze in der
  rechten Spalte (zum Beispiel "wird wie ouvrir konjugiert", "kausal"), verwandte Wörter mit Pfeil
  (zum Beispiel "→ rêver"), Gleich- und Gegenteile ("= ...", "≠ ...") und Beispielsätze.
  Keine Seitenverweise wie "Verbes, p. 156". Keine englischen Übersetzungen. Sonst null.
- "c": die Abschnittsüberschrift, unter der der Eintrag steht (zum Beispiel "Volet 3").
  Ist auf dem Foto keine Überschrift über dem Eintrag zu sehen, dann null.

Kleine Markierungen vor dem Stichwort gehören nicht zum Stichwort. Ein kleines "(ê)" vor einem Verb
bedeutet: passé composé mit être. Lass es in "fr" weg und schreibe "passé composé mit être" in "n".

Ignoriere angeschnittenen Text am Bildrand und Kästen, die nicht zur Vokabelliste gehören.
Erfinde nichts. Korrigiere nichts. Schreibe Akzente und Apostrophe genau wie gedruckt.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          fr: { type: "STRING" },
          de: { type: "STRING" },
          n: { type: "STRING", nullable: true },
          c: { type: "STRING", nullable: true },
        },
        required: ["fr", "de"],
      },
    },
  },
  required: ["items"],
};

const readingSchema = z.object({
  items: z.array(
    z.object({
      fr: z.string(),
      de: z.string(),
      n: z.string().nullish(),
      c: z.string().nullish(),
    }),
  ),
});

const answerSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })),
          })
          .optional(),
      }),
    )
    .optional(),
});

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Was der Browser schickt. Das Bild kommt schon als Base64.
 * So muss der Worker es nicht selbst umwandeln. Das spart Rechenzeit,
 * und die ist im kostenlosen Tarif knapp.
 */
const requestSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(1).max(MAX_BASE64_CHARS),
});

/** Der Text der Anfrage an Gemini. Er wird einmal gebaut und für beide Lesungen benutzt. */
function geminiBody(mimeType: string, imageBase64: string): string {
  return JSON.stringify({
    contents: [
      {
        parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: PROMPT }],
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  });
}

/** Diese Antworten sind meist nur vorübergehend. Dann lohnt ein zweiter Versuch. */
const RETRY_STATUS = [429, 500, 502, 503, 504];

/** Eine Lesung bei Gemini. Wirft UpstreamError. Der Key steht nie in einer Meldung. */
async function callGemini(apiKey: string, body: string): Promise<ReadItem[]> {
  const send = async () => {
    try {
      return await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new UpstreamError(`Keine Antwort von Gemini (${error instanceof Error ? error.name : "Fehler"}).`);
    }
  };

  // Ein zweiter Versuch bei Überlast, Zeitüberschreitung oder Netzfehler.
  let response: Response;
  try {
    response = await send();
    if (RETRY_STATUS.includes(response.status)) {
      await sleep(RETRY_DELAY_MS);
      response = await send();
    }
  } catch {
    await sleep(RETRY_DELAY_MS);
    response = await send();
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new UpstreamError(`Gemini HTTP ${response.status}: ${detail}`, response.status);
  }

  try {
    const answer = answerSchema.parse(await response.json());
    const parts = answer.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");
    const reading = readingSchema.parse(JSON.parse(text));
    return reading.items.map((item) => ({
      c: item.c ?? null,
      fr: item.fr,
      de: item.de,
      n: item.n ?? null,
    }));
  } catch {
    throw new UpstreamError("Die Antwort von Gemini war nicht lesbar.", response.status);
  }
}

/** Strings kürzen, leere Einträge entfernen. */
function clean(items: ReadItem[]): ReadItem[] {
  const text = (value: string | null) => value?.trim() || null;
  const out: ReadItem[] = [];
  for (const item of items) {
    const fr = item.fr.trim();
    const de = item.de.trim();
    if (!fr || !de) continue;
    out.push({ c: text(item.c), fr, de, n: text(item.n) });
  }
  return out;
}

/**
 * Liest ein Foto einer Vokabelseite.
 *
 * Der Body ist das rohe Bild. Das Foto wird nur an Gemini weitergereicht und nie gespeichert.
 * Zwei unabhängige Lesungen laufen parallel. Wo sie sich unterscheiden, steht `check: true`.
 */
extract.post("/extract", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const session = await readSession(context, db);
  if (!session) throw new HTTPException(401, { message: "Nicht angemeldet." });
  const userId = session.userId;

  const contentType = (context.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (IMAGE_TYPES.includes(contentType)) {
    // Eine ältere Fassung der App schickte das rohe Bild. Die Seite muss neu geladen werden.
    throw new HTTPException(400, { message: "Bitte lade die Seite neu und versuch es noch einmal." });
  }
  if (contentType !== "application/json") {
    throw new HTTPException(415, { message: "Nur JPEG, PNG oder WebP." });
  }
  const declared = Number(context.req.header("content-length") ?? "0");
  if (declared > MAX_BASE64_CHARS + 200) throw new HTTPException(413, { message: "Das Foto ist zu groß." });

  const text = await context.req.text();
  if (text.length > MAX_BASE64_CHARS + 200) throw new HTTPException(413, { message: "Das Foto ist zu groß." });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HTTPException(400, { message: "Kein Foto empfangen." });
  }
  const input = requestSchema.safeParse(parsed);
  if (!input.success || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data.data)) {
    throw new HTTPException(400, { message: "Kein Foto empfangen." });
  }
  const { mimeType, data: imageBase64 } = input.data;

  // Der Aufruf wird vor Gemini gezählt. Die Zeile wird nur erhöht, solange das Limit nicht erreicht ist.
  const day = Math.floor(Date.now() / 86_400_000);
  const counted = await db
    .insert(schema.extractLog)
    .values({ userId, day, count: 1 })
    .onConflictDoUpdate({
      target: [schema.extractLog.userId, schema.extractLog.day],
      set: { count: sql`${schema.extractLog.count} + 1` },
      setWhere: sql`${schema.extractLog.count} < ${MAX_PER_DAY}`,
    })
    .returning({ count: schema.extractLog.count });
  if (counted.length === 0) {
    return context.json({ error: "Für heute sind es genug Fotos. Morgen geht es weiter." }, 429);
  }

  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return context.json({ error: "Die Erkennung ist nicht eingerichtet." }, 503);
  }

  const body = geminiBody(mimeType, imageBase64);
  const [first, second] = await Promise.allSettled([callGemini(apiKey, body), callGemini(apiKey, body)]);

  for (const result of [first, second]) {
    if (result.status === "rejected") console.error("Fotoerkennung:", String(result.reason));
  }

  let items: MergedItem[];
  let readings: 1 | 2;
  if (first.status === "fulfilled" && second.status === "fulfilled") {
    items = mergeReadings(clean(first.value), clean(second.value));
    readings = 2;
  } else if (first.status === "fulfilled" || second.status === "fulfilled") {
    const ok = first.status === "fulfilled" ? first.value : (second as PromiseFulfilledResult<ReadItem[]>).value;
    items = clean(ok).map((item) => ({ ...item, check: false }));
    readings = 1;
  } else {
    return context.json({ error: "Die Seite konnte nicht gelesen werden. Versuch es noch einmal." }, 502);
  }

  return context.json({ items: items.slice(0, MAX_ITEMS), readings });
});
