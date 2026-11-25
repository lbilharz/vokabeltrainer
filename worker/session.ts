import { eq, gt, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import * as schema from "./db/schema";

export const COOKIE = "travok_session";
export const LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  userId: string;
  displayName: string;
}

export type Database = DrizzleD1Database<typeof schema>;

export async function startSession(
  context: Context,
  db: Database,
  userId: string,
): Promise<void> {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + LIFETIME_MS);

  await db.insert(schema.sessions).values({ id, userId, expiresAt });

  setCookie(context, COOKIE, id, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(LIFETIME_MS / 1000),
    // Auf http://localhost lehnt Safari ein Secure-Cookie ab, deshalb erst ab https.
    secure: new URL(context.req.url).protocol === "https:",
  });
}

export async function endSession(context: Context, db: Database): Promise<void> {
  const id = getCookie(context, COOKIE);
  if (id) await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
  deleteCookie(context, COOKIE, { path: "/" });
}

export async function readSession(
  context: Context,
  db: Database,
): Promise<SessionUser | null> {
  const id = getCookie(context, COOKIE);
  if (!id) return null;

  const rows = await db
    .select({
      userId: schema.users.id,
      displayName: schema.users.displayName,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);

  return rows[0] ?? null;
}

/** Die Sitzung der Anfrage. Ohne gültige Sitzung endet die Anfrage mit 401. */
export async function requireSession(context: Context, db: Database): Promise<SessionUser> {
  const session = await readSession(context, db);
  if (!session) throw new HTTPException(401, { message: "Nicht angemeldet." });
  return session;
}
