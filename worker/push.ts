import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { berlinNow, buildCalendar, shouldRemind } from "../shared/reminder";
import * as schema from "./db/schema";
import { requireSession } from "./session";
import { fromBase64Url, toBase64Url } from "../shared/base64";

export const push = new Hono<{ Bindings: Env }>();

const MAX_PER_RUN = 200;
const TIMEOUT_MS = 10_000;
const TTL_SECONDS = 43_200;
const JWT_LIFETIME_SECONDS = 12 * 60 * 60;
const SUBJECT = "https://vok.cards";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

const NOT_CONFIGURED = { error: "Erinnerungen sind nicht eingerichtet." };

interface Vapid {
  /** Öffentlicher Schlüssel, 65 Byte (0x04 || x || y) als base64url. */
  publicKey: string;
  signingKey: CryptoKey;
}

/** Liest VAPID_JWK. Gibt null zurück, wenn das Secret fehlt oder nicht passt. */
async function loadVapid(env: Env): Promise<Vapid | null> {
  if (!env.VAPID_JWK) return null;
  try {
    const jwk = JSON.parse(env.VAPID_JWK) as Record<string, unknown>;
    const { kty, crv, x, y, d } = jwk;
    if (kty !== "EC" || crv !== "P-256") return null;
    if (typeof x !== "string" || typeof y !== "string" || typeof d !== "string") return null;
    const xBytes = fromBase64Url(x);
    const yBytes = fromBase64Url(y);
    if (xBytes.length !== 32 || yBytes.length !== 32) return null;
    const signingKey = await crypto.subtle.importKey(
      "jwk",
      { kty, crv, x, y, d },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const point = new Uint8Array(65);
    point[0] = 4;
    point.set(xBytes, 1);
    point.set(yBytes, 33);
    return { publicKey: toBase64Url(point), signingKey };
  } catch {
    return null;
  }
}

/** Baut den VAPID-Header für einen Push-Dienst. Das Token wird nie geloggt. */
async function authorization(vapid: Vapid, endpoint: string, nowMs: number): Promise<string> {
  const encoder = new TextEncoder();
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(nowMs / 1000) + JWT_LIFETIME_SECONDS,
        sub: SUBJECT,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  // WebCrypto liefert die Signatur schon als rohes r||s (64 Byte).
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    vapid.signingKey,
    encoder.encode(signingInput),
  );
  return `vapid t=${signingInput}.${toBase64Url(new Uint8Array(signature))}, k=${vapid.publicKey}`;
}

const endpointBody = z.object({ endpoint: z.string().min(1).max(1000) });
const putBody = z.object({
  endpoint: z.string().min(1).max(1000),
  hour: z.number().int().min(0).max(23),
  // Nur Viertelstunden sind erlaubt.
  minute: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(45)]).default(0),
});

/** https ist Pflicht. http://localhost und http://127.0.0.1 nur, wenn die Anfrage selbst von dort kommt. */
function endpointAllowed(endpoint: string, requestUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return LOCAL_HOSTS.has(url.hostname) && LOCAL_HOSTS.has(new URL(requestUrl).hostname);
}

/**
 * Die Erinnerung als Kalendertermin. Dafür speichert der Server nichts.
 * Er liefert nur eine fertige Datei, die der Kalender des Geräts übernimmt.
 */
push.get("/reminder.ics", (context) => {
  const hour = Number(context.req.query("hour") ?? "17");
  const minute = Number(context.req.query("minute") ?? "0");
  return new Response(buildCalendar(Number.isFinite(hour) ? hour : 17, Number.isFinite(minute) ? minute : 0, new Date()), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="vokabeln.ics"',
      "Cache-Control": "no-store",
    },
  });
});

/** Öffentlicher Schlüssel für pushManager.subscribe. Ohne Anmeldung, er ist nicht geheim. */
push.get("/push/key", async (context) => {
  const vapid = await loadVapid(context.env);
  if (!vapid) return context.json(NOT_CONFIGURED, 503);
  return context.json({ key: vapid.publicKey });
});

push.post("/push/state", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const { userId } = await requireSession(context, db);
  const { endpoint } = endpointBody.parse(await context.req.json());

  const rows = await db
    .select({ hour: schema.pushSubscriptions.hour, minute: schema.pushSubscriptions.minute })
    .from(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.userId, userId)))
    .limit(1);
  const row = rows[0];
  return context.json({ enabled: row !== undefined, hour: row?.hour ?? null, minute: row?.minute ?? null });
});

push.put("/push", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const { userId } = await requireSession(context, db);
  const { endpoint, hour, minute } = putBody.parse(await context.req.json());
  if (!endpointAllowed(endpoint, context.req.url)) {
    throw new HTTPException(400, { message: "Ungültige Adresse für Erinnerungen." });
  }

  // Neue Zeile: last_sent_day bleibt null. Vorhandene Zeile: Nutzer, Stunde und Minute ändern, Rest bleibt.
  // Ein Endpunkt eines anderen Nutzers wandert zu diesem Nutzer (gemeinsames Tablet).
  await db
    .insert(schema.pushSubscriptions)
    .values({ id: crypto.randomUUID(), userId, endpoint, hour, minute })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userId, hour, minute },
    });
  return context.json({ ok: true });
});

push.delete("/push", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const { userId } = await requireSession(context, db);
  const { endpoint } = endpointBody.parse(await context.req.json());

  await db
    .delete(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.userId, userId)));
  return context.json({ ok: true });
});

/** Zahl der Vokabeln in den nicht gelöschten Sets. Ein Set mit kaputtem JSON zählt 0. */
function countItems(rows: { data: string | null }[]): number {
  let total = 0;
  for (const row of rows) {
    if (!row.data) continue;
    try {
      const parsed = JSON.parse(row.data) as { items?: unknown };
      if (Array.isArray(parsed.items)) total += parsed.items.length;
    } catch {
      // Kaputtes JSON zählt 0.
    }
  }
  return total;
}

/** Läuft alle 15 Minuten. Sendet leere Web-Push-Nachrichten an Geräte, deren Viertelstunde jetzt ist. */
export async function runReminders(now: Date, env: Env): Promise<void> {
  const vapid = await loadVapid(env);
  if (!vapid) {
    console.log("Erinnerungen: VAPID_JWK fehlt oder ist ungültig, nichts gesendet.");
    return;
  }
  const db = drizzle(env.DB, { schema });
  const { day, hour, minute, dayStartMs } = berlinNow(now);
  const slot = Math.floor(minute / 15) * 15;
  const table = schema.pushSubscriptions;

  const subscriptions = await db
    .select({ id: table.id, userId: table.userId, endpoint: table.endpoint })
    .from(table)
    .where(and(eq(table.hour, hour), eq(table.minute, slot), or(isNull(table.lastSentDay), ne(table.lastSentDay, day))))
    .limit(MAX_PER_RUN);

  const markDone = (id: string) => db.update(table).set({ lastSentDay: day }).where(eq(table.id, id));

  for (const subscription of subscriptions) {
    try {
      const [stats] = await db
        .select({
          dueCount: sql<number>`coalesce(sum(case when ${schema.cards.seen} = 1 and ${schema.cards.due} <= ${day} then 1 else 0 end), 0)`,
          seenCount: sql<number>`coalesce(sum(case when ${schema.cards.seen} = 1 then 1 else 0 end), 0)`,
          lastPracticeMs: sql<number>`coalesce(max(${schema.cards.t}), 0)`,
        })
        .from(schema.cards)
        .where(eq(schema.cards.userId, subscription.userId));
      const setRows = await db
        .select({ data: schema.sets.data })
        .from(schema.sets)
        .where(and(eq(schema.sets.userId, subscription.userId), eq(schema.sets.deleted, false)));

      const remind = shouldRemind({
        dueCount: Number(stats?.dueCount ?? 0),
        seenCount: Number(stats?.seenCount ?? 0),
        itemCount: countItems(setRows),
        lastPracticeMs: Number(stats?.lastPracticeMs ?? 0),
        dayStartMs,
      });
      if (!remind) {
        await markDone(subscription.id);
        continue;
      }

      let status: number | null = null;
      try {
        const response = await fetch(subscription.endpoint, {
          method: "POST",
          headers: {
            TTL: String(TTL_SECONDS),
            Urgency: "normal",
            "Content-Length": "0",
            Authorization: await authorization(vapid, subscription.endpoint, now.getTime()),
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        status = response.status;
        await response.body?.cancel();
      } catch (error) {
        console.error(`Erinnerungen: keine Antwort vom Push-Dienst (${error instanceof Error ? error.name : "Fehler"}).`);
      }

      if (status === 404 || status === 410) {
        await db.delete(table).where(eq(table.id, subscription.id));
        continue;
      }
      if (status !== null && (status < 200 || status >= 300)) {
        console.error(`Erinnerungen: Push-Dienst antwortet mit HTTP ${status}.`);
      }
      // Bei Erfolg und bei Fehlern gleich: heute nicht noch einmal versuchen.
      await markDone(subscription.id);
    } catch (error) {
      console.error(`Erinnerungen: Abo übersprungen (${error instanceof Error ? error.name : "Fehler"}).`);
    }
  }
}
