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
