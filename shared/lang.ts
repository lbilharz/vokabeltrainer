/**
 * Die Sprachen, die ein Kind lernen kann, und was an den Regeln von der Sprache abhängt.
 *
 * Jede Lektion hat genau eine Sprache. Fehlt die Angabe, ist es Französisch.
 * So bleiben alle Lektionen aus der Zeit vor dem Englischen gültig.
 */
import type { Foreign, Lang } from "./types";

export const FOREIGN = ["fr", "en"] as const satisfies readonly Foreign[];

export const DEFAULT_FOREIGN: Foreign = "fr";

/** Liest eine Sprache aus fremden Daten. Alles Unbekannte ist Französisch. */
export function foreignOf(value: unknown): Foreign {
  return value === "en" ? "en" : DEFAULT_FOREIGN;
}

/** So heißt die Sprache in der App. */
export const LANG_NAME: Record<Foreign, string> = { fr: "Französisch", en: "Englisch" };

/** Kennung für die Stimme des Geräts. Englisch ist britisch, wie im Schulbuch. */
export const LOCALE: Record<Lang, string> = { fr: "fr-FR", en: "en-GB", de: "de-DE" };

/**
 * Die Sprache als Wort vor einer Zeile, zum Beispiel "Englisch · gestern fotografiert".
 * Sie steht nur da, wenn ein Kind mehr als eine Sprache lernt. Sonst wäre sie Lärm.
 */
export function withLang(line: string | null, lang: Foreign, all: readonly Foreign[]): string | null {
  if (new Set(all).size < 2) return line;
  // Hinter dem Punkt geht der Satz klein weiter: "Englisch · gestern fotografiert".
  return line ? `${LANG_NAME[lang]} · ${line.charAt(0).toLowerCase()}${line.slice(1)}` : LANG_NAME[lang];
}

export interface LangRules {
  /**
   * Der Artikel am Anfang, wenn er zum Wort gehört und gelernt werden muss.
   * Im Französischen zeigt er das Geschlecht. Fehlt er, gibt es einen Hinweis und einen zweiten Versuch.
   * null: die Sprache kennt das nicht.
   */
  article: RegExp | null;
  /** Der Artikel kann mit dem Wort verschmelzen: l'amour. */
  elision: boolean;
  /**
   * Ein Anfang, der beim Vergleich keine Rolle spielt.
   * Im Englischen steht ein Verb mal als "go", mal als "to go". Beides gilt.
   */
  optionalLead: RegExp | null;
  /**
   * Ausgeschriebene Platzhalter. Das Buch schreibt "ask sb", das Kind schreibt vielleicht "ask somebody".
   * Beim Vergleich fallen sie weg, so wie die Kürzel aus dem Buch.
   */
  spelledOut: RegExp | null;
  /** Wörter ohne eigene Bedeutung für den Vergleich zweier Formen: Artikel und Pronomen. */
  functionWords: ReadonlySet<string>;
}

export const RULES: Record<Foreign, LangRules> = {
  fr: {
    article: /^(le|la|les|un|une) /,
    elision: true,
    optionalLead: null,
    spelledOut: null,
    functionWords: new Set([
      "le", "la", "les", "un", "une", "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
    ]),
  },
  en: {
    article: null,
    elision: false,
    optionalLead: /^(to|the|a|an) /,
    spelledOut: /\b(somebody|someone|something)\b/g,
    functionWords: new Set(["the", "a", "an", "to", "i", "you", "he", "she", "it", "we", "they"]),
  },
};
