/**
 * Bindings, die nicht in wrangler.jsonc stehen.
 *
 * `wrangler types` liest nur die Konfiguration. Secrets stehen dort absichtlich
 * nicht, sonst lägen sie im Repository. Deshalb hier von Hand.
 */
declare global {
  interface Env {
    /**
     * Code fürs Anlegen eines Kontos.
     *
     * Gesetzt mit `wrangler secret put SIGNUP_CODE`, lokal über `.dev.vars`.
     * Ist er nicht gesetzt, gilt die einfache Regel: das erste Konto ist frei,
     * danach ist zu.
     */
    SIGNUP_CODE?: string;
    /**
     * Schlüssel für die Fotoerkennung (Google Gemini).
     *
     * Gesetzt mit `wrangler secret put GEMINI_API_KEY`, lokal über `.dev.vars`.
     * Fehlt er, antwortet /api/extract mit 503.
     */
    GEMINI_API_KEY?: string;
    /**
     * Schlüssel für die Sprachausgabe (ElevenLabs).
     *
     * Gesetzt mit `wrangler secret put ELEVENLABS_API_KEY`, lokal über `.dev.vars`.
     * Fehlt er, rendert /api/audio/ensure nichts und meldet `stopped: "unconfigured"`.
     */
    ELEVENLABS_API_KEY?: string;
  }
}

export {};
