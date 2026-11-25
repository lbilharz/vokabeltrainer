/**
 * Der Weg zu Gemini: Adresse, Kopfzeilen und das Lesen der Antwort.
 *
 * Wie Regeln und fremder Text getrennt bleiben, steht in worker/prompt.ts.
 */

import { z } from "zod";

/** Die Adresse für ein Modell. Mit `stream` kommt die Antwort stückweise. */
export function geminiUrl(model: string, stream = false): string {
  const method = stream ? "streamGenerateContent?alt=sse" : "generateContent";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`;
}

/** Diese Antworten sind meist nur vorübergehend. Dann lohnt ein zweiter Versuch. */
export const RETRY_STATUS = [429, 500, 502, 503, 504];

/** Eine Anfrage an Gemini. Der Key steht nur in der Kopfzeile. Die Frist gilt für die ganze Antwort. */
export function postGemini(url: string, apiKey: string, body: string, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

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

/**
 * Der Text einer Antwort oder eines Stücks aus dem Strom.
 * Die Gedanken des Modells zählen nicht dazu. Fehlt der Text, kommt ein leerer String.
 */
export function answerText(json: unknown): string {
  const parts = answerSchema.parse(json).candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("");
}
