import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "./db/schema";
import { readSession } from "./session";

export const sync = new Hono<{ Bindings: Env }>();

/**
 * D1 erlaubt höchstens 100 gebundene Werte pro Statement.
 * Eine Karte braucht 7. Mit 12 Karten je Statement sind es 84 Werte.
 */
const CARDS_PER_STATEMENT = 12;

/** So viele Statements gehen in einen db.batch. Ein Batch ist eine Transaktion. */
const STATEMENTS_PER_BATCH = 40;

/** Obergrenze für den JSON-Text der Einstellungen, in Zeichen. */
const MAX_META_CHARS = 100_000;

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

  return context.json({
    now,
    cards: cardRows,
    meta: metaRow ? { data: JSON.parse(metaRow.data) as unknown, t: metaRow.t } : null,
  });
});
