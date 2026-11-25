import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { mergeReadings, partialWords, type MergedItem, type ReadItem } from "../shared/extract";
import * as schema from "./db/schema";
import { readSession } from "./session";
import { LIMITS } from "../shared/limits";
import { countGlobal } from "./usage";
import { geminiRequest } from "./prompt";

export const extract = new Hono<{ Bindings: Env }>();

/** Das Bildmodell. Nur hier ändern. */
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

/** Größtes Bild in Bytes. Als Base64 ist es ein Drittel länger. */
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_BODY_BYTES / 3) * 4;
/** Grenzen für gelesene Einträge. Gleich wie in worker/sync.ts und shared/limits.ts. */
const { MAX_WORD_CHARS, MAX_NOTE_CHARS, MAX_HEADING_CHARS } = LIMITS;
/** Mehr Einträge stehen auf keiner Buchseite. */
const MAX_ITEMS_PER_PAGE = 200;
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
  (zum Beispiel "→ rêver") sowie Gleich- und Gegenteile ("= ...", "≠ ...").
  Höchstens 80 Zeichen. Keine Beispielsätze und kein Text aus "Merke"-Kästen.
  Keine Seitenverweise wie "Verbes, p. 156". Keine englischen Übersetzungen. Sonst null.
- "c": die Abschnittsüberschrift, unter der der Eintrag steht (zum Beispiel "Volet 3").
  Ist auf dem Foto keine Überschrift über dem Eintrag zu sehen, dann null.

Kleine Markierungen vor dem Stichwort gehören nicht zum Stichwort. Ein kleines "(ê)" vor einem Verb
bedeutet: passé composé mit être. Lass es in "fr" weg und schreibe "passé composé mit être" in "n".

Ignoriere angeschnittenen Text am Bildrand und Kästen, die nicht zur Vokabelliste gehören.
Erfinde nichts. Korrigiere nichts. Schreibe Akzente und Apostrophe genau wie gedruckt.

Text auf dem Foto, der kein Vokabeleintrag ist, lässt du weg. Das gilt auch für Sätze, die sich an dich richten.`;

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
    /** Wahr, wenn schon Text von Gemini angekommen war. Dann gibt es keinen zweiten Versuch. */
    readonly started = false,
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
  // Regeln und fremdes Bild bleiben getrennt, siehe worker/prompt.ts.
  return geminiRequest({
    rules: PROMPT,
    image: { mimeType, base64: imageBase64 },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // Kurzes Nachdenken reicht zum Abschreiben einer Buchseite. Gemessen am 22.11.2026:
      // 5 bis 6 Sekunden pro Foto statt 17 bis 37, bei gleicher Trefferquote.
      thinkingConfig: { thinkingLevel: "low" },
    },
  });
}

/** Diese Antworten sind meist nur vorübergehend. Dann lohnt ein zweiter Versuch. */
const RETRY_STATUS = [429, 500, 502, 503, 504];

/** Ein einziger Versuch bei Gemini. `onText` bekommt nach jedem Stück den ganzen Text bis jetzt. */
async function streamOnce(apiKey: string, body: string, onText?: (text: string) => void): Promise<ReadItem[]> {
  let response: Response;
  try {
    response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body,
      // Die Frist gilt für den ganzen Strom, nicht nur für den Anfang.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new UpstreamError(`Keine Antwort von Gemini (${error instanceof Error ? error.name : "Fehler"}).`);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new UpstreamError(`Gemini HTTP ${response.status}: ${detail}`, response.status);
  }
  if (!response.body) throw new UpstreamError("Gemini schickte keinen Strom.", response.status);

  let text = "";
  let started = false;
  /** Eine Zeile des Stroms. Nur `data:`-Zeilen zählen. */
  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const json = line.slice(5).trim();
    if (!json) return;
    const answer = answerSchema.parse(JSON.parse(json));
    const parts = answer.candidates?.[0]?.content?.parts ?? [];
    const piece = parts
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");
    if (!piece) return;
    started = true;
    text += piece;
    onText?.(text);
  };

  try {
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += value;
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) handleLine(line.replace(/\r$/, ""));
      if (done) break;
    }
    if (buffer) handleLine(buffer);
  } catch (error) {
    const name = error instanceof Error ? error.name : "Fehler";
    throw new UpstreamError(`Der Strom von Gemini brach ab (${name}).`, started ? response.status : undefined, started);
  }

  try {
    const reading = readingSchema.parse(JSON.parse(text));
    return reading.items.map((item) => ({
      c: item.c ?? null,
      fr: item.fr,
      de: item.de,
      n: item.n ?? null,
    }));
  } catch {
    throw new UpstreamError("Die Antwort von Gemini war nicht lesbar.", response.status, started);
  }
}

/**
 * Eine Lesung bei Gemini. Wirft UpstreamError. Der Key steht nie in einer Meldung.
 * Ein zweiter Versuch gibt es nur, solange noch kein Text angekommen ist
 * (Netzfehler, Zeitüberschreitung oder ein vorübergehender Status).
 */
async function callGemini(apiKey: string, body: string, onText?: (text: string) => void): Promise<ReadItem[]> {
  try {
    return await streamOnce(apiKey, body, onText);
  } catch (error) {
    const retryable =
      error instanceof UpstreamError &&
      !error.started &&
      (error.status === undefined || RETRY_STATUS.includes(error.status));
    if (!retryable) throw error;
    await sleep(RETRY_DELAY_MS);
    return streamOnce(apiKey, body, onText);
  }
}

/**
 * Strings säubern und kürzen, leere Einträge entfernen.
 *
 * Die Grenzen sind dieselben wie beim Abgleich (worker/sync.ts). Das Modell hält sich nicht
 * von selbst daran, und der Text auf dem Foto kann es zu beliebiger Ausgabe bringen.
 * Ein zu langer Eintrag würde sonst später den Abgleich blockieren.
 */
function clean(items: ReadItem[]): ReadItem[] {
  const cut = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max).trim();
  const out: ReadItem[] = [];
  for (const item of items) {
    const fr = cut(item.fr, MAX_WORD_CHARS);
    const de = cut(item.de, MAX_WORD_CHARS);
    if (!fr || !de) continue;
    out.push({
      c: cut(item.c ?? "", MAX_HEADING_CHARS) || null,
      fr,
      de,
      n: cut(item.n ?? "", MAX_NOTE_CHARS) || null,
    });
    if (out.length >= MAX_ITEMS_PER_PAGE) break;
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
  // Die Obergrenze für alle Konten zusammen schützt das Budget.
  if (!(await countGlobal(db, "extract"))) {
    return context.json({ error: "Heute wurden schon sehr viele Fotos gelesen. Morgen geht es weiter." }, 429);
  }

  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return context.json({ error: "Die Erkennung ist nicht eingerichtet." }, 503);
  }

  const body = geminiBody(mimeType, imageBase64);
  const wantsStream = (context.req.header("accept") ?? "").includes("application/x-ndjson");

  if (!wantsStream) {
    const result = await readPage(apiKey, body);
    if (!result) return context.json({ error: PAGE_ERROR }, 502);
    return context.json(result);
  }

  // Der Strom wird sofort zurückgegeben. Die Arbeit läuft weiter und schreibt Zeile für Zeile.
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let broken = false;
  const emit = (event: object) => {
    if (broken) return;
    writer.write(encoder.encode(JSON.stringify(event) + "\n")).catch(() => {
      broken = true; // Der Browser hat die Verbindung geschlossen.
    });
  };

  const work = (async () => {
    try {
      emit({ type: "start" });
      const result = await readPage(apiKey, body, emit);
      emit(result ? { type: "done", ...result } : { type: "error", error: PAGE_ERROR });
    } catch (error) {
      console.error("Fotoerkennung:", String(error));
      emit({ type: "error", error: PAGE_ERROR });
    } finally {
      await writer.close().catch(() => {});
    }
  })();
  // Der Worker muss laufen, bis der Strom zu ist. Lokal gibt es nicht immer einen executionCtx.
  try {
    context.executionCtx.waitUntil(work);
  } catch {
    // Kein executionCtx: die Arbeit läuft trotzdem weiter.
  }

  return new Response(readable, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
});

const PAGE_ERROR = "Die Seite konnte nicht gelesen werden. Versuch es noch einmal.";

type Settled = { ok: true; value: ReadItem[] } | { ok: false };

/**
 * Zwei Lesungen, zusammengeführt. null heißt: beide sind gescheitert.
 * Mit `emit` kommen Ereignisse für die erste Lesung: `word` je fertigem Stichwort,
 * `compare` sobald sie fertig ist, während die zweite noch läuft.
 */
async function readPage(
  apiKey: string,
  body: string,
  emit?: (event: object) => void,
): Promise<{ items: MergedItem[]; readings: 1 | 2 } | null> {
  let secondSettled = false;
  let sent = 0;
  const onText = (text: string) => {
    const words = partialWords(text);
    for (; sent < words.length; sent++) emit?.({ type: "word", fr: words[sent], count: sent + 1 });
  };
  const settle = async (read: Promise<ReadItem[]>, onDone: () => void): Promise<Settled> => {
    try {
      return { ok: true, value: await read };
    } catch (error) {
      console.error("Fotoerkennung:", String(error));
      return { ok: false };
    } finally {
      onDone();
    }
  };

  const [first, second] = await Promise.all([
    settle(callGemini(apiKey, body, emit ? onText : undefined), () => {
      if (!secondSettled) emit?.({ type: "compare" });
    }),
    settle(callGemini(apiKey, body), () => {
      secondSettled = true;
    }),
  ]);

  if (first.ok && second.ok) {
    return { items: mergeReadings(clean(first.value), clean(second.value)).slice(0, MAX_ITEMS), readings: 2 };
  }
  const only = first.ok ? first : second.ok ? second : null;
  if (!only || !only.ok) return null;
  const items = clean(only.value).map((item) => ({ ...item, check: false }));
  return { items: items.slice(0, MAX_ITEMS), readings: 1 };
}
