import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { fnv1a, sayText } from "../shared/text";
import * as schema from "./db/schema";
import { readSession } from "./session";
import { countGlobal } from "./usage";

export const audio = new Hono<{ Bindings: Env }>();

/** Stimme, Modell, Format und Tempo. Gleich wie in tools/render_tts.py. Nur hier ändern. */
const VOICE_ID = "O31r762Gb3WFygrEOGh0";
const MODEL_ID = "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128";
const SPEED = 0.95;
const ELEVENLABS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${OUTPUT_FORMAT}`;

const MAX_RENDERS_PER_CALL = 3;
const MAX_PER_DAY = 400;
const TIMEOUT_MS = 30_000;

const requestSchema = z.object({
  texts: z.array(z.string().min(1).max(200)).min(1).max(10),
});

type Stopped = "limit" | "unconfigured" | "failed";

const NOT_FOUND = { error: "Nicht gefunden." };

/** Ein Text wird immer einzeln gerendert. Mehrere Texte in einer Anfrage machen die Stimme zu schnell. */
async function renderOne(apiKey: string, text: string): Promise<ArrayBuffer | null> {
  let spoken = sayText(text, "fr");
  if (!/[.?!]$/.test(spoken)) spoken += "."; // Mit Punkt endet die Betonung natürlich.
  try {
    const response = await fetch(ELEVENLABS_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: spoken,
        model_id: MODEL_ID,
        voice_settings: { speed: SPEED },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      console.error(`Sprachausgabe: ElevenLabs HTTP ${response.status}: ${detail}`);
      return null;
    }
    return await response.arrayBuffer();
  } catch (error) {
    console.error(`Sprachausgabe: keine Antwort von ElevenLabs (${error instanceof Error ? error.name : "Fehler"}).`);
    return null;
  }
}

/**
 * Sorgt dafür, dass zu den französischen Texten eine mp3 im Speicher liegt.
 *
 * Vorhandene Dateien gehen in `ready`. Fehlende werden nacheinander gerendert,
 * höchstens MAX_RENDERS_PER_CALL pro Aufruf. Der Rest steht in `pending`.
 */
audio.post("/audio/ensure", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const session = await readSession(context, db);
  if (!session) throw new HTTPException(401, { message: "Nicht angemeldet." });
  const userId = session.userId;

  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new HTTPException(400, { message: "Ungültige Anfrage." });
  }
  const input = requestSchema.safeParse(body);
  if (!input.success) throw new HTTPException(400, { message: "Ungültige Anfrage." });

  // Pro Hash ein Text. Der Hash gilt für den Text genau so, wie er kam.
  const byHash = new Map<string, string>();
  for (const text of input.data.texts) {
    if (!sayText(text, "fr")) continue; // Nichts zu sprechen.
    const hash = fnv1a(text);
    if (!byHash.has(hash)) byHash.set(hash, text);
  }

  const ready: string[] = [];
  const missing: string[] = [];
  for (const hash of byHash.keys()) {
    const head = await context.env.AUDIO.head(`fr/${hash}.mp3`);
    if (head) ready.push(hash);
    else missing.push(hash);
  }

  const pending: string[] = [];
  let stopped: Stopped | undefined;
  const apiKey = context.env.ELEVENLABS_API_KEY;
  let renders = 0;

  for (let i = 0; i < missing.length; i++) {
    const hash = missing[i]!;
    const rest = () => missing.slice(i);

    if (!apiKey) {
      pending.push(...rest());
      stopped = "unconfigured";
      break;
    }
    if (renders >= MAX_RENDERS_PER_CALL) {
      pending.push(...rest());
      break;
    }

    // Der Aufruf wird vor ElevenLabs gezählt. Die Zeile wird nur erhöht, solange das Limit nicht erreicht ist.
    const day = Math.floor(Date.now() / 86_400_000);
    const counted = await db
      .insert(schema.audioLog)
      .values({ userId, day, count: 1 })
      .onConflictDoUpdate({
        target: [schema.audioLog.userId, schema.audioLog.day],
        set: { count: sql`${schema.audioLog.count} + 1` },
        setWhere: sql`${schema.audioLog.count} < ${MAX_PER_DAY}`,
      })
      .returning({ count: schema.audioLog.count });
    if (counted.length === 0 || !(await countGlobal(db, "audio"))) {
      pending.push(...rest());
      stopped = "limit";
      break;
    }

    renders++;
    const bytes = await renderOne(apiKey, byHash.get(hash)!);
    if (!bytes) {
      pending.push(...rest());
      stopped = "failed";
      break;
    }
    await context.env.AUDIO.put(`fr/${hash}.mp3`, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
    ready.push(hash);
  }

  return context.json(stopped ? { ready, pending, stopped } : { ready, pending });
});

/** Liest den Bereich aus einem Range-Header ("bytes=0-99", "bytes=100-", "bytes=-50"). */
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end };
}

/** Liefert eine mp3. Ohne Anmeldung, die Dateien sind nicht geheim. Mit Range, weil Safari es für Audio braucht. */
audio.get("/audio/fr/:file", async (context) => {
  const file = context.req.param("file");
  if (!/^[0-9a-f]{8}\.mp3$/.test(file)) return context.json(NOT_FOUND, 404);
  const key = `fr/${file}`;

  const head = await context.env.AUDIO.head(key);
  if (!head) return context.json(NOT_FOUND, 404);

  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    ETag: head.httpEtag,
  };

  const rangeHeader = context.req.header("range");
  if (rangeHeader) {
    const range = parseRange(rangeHeader, head.size);
    if (!range) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${head.size}` } });
    }
    const length = range.end - range.start + 1;
    const part = await context.env.AUDIO.get(key, { range: { offset: range.start, length } });
    if (!part) return context.json(NOT_FOUND, 404);
    return new Response(part.body, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${range.start}-${range.end}/${head.size}`,
        "Content-Length": String(length),
      },
    });
  }

  const object = await context.env.AUDIO.get(key);
  if (!object) return context.json(NOT_FOUND, 404);
  return new Response(object.body, { headers: { ...headers, "Content-Length": String(object.size) } });
});
