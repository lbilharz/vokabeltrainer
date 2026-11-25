import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { and, count, eq, gt, lt } from "drizzle-orm";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";
import { fromBase64Url, toBase64Url } from "../shared/base64";
import * as schema from "./db/schema";
import { endSession, readSession, requireSession, startSession, type Database } from "./session";

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;

export const auth = new Hono<{ Bindings: Env }>();


/**
 * RP ID und Origin kommen aus der Anfrage, nicht aus der Konfiguration.
 *
 * Damit laufen localhost, die workers.dev-Adresse und ein Tunnel ohne Umbau.
 * Der Preis ist, dass die RP ID an der Adresse hängt: ein Domainwechsel macht
 * alle vorhandenen Passkeys wertlos.
 */
function relyingParty(url: string): { rpID: string; origin: string } {
  const parsed = new URL(url);
  return { rpID: parsed.hostname, origin: parsed.origin };
}

async function userExists(db: Database): Promise<boolean> {
  const rows = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  return rows.length > 0;
}

async function countUsers(db: Database): Promise<number> {
  const rows = await db.select({ n: count() }).from(schema.users);
  return rows[0]?.n ?? 0;
}

/**
 * Obergrenze für Konten.
 *
 * Der Code ist ein Wort und damit erratbar. Die Grenze begrenzt den Schaden:
 * selbst wer ihn kennt, kann nicht beliebig viele Konten anlegen.
 */
const MAX_USERS = 6;

const fold = (value: string) => value.trim().toLowerCase();

/**
 * Ist überhaupt Platz für ein Konto?
 *
 * Die Registrierung ist der einzige Endpunkt, der keine Anmeldung verlangen kann:
 * einen Passkey hat man vorher ja nicht. Auf einer öffentlichen Adresse braucht
 * sie deshalb eine andere Bremse.
 *
 * Ohne SIGNUP_CODE gilt die einfache Regel, damit ein frisches Deployment ohne
 * Vorbereitung startet: das erste Konto ist frei, danach ist zu. Mit Code zählt
 * nur die Obergrenze.
 *
 * Läuft zweimal, beim Ausstellen der Challenge und beim Einlösen. Dazwischen
 * liegt eine Face-ID-Abfrage, also reichlich Zeit für einen zweiten Anlauf.
 */
async function guardSignupRoom(context: Context<{ Bindings: Env }>, db: Database) {
  if (!context.env.SIGNUP_CODE?.trim()) {
    if (await userExists(db)) {
      throw new HTTPException(409, { message: "Es gibt bereits ein Konto." });
    }
    return;
  }

  if ((await countUsers(db)) >= MAX_USERS) {
    throw new HTTPException(409, { message: "Hier ist kein Platz für ein weiteres Konto." });
  }
}

/**
 * Der Code, falls einer gesetzt ist.
 *
 * Nur beim Ausstellen der Challenge nötig. Beim Einlösen ist er schon bewiesen,
 * denn die Challenge gilt genau einmal und entsteht nur nach dieser Prüfung.
 */
function guardSignupCode(context: Context<{ Bindings: Env }>, code?: string) {
  const expected = context.env.SIGNUP_CODE?.trim() ?? "";
  if (!expected) return;

  if (!code || fold(code) !== fold(expected)) {
    throw new HTTPException(403, { message: "Der Code stimmt nicht." });
  }
}

/** Abgelaufene Challenges wegräumen. Billig genug, um es bei jeder Ausgabe zu tun. */
async function sweepChallenges(db: Database): Promise<void> {
  await db.delete(schema.challenges).where(lt(schema.challenges.expiresAt, new Date()));
}

async function takeChallenge(
  db: Database,
  id: string,
  purpose: "register" | "login" | "add_credential",
): Promise<typeof schema.challenges.$inferSelect> {
  const rows = await db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.id, id),
        eq(schema.challenges.purpose, purpose),
        gt(schema.challenges.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const challenge = rows[0];
  if (!challenge) {
    throw new HTTPException(400, { message: "Challenge unbekannt oder abgelaufen." });
  }

  // Einmalig. Auch bei einem Fehlschlag danach ist sie verbraucht.
  await db.delete(schema.challenges).where(eq(schema.challenges.id, id));
  return challenge;
}

const registerOptionsSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  signupCode: z.string().max(200).optional(),
});

const registerVerifySchema = z.object({
  challengeId: z.string().min(1),
  credential: z.looseObject({ id: z.string().min(1) }),
  label: z.string().min(1).max(40),
});

const loginVerifySchema = z.object({
  challengeId: z.string().min(1),
  credential: z.looseObject({ id: z.string().min(1) }),
});

auth.get("/me", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const session = await readSession(context, db);

  return context.json({
    user: session ? { id: session.userId, displayName: session.displayName } : null,
    // Frisches Deployment, noch niemand da: der Erstanlauf zeigt die Erklärung
    // und das Namensfeld. Wer angemeldet ist, beweist schon, dass es ein Konto gibt.
    registrationOpen: !session && !(await userExists(db)),
    // Ist ein Code gesetzt, kann auch später noch ein Konto dazukommen. Nur dann
    // hat es Sinn, im Anmeldebildschirm darauf hinzuweisen.
    signupCodeRequired: Boolean(context.env.SIGNUP_CODE?.trim()),
  });
});

auth.post("/register/options", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const { rpID } = relyingParty(context.req.url);

  const body = registerOptionsSchema.parse(await context.req.json());

  guardSignupCode(context, body.signupCode);
  await guardSignupRoom(context, db);

  await sweepChallenges(db);

  const userId = crypto.randomUUID();

  const options = await generateRegistrationOptions({
    rpName: "Vokabeltrainer",
    rpID,
    // Der Cast ist nötig, weil TextEncoder in den Worker-Typen ArrayBufferLike liefert.
    userID: new TextEncoder().encode(userId) as Uint8Array<ArrayBuffer>,
    userName: body.displayName,
    userDisplayName: body.displayName,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
    // ES256 zuerst, RS256 als Rückfall. Mehr braucht es nicht.
    supportedAlgorithmIDs: [-7, -257],
  });

  const challengeId = crypto.randomUUID();
  await db.insert(schema.challenges).values({
    id: challengeId,
    value: options.challenge,
    purpose: "register",
    pendingUserId: userId,
    pendingDisplayName: body.displayName,
    expiresAt: new Date(Date.now() + CHALLENGE_LIFETIME_MS),
  });

  return context.json({ challengeId, options });
});

auth.post("/register/verify", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const { rpID, origin } = relyingParty(context.req.url);
  const body = registerVerifySchema.parse(await context.req.json());

  await guardSignupRoom(context, db);

  const challenge = await takeChallenge(db, body.challengeId, "register");

  const verification = await verifyRegistrationResponse({
    response: body.credential as unknown as RegistrationResponseJSON,
    expectedChallenge: challenge.value,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new HTTPException(400, { message: "Passkey konnte nicht verifiziert werden." });
  }

  const { credential } = verification.registrationInfo;
  const userId = challenge.pendingUserId!;
  const displayName = challenge.pendingDisplayName!;

  await db.batch([
    db.insert(schema.users).values({ id: userId, displayName }),
    db.insert(schema.credentials).values({
      id: crypto.randomUUID(),
      userId,
      credentialId: credential.id,
      publicKey: toBase64Url(credential.publicKey),
      signCount: credential.counter,
      label: body.label,
      lastUsedAt: new Date(),
    }),
  ]);

  await startSession(context, db, userId);

  return context.json({ user: { id: userId, displayName } });
});

auth.post("/login/options", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const { rpID } = relyingParty(context.req.url);

  await sweepChallenges(db);

  // Ohne allowCredentials. Der Passkey ist auffindbar, das Gerät bietet also
  // von sich aus an, was passt. Der Server muss vorher nicht wissen, wer kommt.
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });

  const challengeId = crypto.randomUUID();
  await db.insert(schema.challenges).values({
    id: challengeId,
    value: options.challenge,
    purpose: "login",
    expiresAt: new Date(Date.now() + CHALLENGE_LIFETIME_MS),
  });

  return context.json({ challengeId, options });
});

auth.post("/login/verify", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const { rpID, origin } = relyingParty(context.req.url);
  const body = loginVerifySchema.parse(await context.req.json());

  const challenge = await takeChallenge(db, body.challengeId, "login");

  const rows = await db
    .select({
      credential: schema.credentials,
      user: schema.users,
    })
    .from(schema.credentials)
    .innerJoin(schema.users, eq(schema.users.id, schema.credentials.userId))
    .where(eq(schema.credentials.credentialId, body.credential.id))
    .limit(1);

  const row = rows[0];
  if (!row) throw new HTTPException(401, { message: "Passkey ist hier nicht bekannt." });

  const verification = await verifyAuthenticationResponse({
    response: body.credential as unknown as AuthenticationResponseJSON,
    expectedChallenge: challenge.value,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: row.credential.credentialId,
      publicKey: fromBase64Url(row.credential.publicKey),
      counter: row.credential.signCount,
    },
  });

  if (!verification.verified) {
    throw new HTTPException(401, { message: "Passkey konnte nicht verifiziert werden." });
  }

  await db
    .update(schema.credentials)
    .set({ signCount: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(schema.credentials.id, row.credential.id));

  await startSession(context, db, row.user.id);

  return context.json({ user: { id: row.user.id, displayName: row.user.displayName } });
});

/**
 * Die Passkeys des angemeldeten Nutzers, einer pro Gerät.
 *
 * `credentialId` ist die WebAuthn-Kennung. Damit erkennt der Client, welche
 * Zeile das Gerät ist, auf dem er gerade läuft. Kein Geheimnis, der Authenticator
 * gibt sie bei jeder Anmeldung heraus. Der Server merkt sich nicht, mit welchem
 * Passkey eine Sitzung begonnen hat.
 */
auth.get("/credentials", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const session = await requireSession(context, db);

  const rows = await db
    .select({
      id: schema.credentials.id,
      credentialId: schema.credentials.credentialId,
      label: schema.credentials.label,
      createdAt: schema.credentials.createdAt,
      lastUsedAt: schema.credentials.lastUsedAt,
    })
    .from(schema.credentials)
    .where(eq(schema.credentials.userId, session.userId));

  return context.json({
    credentials: rows.map((row) => ({
      id: row.id,
      credentialId: row.credentialId,
      label: row.label,
      createdAt: row.createdAt.getTime(),
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.getTime() : null,
    })),
  });
});

/** Ein weiteres Gerät für dasselbe Konto. */
auth.post("/credentials/options", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const { rpID } = relyingParty(context.req.url);

  const session = await requireSession(context, db);

  await sweepChallenges(db);

  const existing = await db
    .select({ credentialId: schema.credentials.credentialId })
    .from(schema.credentials)
    .where(eq(schema.credentials.userId, session.userId));

  const options = await generateRegistrationOptions({
    rpName: "Vokabeltrainer",
    rpID,
    userID: new TextEncoder().encode(session.userId) as Uint8Array<ArrayBuffer>,
    userName: session.displayName,
    userDisplayName: session.displayName,
    attestationType: "none",
    // Verhindert einen zweiten Passkey auf einem Gerät, das schon einen hat.
    // Der Authenticator lehnt dann mit InvalidStateError ab, und der Client
    // erklärt das als "gibt es hier schon".
    excludeCredentials: existing.map((row) => ({ id: row.credentialId })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    supportedAlgorithmIDs: [-7, -257],
  });

  const challengeId = crypto.randomUUID();
  await db.insert(schema.challenges).values({
    id: challengeId,
    value: options.challenge,
    purpose: "add_credential",
    pendingUserId: session.userId,
    expiresAt: new Date(Date.now() + CHALLENGE_LIFETIME_MS),
  });

  return context.json({ challengeId, options });
});

auth.post("/credentials/verify", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const { rpID, origin } = relyingParty(context.req.url);

  const session = await requireSession(context, db);

  const body = registerVerifySchema.parse(await context.req.json());
  const challenge = await takeChallenge(db, body.challengeId, "add_credential");

  // Die Challenge gehört zu genau diesem Konto. Ohne diese Prüfung könnte
  // eine fremde Sitzung eine offene Challenge einlösen.
  if (challenge.pendingUserId !== session.userId) {
    throw new HTTPException(403, { message: "Challenge gehört zu einem anderen Konto." });
  }

  const verification = await verifyRegistrationResponse({
    response: body.credential as unknown as RegistrationResponseJSON,
    expectedChallenge: challenge.value,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new HTTPException(400, { message: "Passkey konnte nicht verifiziert werden." });
  }

  const { credential } = verification.registrationInfo;

  await db.insert(schema.credentials).values({
    id: crypto.randomUUID(),
    userId: session.userId,
    credentialId: credential.id,
    publicKey: toBase64Url(credential.publicKey),
    signCount: credential.counter,
    label: body.label,
    lastUsedAt: new Date(),
  });

  return context.json({ ok: true, label: body.label });
});

auth.delete("/credentials/:id", async (context) => {
  const db = drizzle(context.env.DB, { schema });
  const session = await requireSession(context, db);

  const rows = await db
    .select({ id: schema.credentials.id })
    .from(schema.credentials)
    .where(eq(schema.credentials.userId, session.userId));

  // Den letzten Passkey zu löschen wäre eine Aussperrung.
  // Das soll niemand aus Versehen auslösen.
  if (rows.length <= 1) {
    throw new HTTPException(409, { message: "Der letzte Passkey kann nicht entfernt werden." });
  }

  const target = context.req.param("id");
  if (!rows.some((row) => row.id === target)) {
    throw new HTTPException(404, { message: "Passkey nicht gefunden." });
  }

  await db.delete(schema.credentials).where(eq(schema.credentials.id, target));
  return context.json({ ok: true });
});

auth.post("/logout", async (context) => {
  await endSession(context, drizzle(context.env.DB, { schema }));
  return context.json({ ok: true });
});
