import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./db/schema";

type Database = DrizzleD1Database<typeof schema>;

/** Der Zähler für alle Konten zusammen. */
export const EVERYONE = "*";

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

/** So viele Gegenproben darf ein Konto am Tag auslösen. Ein Foto braucht eine. */
export const CHECKS_PER_USER = 60;

/** So viele Urteile darf ein Konto am Tag auslösen. Treffer im Speicher zählen nicht. */
export const JUDGES_PER_USER = 150;

export type UsageKind = keyof typeof GLOBAL_PER_DAY;

/**
 * Zählt einen Aufruf, solange das Limit nicht erreicht ist.
 * Die Zeile wird in einem Schritt geprüft und erhöht. Zwei gleichzeitige Anfragen können das Limit nicht überspringen.
 * false heisst: Limit erreicht, nichts gezählt.
 */
export async function countUse(db: Database, scope: string, kind: UsageKind, limit: number): Promise<boolean> {
  const day = Math.floor(Date.now() / 86_400_000);
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

/** Zählt einen Aufruf gegen die Obergrenze für alle Konten. */
export function countGlobal(db: Database, kind: UsageKind): Promise<boolean> {
  return countUse(db, EVERYONE, kind, GLOBAL_PER_DAY[kind]);
}
