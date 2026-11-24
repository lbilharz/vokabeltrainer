import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "./db/schema";
import { readSession } from "./session";
import { LIMITS } from "../shared/limits";

export const sync = new Hono<{ Bindings: Env }>();

/**
 * D1 erlaubt höchstens 100 gebundene Werte pro Statement.
 * Eine Karte braucht 7. Mit 12 Karten je Statement sind es 84 Werte.
 */
const CARDS_PER_STATEMENT = 12;

/** So viele Statements gehen in einen db.batch. Ein Batch ist eine Transaktion. */
const STATEMENTS_PER_BATCH = 40;

/** Ein Set braucht 6 gebundene Werte. Mit 12 Sets je Statement sind es 72. */
const SETS_PER_STATEMENT = 12;

/** Obergrenze für den JSON-Text der Einstellungen, in Zeichen. */
const MAX_META_CHARS = 100_000;

const setDataSchema = z.object({
  label: z.string().min(1).max(LIMITS.MAX_LABEL_CHARS),
  unit: z.tuple([z.string().min(1).max(20), z.string().min(1).max(20)]),
  items: z
    .array(
      z.object({
        c: z.string().max(LIMITS.MAX_HEADING_CHARS),
        fr: z.string().min(1).max(LIMITS.MAX_WORD_CHARS),
        de: z.string().min(1).max(LIMITS.MAX_WORD_CHARS),
        n: z.string().max(LIMITS.MAX_NOTE_CHARS).optional(),
      }),
    )
    .max(LIMITS.MAX_ITEMS_PER_SET),
  createdAt: z.number().int().min(0),
});

const setSchema = z.object({
  id: z.string().min(1).max(40),
  t: z.number().int().min(0),
  deleted: z.boolean(),
  data: setDataSchema.nullable(),
});

const syncSchema = z.object({
  since: z.number().int().min(0),
  cards: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        box: z.number().int().min(1).max(8),
        due: z.number().int().min(0).max(200_000),
        seen: z.boolean(),
        t: z.number().int().min(0),
      }),
    )
    .max(3000),
  meta: z
    .object({
      data: z.record(z.string(), z.unknown()),
      t: z.number().int().min(0),
    })
    .optional(),
  // Die Sets werden einzeln geprüft, siehe unten. Ein ungültiges Set soll nicht alles blockieren.
  sets: z.array(z.unknown()).max(50).optional(),
});

/**
 * Abgleich des Lernstands.
 *
 * Der Client schickt, was sich bei ihm geändert hat, und bekommt zurück, was
 * seit `since` auf dem Server geschrieben wurde. Pro Karte gewinnt die neuere
 * Änderungszeit `t`. Bei Gleichstand gewinnt die eingehende Fassung.
 *
 * Jede Abfrage filtert auf die Nutzer-ID der Sitzung. Fremde Zeilen sind
 * damit weder les- noch schreibbar.
 */
sync.post("/sync", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const session = await readSession(context, db);
  if (!session) throw new HTTPException(401, { message: "Nicht angemeldet." });
  const userId = session.userId;

  const body = syncSchema.parse(await context.req.json());

  const metaJson = body.meta ? JSON.stringify(body.meta.data) : null;
  if (metaJson !== null && metaJson.length > MAX_META_CHARS) {
    throw new HTTPException(413, { message: "Die Einstellungen sind zu groß." });
  }

  const now = Date.now();

  // Doppelte IDs in einer Anfrage: die mit dem größten t zählt.
  const latest = new Map<string, (typeof body.cards)[number]>();
  for (const card of body.cards) {
    const known = latest.get(card.id);
    if (!known || card.t >= known.t) latest.set(card.id, card);
  }
  const incoming = [...latest.values()];

  const statements = [];

  for (let i = 0; i < incoming.length; i += CARDS_PER_STATEMENT) {
    const rows = incoming.slice(i, i + CARDS_PER_STATEMENT).map((card) => ({
      userId,
      itemId: card.id,
      box: card.box,
      due: card.due,
      seen: card.seen,
      t: card.t,
      updatedAt: now,
    }));

    statements.push(
      db
        .insert(schema.cards)
        .values(rows)
        .onConflictDoUpdate({
          target: [schema.cards.userId, schema.cards.itemId],
          set: {
            box: sql`excluded.box`,
            due: sql`excluded.due`,
            seen: sql`excluded.seen`,
            t: sql`excluded.t`,
            updatedAt: sql`excluded.updated_at`,
          },
          // Nur überschreiben, wenn die eingehende Änderung nicht älter ist.
          setWhere: sql`excluded.t >= ${schema.cards.t}`,
        }),
    );
  }

  if (body.meta && metaJson !== null) {
    statements.push(
      db
        .insert(schema.userMeta)
        .values({ userId, data: metaJson, t: body.meta.t, updatedAt: now })
        .onConflictDoUpdate({
          target: schema.userMeta.userId,
          set: {
            data: sql`excluded.data`,
            t: sql`excluded.t`,
            updatedAt: sql`excluded.updated_at`,
          },
          setWhere: sql`excluded.t >= ${schema.userMeta.t}`,
        }),
    );
  }

  // Sets: gleiche Regel wie bei den Karten. Gelöschte Sets speichern keine Daten.
  // Ein Set, das die Grenzen sprengt, wird übersprungen. Karten, Einstellungen und die anderen Sets gehen durch.
  // Früher lehnte der Server dann die ganze Anfrage ab, und das Gerät glich nie wieder ab.
  const validSets: z.infer<typeof setSchema>[] = [];
  let rejectedSets = 0;
  for (const raw of body.sets ?? []) {
    const parsed = setSchema.safeParse(raw);
    if (parsed.success) validSets.push(parsed.data);
    else rejectedSets++;
  }
  if (rejectedSets > 0) console.log(`Abgleich: ${rejectedSets} ungültige Sets übersprungen.`);

  const latestSets = new Map<string, z.infer<typeof setSchema>>();
  for (const set of validSets) {
    const known = latestSets.get(set.id);
    if (!known || set.t >= known.t) latestSets.set(set.id, set);
  }
  const incomingSets = [...latestSets.values()];

  for (let i = 0; i < incomingSets.length; i += SETS_PER_STATEMENT) {
    const rows = incomingSets.slice(i, i + SETS_PER_STATEMENT).map((set) => ({
      userId,
      setId: set.id,
      data: set.deleted || !set.data ? null : JSON.stringify(set.data),
      deleted: set.deleted,
      t: set.t,
      updatedAt: now,
    }));

    statements.push(
      db
        .insert(schema.sets)
        .values(rows)
        .onConflictDoUpdate({
          target: [schema.sets.userId, schema.sets.setId],
          set: {
            data: sql`excluded.data`,
            deleted: sql`excluded.deleted`,
            t: sql`excluded.t`,
            updatedAt: sql`excluded.updated_at`,
          },
          setWhere: sql`excluded.t >= ${schema.sets.t}`,
        }),
    );
  }

  for (let i = 0; i < statements.length; i += STATEMENTS_PER_BATCH) {
    const chunk = statements.slice(i, i + STATEMENTS_PER_BATCH);
    await db.batch(chunk as unknown as [(typeof statements)[number]]);
  }

  // Gelesen wird erst nach dem Schreiben, damit der Client den eigenen Stand zurückbekommt.
  const cardRows = await db
    .select({
      id: schema.cards.itemId,
      box: schema.cards.box,
      due: schema.cards.due,
      seen: schema.cards.seen,
      t: schema.cards.t,
    })
    .from(schema.cards)
    .where(and(eq(schema.cards.userId, userId), gte(schema.cards.updatedAt, body.since)));

  const metaRows = await db
    .select({ data: schema.userMeta.data, t: schema.userMeta.t })
    .from(schema.userMeta)
    .where(and(eq(schema.userMeta.userId, userId), gte(schema.userMeta.updatedAt, body.since)))
    .limit(1);

  const metaRow = metaRows[0];

  const setRows = await db
    .select({
      id: schema.sets.setId,
      t: schema.sets.t,
      deleted: schema.sets.deleted,
      data: schema.sets.data,
    })
    .from(schema.sets)
    .where(and(eq(schema.sets.userId, userId), gte(schema.sets.updatedAt, body.since)));

  return context.json({
    now,
    cards: cardRows,
    sets: setRows.map((row) => ({
      id: row.id,
      t: row.t,
      deleted: row.deleted,
      data: row.data ? (JSON.parse(row.data) as unknown) : null,
    })),
    meta: metaRow ? { data: JSON.parse(metaRow.data) as unknown, t: metaRow.t } : null,
  });
});
