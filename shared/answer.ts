/**
 * Was die Regeln der App zu einer getippten Antwort sagen.
 *
 * Die Reihenfolge ist wichtig: erst richtig, dann fast richtig, dann die zwei Hinweise
 * mit zweitem Versuch, zuletzt falsch. Der Bildschirm setzt das Ergebnis nur noch um.
 */

import { anotherForm } from "./forms";
import { type ExerciseKind, targetsFor } from "./session";
import { closeness, isCorrect, norm } from "./text";
import type { Item } from "./types";

/** Richtig bis auf Akzente oder einen Tippfehler. Zählt als richtig, mit Hinweis. */
export type Near = "accents" | "typo";

export type Ruling =
  /** Nichts getippt. Es wird nichts gewertet. */
  | { type: "empty" }
  | { type: "correct"; near?: Near }
  /** Es fehlt nur der Artikel. Dafür gibt es einen zweiten Versuch. */
  | { type: "articleHint" }
  /** Das richtige Wort in einer anderen Form. `other` ist die andere Karte der Lektion, deren Lösung getippt wurde. */
  | { type: "formHint"; other: Item | null; partial?: boolean }
  /** askJudge: Die Regeln helfen nicht weiter. Der Schiedsrichter darf gefragt werden. */
  | { type: "wrong"; askJudge: boolean };

export interface RulingState {
  kind: ExerciseKind;
  /** Der Hinweis auf den Artikel wurde bei dieser Karte schon gezeigt. */
  articleHinted: boolean;
  /** Der Hinweis auf die Form wurde bei dieser Karte schon gezeigt. */
  formHinted: boolean;
}

export function ruleTyped(typed: string, item: Item, pool: readonly Item[], state: RulingState): Ruling {
  if (!norm(typed)) return { type: "empty" };
  const lang = item.lang;
  const targets = targetsFor(item, pool);
  if (isCorrect(typed, targets, lang)) return { type: "correct" };

  // Wer genau ein anderes Wort aus der Lektion schreibt, hat sich nicht vertippt.
  const otherWord = pool.some((other) => other.id !== item.id && isCorrect(typed, [other.fr], lang));
  const close = otherWord ? null : closeness(typed, targets, lang);
  if (close === "accents" || close === "typo") return { type: "correct", near: close };
  // Der Artikel gehört zum Wort. Fehlt er auch beim zweiten Versuch, ist die Antwort falsch.
  if (close === "article") return state.articleHinted ? { type: "wrong", askJudge: false } : { type: "articleHint" };

  // Nur beim freien Schreiben bekommt eine andere Form einen zweiten Versuch.
  if (state.kind !== "type") return { type: "wrong", askJudge: false };
  const form = state.formHinted ? null : anotherForm(typed, targets, item, pool);
  if (form) return { type: "formHint", other: form.other, ...(form.partial ? { partial: true } : {}) };
  // Ein anderes Wort der Lektion ist einfach falsch. Dafür fragt die App nicht nach.
  return { type: "wrong", askJudge: !otherWord };
}
