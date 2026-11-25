import { sql } from "drizzle-orm";
import { DAY_MS } from "../shared/dates";
import * as schema from "./db/schema";
import type { Database } from "./session";

/** Der Zähler für alle Konten zusammen. */
const EVERYONE = "*";

/**
 * Obergrenzen pro Tag für alle Konten zusammen.
 * Sie schützen das Budget, falls ein Konto missbraucht wird oder viele Konten zugleich viel tun.
 */
export const GLOBAL_PER_DAY = {
  /** Fotos lesen. Jedes Foto kostet bis zu vier Anfragen bei Gemini. */
  extract: 150,
  /** Gegenproben. Jede kostet bis zu zwei Anfragen bei Gemini. */
  check: 300,
  /** Urteile des Schiedsrichters. Jedes ist eine kleine Anfrage bei Gemini. */
  judge: 1500,
  /** Neue Aufnahmen bei ElevenLabs. */
  audio: 1000,
} as const;

/** So viel darf ein einzelnes Konto am Tag auslösen. */
export const USER_PER_DAY = {
  extract: 30,
  /** Ein Foto braucht eine Gegenprobe. */
  check: 60,
  /** Treffer im Speicher zählen nicht. */
  judge: 150,
  audio: 400,
} as const;

export type UsageKind = keyof typeof GLOBAL_PER_DAY;

/**
 * Zählt einen Aufruf, solange das Limit nicht erreicht ist.
 * Die Zeile wird in einem Schritt geprüft und erhöht. Zwei gleichzeitige Anfragen können das Limit nicht überspringen.
 * false heisst: Limit erreicht, nichts gezählt.
 */
async function countUse(db: Database, scope: string, kind: UsageKind, limit: number): Promise<boolean> {
  const day = Math.floor(Date.now() / DAY_MS);
  const counted = await db
    .insert(schema.usageLog)
    .values({ scope, kind, day, count: 1 })
    .onConflictDoUpdate({
      target: [schema.usageLog.scope, schema.usageLog.kind, schema.usageLog.day],
      set: { count: sql`${schema.usageLog.count} + 1` },
      setWhere: sql`${schema.usageLog.count} < ${limit}`,
    })
    .returning({ count: schema.usageLog.count });
  return counted.length > 0;
}

/**
 * Zählt einen bezahlten Aufruf. Immer vor dem Aufruf beim Anbieter.
 *
 * Erst zählt das Konto, dann die Obergrenze für alle. Ist das Konto am Limit, wird für alle nichts gezählt.
 * "ok" heisst: gezählt, der Aufruf darf laufen. Sonst steht da, welche Grenze erreicht ist.
 */
export async function spend(db: Database, userId: string, kind: UsageKind): Promise<"ok" | "user" | "everyone"> {
  if (!(await countUse(db, userId, kind, USER_PER_DAY[kind]))) return "user";
  if (!(await countUse(db, EVERYONE, kind, GLOBAL_PER_DAY[kind]))) return "everyone";
  return "ok";
}
