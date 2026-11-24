import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import { audio } from "./audio";
import { auth } from "./auth";
import { check } from "./check";
import { extract } from "./extract";
import { push, runReminders } from "./push";
import { sync } from "./sync";
import { APP_VERSION, VERSION_HEADER } from "../shared/version";

const app = new Hono<{ Bindings: Env }>();

/*
 * Schutz-Header für alle Antworten der API. Die Seiten selbst bekommen ihre Header aus public/_headers.
 * Die API liefert nur Daten. Sie darf nirgends eingebettet werden und lädt selbst nichts nach.
 */
app.use(
  "/api/*",
  secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    strictTransportSecurity: "max-age=31536000",
    xFrameOptions: "DENY",
    referrerPolicy: "no-referrer",
  }),
);

/*
 * Schreibende Anfragen müssen von der eigenen Seite kommen und JSON schicken.
 *
 * Der Sitzungs-Cookie ist SameSite=Lax. Das hält fremde Seiten schon ab. Diese Prüfung ist die zweite Sicherung:
 * Ein Browser nennt bei jeder schreibenden Anfrage ihre Herkunft. Stimmt sie nicht, wird abgelehnt.
 * Programme ohne Browser schicken keine Herkunft. Sie haben auch keinen fremden Cookie dabei.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
app.use("/api/*", async (context, next) => {
  if (SAFE_METHODS.has(context.req.method)) return next();

  const origin = context.req.header("origin");
  if (origin !== undefined && origin !== new URL(context.req.url).origin) {
    throw new HTTPException(403, { message: "Diese Anfrage kommt nicht von der App." });
  }
  const site = context.req.header("sec-fetch-site");
  if (site !== undefined && site !== "same-origin" && site !== "none") {
    throw new HTTPException(403, { message: "Diese Anfrage kommt nicht von der App." });
  }
  const type = (context.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") {
    throw new HTTPException(415, { message: "Bitte lade die Seite neu und versuch es noch einmal." });
  }
  return next();
});

/*
 * Obergrenze für die Größe einer Anfrage. Ohne sie liest der Server beliebig viel, bevor er prüft.
 * Das Fotolesen hat eine eigene, größere Grenze (worker/extract.ts).
 */
const limitBody = bodyLimit({
  maxSize: 4 * 1024 * 1024,
  onError: (context) => context.json({ error: "Die Anfrage ist zu groß." }, 413),
});
app.use("/api/*", (context, next) => (context.req.path === "/api/extract" ? next() : limitBody(context, next)));

/*
 * Jede Antwort nennt die Version des Servers. Daran merkt die App, dass es eine neuere gibt.
 * Fragt eine andere Version an, steht das im Log. Das hilft bei der Fehlersuche.
 * Der Header kommt von aussen. Ins Log gelangt er nur, wenn er wie eine Version aussieht.
 */
const VERSION_SHAPE = /^[\w.]{1,20}$/;
app.use("/api/*", async (context, next) => {
  await next();
  context.header(VERSION_HEADER, APP_VERSION);
  const client = context.req.header(VERSION_HEADER);
  if (client !== undefined && client !== APP_VERSION && VERSION_SHAPE.test(client)) {
    console.log(`Andere Version fragt an: ${client}, hier läuft ${APP_VERSION}. ${context.req.method} ${context.req.path}`);
  }
});

app.route("/api", sync);
app.route("/api", extract);
app.route("/api", check);
app.route("/api", audio);
app.route("/api", push);
app.route("/api/auth", auth);

app.onError((error, context) => {
  if (error instanceof HTTPException) {
    return context.json({ error: error.message }, error.status);
  }
  if (error instanceof ZodError) {
    return context.json({ error: "Ungültige Anfrage." }, 400);
  }

  // Kaputtes JSON in der Anfrage ist kein Serverfehler.
  if (error instanceof SyntaxError) {
    return context.json({ error: "Ungültige Anfrage." }, 400);
  }

  // Absichtlich ohne Details nach aussen.
  console.error(describe(error));
  return context.json({ error: "Interner Fehler." }, 500);
});

/**
 * Ein Fehler als kurze Zeile für das Log.
 *
 * Drizzle hängt an eine gescheiterte Abfrage das SQL und alle Werte an.
 * Darin können Sitzungskennungen und Vokabeln stehen. Die gehören nicht ins Log.
 */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return "Unbekannter Fehler";
  const message = error.message.startsWith("Failed query") ? "Abfrage gescheitert" : error.message;
  const cause = error.cause instanceof Error ? ` (${error.cause.message.slice(0, 200)})` : "";
  return `${error.name}: ${message.slice(0, 200)}${cause}`;
}

export default {
  fetch: app.fetch,
  // Der Cron läuft alle 15 Minuten. Die Arbeit läuft weiter, auch wenn der Handler schon zurück ist.
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runReminders(new Date(), env));
  },
} satisfies ExportedHandler<Env>;
