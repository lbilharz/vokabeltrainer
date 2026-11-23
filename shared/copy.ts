/**
 * Abschreiben: das Kind sieht das Wort und tippt es Buchstabe für Buchstabe.
 *
 * Ein falscher Buchstabe wird nicht angenommen. So steht am Ende sicher das richtige Wort da.
 * Getippt werden nur Buchstaben, Apostroph, Bindestrich und die Lücken zwischen Wörtern.
 * Satzzeichen und Schrägstriche setzt die App selbst.
 */
import { editDistance, fold, norm, stripPlaceholders } from "./text";

export interface Slot {
  ch: string;
  /** true: die App setzt das Zeichen selbst. Das Kind tippt es nicht. */
  given: boolean;
  /** true: eine Lücke im Lückenwort. Das Zeichen bleibt verborgen, bis es getippt ist. */
  hidden?: boolean;
}

const APOSTROPHES = "'’‘ʼ´`";

function isLetter(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch);
}

function isLetterLike(ch: string): boolean {
  return isLetter(ch) || ch === "-" || APOSTROPHES.includes(ch);
}

/**
 * Der Text zum Abschreiben. Platzhalter wie qn/qc fallen weg.
 * Stehen zwei Sätze mit " / " nebeneinander, reicht der erste.
 */
export function copyTarget(fr: string): string {
  const first = stripPlaceholders(fr).split(/\s+\/\s+/)[0] ?? "";
  return first.replace(/\s+/g, " ").trim();
}

/** Zerlegt den Text in Zeichen und markiert, welche das Kind tippt. */
export function copySlots(target: string): Slot[] {
  const chars = [...target];
  const typed = chars.map(isLetterLike);
  return chars.map((ch, i) => {
    if (ch !== " ") return { ch, given: !typed[i] };
    // Eine Lücke tippt das Kind nur zwischen zwei getippten Zeichen. Neben Satzzeichen setzt die App sie.
    return { ch, given: !(typed[i - 1] && typed[i + 1]) };
  });
}

/**
 * Das Lückenwort: "le roman policier" wird zu "__ r____ p_______".
 *
 * Von jedem Wortteil mit drei oder mehr Buchstaben bleibt der erste stehen.
 * Kurze Teile wie "le" oder "à" sind ganz verborgen. So muss das Kind den Artikel selbst wissen.
 * Getippt werden nur die Lücken. Alles andere setzt die App.
 */
export function gapSlots(target: string): Slot[] {
  const slots: Slot[] = [...target].map((ch) => ({ ch, given: true }));
  let start = -1;
  const close = (end: number) => {
    if (start < 0) return;
    for (let i = start; i < end; i++) {
      // Der erste Buchstabe eines längeren Wortteils ist die Starthilfe.
      if (end - start >= 3 && i === start) continue;
      slots[i] = { ch: slots[i]!.ch, given: false, hidden: true };
    }
    start = -1;
  };
  slots.forEach((slot, i) => {
    if (isLetter(slot.ch)) {
      if (start < 0) start = i;
    } else {
      close(i);
    }
  });
  close(slots.length);
  return slots;
}

/** Hat der Text überhaupt Lücken zum Füllen? */
export function hasGaps(fr: string): boolean {
  return gapSlots(copyTarget(fr)).some((slot) => slot.hidden);
}

/**
 * Bewertet ein gefülltes Lückenwort. missed zählt die Lücken, an denen ein falscher Buchstabe kam.
 * Ein einzelner Ausrutscher zählt bei längeren Wörtern noch als richtig, wie ein Tippfehler beim Schreiben.
 */
export function rateGaps(slots: readonly Slot[], missed: number): { correct: boolean; near: boolean } {
  const gaps = slots.filter((slot) => slot.hidden).length;
  if (missed === 0) return { correct: true, near: false };
  if (missed === 1 && gaps >= 4) return { correct: true, near: true };
  return { correct: false, near: false };
}

/** Springt über alle Zeichen, die die App selbst setzt. */
export function skipGiven(slots: readonly Slot[], done: number): number {
  let at = done;
  while (at < slots.length && slots[at]!.given) at++;
  return at;
}

function same(expected: string, got: string): boolean {
  if (APOSTROPHES.includes(expected)) return APOSTROPHES.includes(got);
  // Groß und klein ist egal. Akzente müssen stimmen, darum geht es beim Abschreiben.
  return expected.toLowerCase() === got.toLowerCase();
}

/**
 * Verarbeitet getippte Zeichen ab der Stelle `done`.
 * Gibt die neue Stelle zurück und das erste Zeichen, das nicht gepasst hat.
 */
export function advanceCopy(
  slots: readonly Slot[],
  done: number,
  input: string,
): { done: number; wrong: string | null } {
  let at = skipGiven(slots, done);
  for (const ch of input) {
    if (at >= slots.length) break;
    if (same(slots[at]!.ch, ch)) {
      at = skipGiven(slots, at + 1);
      continue;
    }
    // Eine überzählige Lücke, ein Satzzeichen oder ein Strich ist kein Fehler. Nur Buchstaben zählen.
    if (!isLetter(ch)) continue;
    return { done: at, wrong: ch };
  }
  return { done: at, wrong: null };
}

/**
 * Hat das Kind den Buchstaben ohne Akzent getippt? Dann den Grundbuchstaben zurückgeben.
 * Damit kann die App sagen: "Halte e gedrückt."
 */
export function accentBase(expected: string, got: string): string | null {
  const base = fold(expected.toLowerCase());
  if (base === expected.toLowerCase()) return null;
  return fold(got.toLowerCase()) === base || got.toLowerCase() === base[0] ? base[0]! : null;
}

/**
 * Die Schreibweise, die der Antwort am nächsten kommt.
 * Aus "le gardien / la gardienne" und der Antwort "la gardiene" wird "la gardienne".
 */
export function closestVariant(answer: string, fr: string): string {
  const given = fold(norm(answer));
  const candidates = new Set<string>();
  const base = stripPlaceholders(fr);
  for (const phrase of base.split(/\s+\/\s+/)) {
    candidates.add(phrase.trim());
    let combos = [""];
    for (const token of phrase.trim().split(/\s+/)) {
      const options = token.includes("/") ? token.split("/").filter(Boolean) : [token];
      const next: string[] = [];
      for (const combo of combos) for (const option of options) next.push(combo ? `${combo} ${option}` : option);
      combos = next.slice(0, 64);
    }
    for (const combo of combos) candidates.add(combo);
  }
  let best = base;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const distance = editDistance(given, fold(norm(candidate)), 99);
    // Bei Gleichstand gewinnt die längere Form. Dort lässt sich der fehlende Buchstabe zeigen.
    if (distance < bestDistance || (distance === bestDistance && candidate.length > best.length)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export interface Mark {
  ch: string;
  /** true: an dieser Stelle stand in der Antwort etwas anderes oder nichts. */
  miss: boolean;
}

/**
 * Markiert in der richtigen Schreibweise die Stellen, die in der Antwort nicht stimmten.
 * Satzzeichen und Lücken werden nie markiert.
 */
export function markDiff(answer: string, right: string): Mark[] {
  const a = [...answer.toLowerCase()].filter((ch) => isLetterLike(ch) && !APOSTROPHES.includes(ch));
  const b = [...right];
  const counts = b.map((ch) => isLetterLike(ch) && !APOSTROPHES.includes(ch));
  const key = b.map((ch) => ch.toLowerCase());

  // Längste gemeinsame Folge. Was in der richtigen Schreibweise nicht dazugehört, war falsch.
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = !counts[j]
        ? table[i]![j + 1]!
        : a[i] === key[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const out: Mark[] = [];
  let i = 0;
  for (let j = 0; j < b.length; j++) {
    if (!counts[j]) {
      out.push({ ch: b[j]!, miss: false });
      continue;
    }
    while (i < a.length && a[i] !== key[j] && table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    if (i < a.length && a[i] === key[j]) {
      out.push({ ch: b[j]!, miss: false });
      i++;
    } else {
      out.push({ ch: b[j]!, miss: true });
    }
  }
  return out;
}

/** Wie closestVariant, aber über mehrere richtige Antworten hinweg. */
export function closestOf(answer: string, targets: readonly string[]): string {
  const given = fold(norm(answer));
  let best = targets[0] ?? "";
  let bestDistance = Infinity;
  for (const target of targets) {
    const variant = closestVariant(answer, target);
    const distance = editDistance(given, fold(norm(variant)), 99);
    if (distance < bestDistance || (distance === bestDistance && variant.length > best.length)) {
      best = variant;
      bestDistance = distance;
    }
  }
  return best;
}
