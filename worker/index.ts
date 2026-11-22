import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { audio } from "./audio";
import { auth } from "./auth";
import { extract } from "./extract";
import { push, runReminders } from "./push";
import { sync } from "./sync";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", sync);
app.route("/api", extract);
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
  // Der Cron läuft stündlich. Die Arbeit läuft weiter, auch wenn der Handler schon zurück ist.
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runReminders(new Date(), env));
  },
} satisfies ExportedHandler<Env>;
