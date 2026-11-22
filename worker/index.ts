import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { audio } from "./audio";
import { auth } from "./auth";
import { extract } from "./extract";
import { sync } from "./sync";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", sync);
app.route("/api", extract);
app.route("/api", audio);
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
} satisfies ExportedHandler<Env>;
