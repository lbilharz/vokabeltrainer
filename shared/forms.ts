import type { Item } from "./types";
import { acceptedAnswers, closeness, fold, isCorrect, norm, stripPlaceholders } from "./text";

/** Wörter ohne eigene Bedeutung für den Vergleich: Artikel und Personalpronomen. */
const FUNCTION_WORDS = new Set([
  "le", "la", "les", "un", "une", "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
]);

/** So viele Buchstaben müssen zwei Wörter am Anfang teilen, damit sie als Formen desselben Wortes gelten. */
const MIN_PREFIX = 4;

/**
 * Die Inhaltswörter eines Textes: klein, ohne Akzente, ohne Artikel, Pronomen und Platzhalter.
 * "il/elle arrive à + inf." wird zu ["arrive", "a"].
 */
export function contentWords(text: string): string[] {
  const words: string[] = [];
  const cleaned = stripPlaceholders(text).replace(/\b[lj][’']/gi, " "); // l'amour, j'arrive
  for (const token of fold(norm(cleaned)).split(" ")) {
    if (!token) continue;
    // Schrägstrich-Formen wie il/elle fallen weg, wenn alle Teile Funktionswörter sind.
    const parts = token.split("/").filter(Boolean);
    if (parts.every((part) => FUNCTION_WORDS.has(part))) continue;
    words.push(token);
  }
  return words;
}

/** Gleich lang geschriebene Wörter müssen gleich sein. Längere teilen mindestens den Wortanfang. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < MIN_PREFIX || b.length < MIN_PREFIX) return false;
  for (let i = 0; i < MIN_PREFIX; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Alle Inhaltswörter passen paarweise, und es gibt gleich viele. */
function sameWords(answer: string[], variant: string[]): boolean {
  return answer.length > 0 && answer.length === variant.length && answer.every((w, i) => sameWord(w, variant[i]!));
}

export interface AnotherForm {
  /** Die andere Karte der Lektion, deren Lösung das Kind getippt hat. Sonst null. */
  other: Item | null;
}

/**
 * Prüft, ob eine falsche Antwort das richtige Wort in einer anderen Form ist.
 * Beispiel: "arriver à" statt "il/elle arrive à + inf.".
 *
 * Gibt null zurück, wenn die Antwort schon richtig oder fast richtig ist.
 * Dafür gelten die bisherigen Regeln. Gibt auch null zurück, wenn das Wort nicht verwandt ist.
 * pool ist die Lektion. Hat das Kind die Lösung einer anderen Karte getippt, steht sie in `other`.
 */
export function anotherForm(answer: string, targets: string[], item: Item, pool: readonly Item[]): AnotherForm | null {
  if (!norm(answer) || isCorrect(answer, targets) || closeness(answer, targets) !== null) return null;

  const given = contentWords(answer);
  const related = targets.some((target) => {
    // Jede /-Variante einzeln, ohne Platzhalter.
    for (const variant of acceptedAnswers(stripPlaceholders(target))) {
      if (sameWords(given, contentWords(variant))) return true;
    }
    return false;
  });
  if (!related) return null;

  const other = pool.find((card) => card.id !== item.id && isCorrect(answer, [card.fr])) ?? null;
  return { other };
}
