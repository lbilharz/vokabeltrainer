import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import * as schema from "./db/schema";
import { requireSession } from "./session";
import { spend } from "./usage";
import { geminiRequest } from "./prompt";
import { RETRY_STATUS, answerText, geminiUrl, postGemini } from "./gemini";
import { CHECK_KINDS } from "../shared/extract";
import { FOREIGN } from "../shared/lang";
import { LIMITS } from "../shared/limits";
import { oneLine } from "../shared/text";
import type { Foreign } from "../shared/types";

export const check = new Hono<{ Bindings: Env }>();

/** Das Modell für die Gegenprobe. Das kleinere Flash Lite übersieht verrutschte Zeilen. */
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL = geminiUrl(GEMINI_MODEL);
const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1500;

/**
 * Die Gegenprobe sieht kein Foto. Sie liest nur die Wortpaare und kennt die Sprache.
 * Gemessen am 22.11.2026 mit kurzem Nachdenken: 16 von 16 verrutschten Zeilen erkannt,
 * kein falscher Alarm bei der richtigen Liste, 2 bis 3 Sekunden.
 */
const PROMPT_FR = `Du prüfst eine Vokabelliste. Sie wurde per Texterkennung aus einem Französisch-Schulbuch für deutsche Schüler gelesen.
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

Du bekommst die Liste als JSON: "zeilen" mit "nr", "fr" und "de" je Zeile. "nr" ist die Zeilennummer für deine Antwort.`;

/** Dieselbe Aufgabe für Englisch. Das Stichwort steht weiter im Feld "fr". */
const PROMPT_EN = `Du prüfst eine Vokabelliste. Sie wurde per Texterkennung aus einem Englisch-Schulbuch für deutsche Schüler gelesen.
Finde Zeilen, bei denen wahrscheinlich ein LESEFEHLER vorliegt. Es gibt drei Arten:
1. "schreibweise": Das englische Stichwort ist kein richtig geschriebenes Englisch (falscher oder fehlender Buchstabe).
2. "passt_nicht": Die deutsche Übersetzung passt nicht zum englischen Stichwort.
3. "verschmolzen": Zwei Einträge sind zu einem verschmolzen.

Das ist KEIN Fehler und wird nicht markiert:
- Platzhalter wie sb, sth, jdn, jdm, etw. und ein "(to)" oder "to" vor Verben.
- Mehrere Formen eines unregelmäßigen Verbs hintereinander (zum Beispiel "go, went, gone").
- Britische und amerikanische Schreibweisen. Beide sind richtig.
- Bei Eigennamen eine Erklärung statt einer Übersetzung.
- Kurzformen wie "Haupt-" und mehrere Formen mit Schrägstrich.
- Eine Übersetzung, die nur eine von mehreren möglichen Bedeutungen nennt.

Markiere lieber zu wenig als zu viel. Antworte nur mit den Zeilennummern der fehlerhaften Zeilen.

Du bekommst die Liste als JSON: "zeilen" mit "nr", "fr" und "de" je Zeile. "fr" ist das englische Stichwort. "nr" ist die Zeilennummer für deine Antwort.`;

const PROMPTS: Record<Foreign, string> = { fr: PROMPT_FR, en: PROMPT_EN };

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    flags: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { i: { type: "INTEGER" }, art: { type: "STRING", enum: [...CHECK_KINDS] } },
        required: ["i", "art"],
      },
    },
  },
  required: ["flags"],
};

const requestSchema = z.object({
  items: z
    .array(
      z.object({
        fr: z.string().min(1).max(LIMITS.MAX_WORD_CHARS),
        de: z.string().min(1).max(LIMITS.MAX_WORD_CHARS),
      }),
    )
    .min(1)
    .max(150),
  /** Die Sprache der Liste. Ältere Fassungen der App schicken sie nicht. Dann ist es Französisch. */
  lang: z.enum(FOREIGN).default("fr"),
});

const flagsSchema = z.object({
  flags: z.array(z.object({ i: z.number().int(), art: z.enum(CHECK_KINDS) })),
});

/**
 * Gegenprobe für eine gelesene Vokabelliste.
 *
 * Sie markiert nur. Geändert wird nichts, denn das Buch hat recht und nicht das Modell.
 * Jeder Aufruf kostet Geld bei Gemini. Deshalb gibt es ein Tageslimit pro Konto
 * und eine Obergrenze für alle Konten zusammen.
 */
check.post("/check", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const session = await requireSession(context, db);

  // Kaputtes JSON und falsche Felder werden in worker/index.ts zu 400.
  const { items, lang } = requestSchema.parse(await context.req.json());

  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) return context.json({ error: "Die Erkennung ist nicht eingerichtet." }, 503);

  // Gezählt wird vor dem Aufruf bei Gemini.
  if ((await spend(db, session.userId, "check")) !== "ok") {
    return context.json({ error: "Für heute sind es genug Gegenproben." }, 429);
  }

  // Regeln und fremder Text bleiben getrennt, siehe worker/prompt.ts.
  const body = geminiRequest({
    rules: PROMPTS[lang],
    data: { zeilen: items.map((item, index) => ({ nr: index, fr: oneLine(item.fr), de: oneLine(item.de) })) },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel: "low" },
    },
  });

  const send = () => postGemini(GEMINI_URL, apiKey, body, TIMEOUT_MS);

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
    const parsed = flagsSchema.parse(JSON.parse(answerText(await response.json())));

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
