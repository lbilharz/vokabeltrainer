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
  }
}

export {};
