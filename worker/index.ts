import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
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
 * Jede Antwort nennt die Version des Servers. Daran merkt die App, dass es eine neuere gibt.
 * Fragt eine andere Version an, steht das im Log. Das hilft bei der Fehlersuche.
 */
app.use("/api/*", async (context, next) => {
  await next();
  context.header(VERSION_HEADER, APP_VERSION);
  const client = context.req.header(VERSION_HEADER);
  if (client !== APP_VERSION) {
    console.log(
      `Andere Version fragt an: ${client ?? "ohne Angabe"}, hier läuft ${APP_VERSION}. ${context.req.method} ${context.req.path}`,
    );
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

  // Absichtlich ohne Details nach aussen. Der Stack gehört ins Log, nicht in die Antwort.
  console.error(error);
  return context.json({ error: "Interner Fehler." }, 500);
});

export default {
  fetch: app.fetch,
  // Der Cron läuft alle 15 Minuten. Die Arbeit läuft weiter, auch wenn der Handler schon zurück ist.
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runReminders(new Date(), env));
  },
} satisfies ExportedHandler<Env>;
