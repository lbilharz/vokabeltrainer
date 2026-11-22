import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import * as schema from "./db/schema";
import { readSession } from "./session";

export const check = new Hono<{ Bindings: Env }>();

/** Das Modell für die Gegenprobe. Das kleinere Flash Lite übersieht verrutschte Zeilen. */
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1500;
const RETRY_STATUS = [429, 500, 502, 503, 504];

/**
 * Die Gegenprobe sieht kein Foto. Sie liest nur die Wortpaare und kennt die Sprache.
 * Gemessen am 22.11.2026 mit kurzem Nachdenken: 16 von 16 verrutschten Zeilen erkannt,
 * kein falscher Alarm bei der richtigen Liste, 2 bis 3 Sekunden.
 */
const PROMPT = `Du prüfst eine Vokabelliste. Sie wurde per Texterkennung aus einem Französisch-Schulbuch für deutsche Schüler gelesen.
Finde Zeilen, bei denen wahrscheinlich ein LESEFEHLER vorliegt. Es gibt drei Arten:
1. "schreibweise": Das französische Stichwort ist kein richtig geschriebenes Französisch (fehlender Akzent, falscher Buchstabe).
2. "passt_nicht": Die deutsche Übersetzung passt nicht zum französischen Stichwort.
3. "verschmolzen": Zwei Einträge sind zu einem verschmolzen.

Das ist KEIN Fehler und wird nicht markiert:
- Platzhalter wie qn, qc, + inf., (à qn), jdn, jdm, etw.
- Bei Eigennamen eine Erklärung statt einer Übersetzung (zum Beispiel "Dijon" = "Stadt in der Region Burgund").
- Kurzformen wie "Haupt-" und mehrere Formen mit Schrägstrich.
- Eine Übersetzung, die nur eine von mehreren möglichen Bedeutungen nennt.

Markiere lieber zu wenig als zu viel. Antworte nur mit den Zeilennummern der fehlerhaften Zeilen.

Liste:
`;

const KINDS = ["schreibweise", "passt_nicht", "verschmolzen"] as const;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    flags: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { i: { type: "INTEGER" }, art: { type: "STRING", enum: [...KINDS] } },
        required: ["i", "art"],
      },
    },
  },
  required: ["flags"],
};

const requestSchema = z.object({
  items: z
    .array(z.object({ fr: z.string().min(1).max(300), de: z.string().min(1).max(300) }))
    .min(1)
    .max(150),
});

const answerSchema = z.object({
  candidates: z.array(
    z.object({
      content: z.object({
        parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })),
      }),
    }),
  ),
});

const flagsSchema = z.object({
  flags: z.array(z.object({ i: z.number().int(), art: z.enum(KINDS) })),
});

/**
 * Gegenprobe für eine gelesene Vokabelliste.
 *
 * Sie markiert nur. Geändert wird nichts, denn das Buch hat recht und nicht das Modell.
 * Ein eigenes Tageslimit gibt es nicht: der Aufruf braucht eine Anmeldung,
 * ist klein und auf 150 Zeilen begrenzt.
 */
check.post("/check", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const session = await readSession(context, db);
  if (!session) throw new HTTPException(401, { message: "Nicht angemeldet." });

  const input = requestSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) throw new HTTPException(400, { message: "Ungültige Anfrage." });
  const items = input.data.items;

  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) return context.json({ error: "Die Erkennung ist nicht eingerichtet." }, 503);

  // Zeilenumbrüche in einem Eintrag würden die Nummerierung durcheinanderbringen.
  const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
  const list = items.map((item, index) => `${index}: ${oneLine(item.fr)} = ${oneLine(item.de)}`).join("\n");
  const body = JSON.stringify({
    contents: [{ parts: [{ text: PROMPT + list }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel: "low" },
    },
  });

  const send = () =>
    fetch(GEMINI_URL, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  try {
    let response: Response;
    try {
      response = await send();
      if (RETRY_STATUS.includes(response.status)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        response = await send();
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      response = await send();
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new Error(`Gemini HTTP ${response.status}: ${detail}`);
    }
    const answer = answerSchema.parse(await response.json());
    const text = (answer.candidates[0]?.content.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");
    const parsed = flagsSchema.parse(JSON.parse(text));

    // Nur gültige Zeilennummern, jede Zeile höchstens einmal.
    const seen = new Set<number>();
    const flags = parsed.flags.filter((flag) => {
      if (flag.i < 0 || flag.i >= items.length || seen.has(flag.i)) return false;
      seen.add(flag.i);
      return true;
    });
    return context.json({ flags: flags.map((flag) => ({ i: flag.i, kind: flag.art })) });
  } catch (error) {
    console.error("Gegenprobe:", String(error));
    return context.json({ error: "Die Gegenprobe ist gerade nicht möglich." }, 502);
  }
});
