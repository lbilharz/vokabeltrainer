import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Datenmodell für Konten, Passkeys, Sitzungen und den Lernstand.
 *
 * Es gibt nur eine Art von Konto. Passkeys und Sitzungen hängen direkt am Nutzer.
 */

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const users = sqliteTable("users", {
  id: id(),
  displayName: text("display_name").notNull(),
  createdAt: createdAt(),
});

/** Ein Passkey. Ein Nutzer kann mehrere haben, einen pro Gerät. */
export const credentials = sqliteTable(
  "credentials",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** WebAuthn Credential ID, Base64URL. */
    credentialId: text("credential_id").notNull().unique(),
    publicKey: text("public_key").notNull(),
    signCount: integer("sign_count").notNull().default(0),
    label: text("label").notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (table) => [index("credentials_user_idx").on(table.userId)],
);

/**
 * Offene WebAuthn-Challenge.
 *
 * Bei der Registrierung stehen hier auch die künftige ID und der Name. Die Zeile
 * in users entsteht erst, wenn der Passkey wirklich verifiziert ist.
 * Sonst blockiert ein abgebrochener Versuch die Erstanmeldung dauerhaft.
 */
export const challenges = sqliteTable("challenges", {
  id: id(),
  value: text("value").notNull(),
  purpose: text("purpose", {
    enum: ["register", "login", "add_credential"],
  }).notNull(),
  pendingUserId: text("pending_user_id"),
  pendingDisplayName: text("pending_display_name"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
});

/**
 * Sitzung als undurchsichtiges Token in einem HttpOnly-Cookie.
 *
 * Bewusst kein JWT. Ein Token in der Datenbank braucht kein Signaturgeheimnis,
 * und Abmelden wirkt sofort statt erst beim Ablauf.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

/**
 * Lernstand einer Karte.
 *
 * `t` ist die Änderungszeit des Clients in ms. Sie entscheidet, welche Fassung
 * gewinnt. `updatedAt` ist die Serverzeit in ms beim Schreiben. Danach fragt
 * der Client, was seit seinem letzten Abgleich neu ist.
 */
export const cards = sqliteTable(
  "cards",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    box: integer("box").notNull(),
    due: integer("due").notNull(),
    seen: integer("seen", { mode: "boolean" }).notNull(),
    t: integer("t").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.itemId] }),
    index("cards_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

/** Die übrigen Einstellungen des Nutzers als ein JSON-Text. Gleiche Regeln wie bei den Karten. */
export const userMeta = sqliteTable("user_meta", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  t: integer("t").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Vokabelsets eines Nutzers. `data` ist der JSON-Text des Sets.
 * Ein gelöschtes Set bleibt als Zeile ohne Daten stehen, damit das Löschen synchronisiert wird.
 * Gleiche Regeln wie bei den Karten: das größere `t` gewinnt.
 */
export const sets = sqliteTable(
  "sets",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    setId: text("set_id").notNull(),
    data: text("data"),
    deleted: integer("deleted", { mode: "boolean" }).notNull(),
    t: integer("t").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.setId] }),
    index("sets_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

/**
 * Allgemeiner Tageszähler für bezahlte Aufrufe.
 *
 * `scope` ist die Nutzer-ID oder "*" für alle Konten zusammen. `kind` nennt den Dienst.
 * Bewusst ohne Fremdschlüssel: die Zeile für alle Konten gehört zu keinem Nutzer.
 */
export const usageLog = sqliteTable(
  "usage_log",
  {
    scope: text("scope").notNull(),
    kind: text("kind").notNull(),
    day: integer("day").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.kind, table.day] })],
);

/**
 * Gemerkte Urteile des Schiedsrichters (worker/judge.ts).
 *
 * `key` ist der SHA-256 der drei Texte. Kein Nutzer steht darin, der Eintrag gilt für alle.
 * `verdict` ist correct, form oder wrong.
 */
export const judgeCache = sqliteTable("judge_cache", {
  key: text("key").primaryKey(),
  verdict: text("verdict").notNull(),
  note: text("note").notNull(),
  createdAt: createdAt(),
});

/**
 * Web-Push-Abo eines Geräts für die tägliche Übungserinnerung.
 *
 * `hour` ist die Stunde in Berlin. `lastSentDay` ist der Berliner Kalendertag
 * (als Tagesnummer), an dem zuletzt geprüft oder gesendet wurde.
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    hour: integer("hour").notNull(),
    minute: integer("minute").notNull().default(0),
    lastSentDay: integer("last_sent_day"),
    createdAt: createdAt(),
  },
  (table) => [index("push_subscriptions_hour_idx").on(table.hour)],
);
