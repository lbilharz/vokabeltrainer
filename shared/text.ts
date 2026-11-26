import { RULES } from "./lang";
import type { Foreign, Lang } from "./types";

// FNV-1a, 32 Bit, über UTF-8-Bytes. Muss zu fnv1a() in tools/render_tts.py passen.
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(str)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

// Feste Kennung einer Karte.
export function itemId(setId: string, fr: string): string {
  return `${setId}:${fnv1a(fr)}`;
}

// Text für die Stimme. Platzhalter wie qn/qc werden nicht gesprochen.
// Muss zu say_text() in tools/render_tts.py passen.
export function sayText(s: string, lang: Lang): string {
  if (lang === "fr") {
    s = s
      .replace(/\(à qn\)/g, "")
      .replace(/\+\s*inf\./g, "")
      .replace(/\bqn\/qc\b|\bqc\b|\bqn\b/g, "");
  } else if (lang === "en") {
    s = s
      .replace(/\b(sb|smb)(['’]s)?\b\.?/g, "somebody$2")
      .replace(/\b(sth|smth)\b\.?/g, "something");
  } else {
    s = s
      .replace(/\bjdn\/etw\./g, "jemanden oder etwas")
      .replace(/\bjdm\/etw\./g, "jemandem oder etwas")
      .replace(/\bjdm\b/g, "jemandem")
      .replace(/\bjdn\b/g, "jemanden")
      .replace(/\betw\./g, "etwas")
      .replace(/([A-Za-zÄÖÜäöüß]+)\/in\b/g, "$1, $1in");
  }
  s = s.replace(/[()]/g, ""); // (sich) ändern -> sich ändern
  return s
    .replace(/\s*\/\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,?!])/g, "$1")
    .replace(/(,\s*)+/g, ", ")
    .replace(/^[,\s]+|[,\s]+$/g, "");
}

// Ein Text in eine Zeile: Umbrüche und mehrere Leerzeichen werden zu einem Leerzeichen.
export function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Antwort vergleichbar machen: klein, ohne Satzzeichen und Auslassungspunkte.
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.\.\.|…/g, "")
    .replace(/[.,!?;:«»"'’‘]/g, "") // ’ ist der Apostroph der iPhone-Tastatur
    .replace(/\s+/g, " ")
    .trim();
}

// Platzhalter weglassen: qn/qc, + inf., jdn/etw., (à qn), (sich), sb/sth
export function stripPlaceholders(s: string): string {
  return s
    .replace(/\([^)]*\)/g, " ")
    .replace(/\+\s*inf\.?/g, " ")
    .replace(/\bqn\/qc\b|\bqn\b|\bqc\b/g, " ")
    .replace(/\b(jdn|jdm|jds|etw)\.?(\/(jdn|jdm|jds|etw)\.?)*/g, " ")
    .replace(/\b(sb|sth|smb|smth)(['’]s)?\.?(\/(sb|sth|smb|smth)\.?)*(?!\w)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Alle akzeptierten Antworten: mit und ohne Platzhalter und jede /-Variante einzeln.
export function acceptedAnswers(target: string): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => {
    const n = norm(s);
    if (n) out.add(n);
  };
  for (const base of [target, stripPlaceholders(target)]) {
    add(base);
    // Beide Formen hintereinander, so wie die Aufnahme sie spricht: "italien, italienne".
    add(base.replace(/\s*\/\s*/g, " "));
    for (const phrase of base.split(/\s+\/\s+/)) {
      add(phrase);
      let combos = [""];
      for (const tok of phrase.trim().split(/\s+/)) {
        const opts = tok.includes("/") ? tok.split("/").filter(Boolean) : [tok];
        const next: string[] = [];
        for (const c of combos) for (const o of opts) next.push(c ? c + " " + o : o);
        combos = next.slice(0, 64);
      }
      combos.forEach(add);
    }
  }
  return out;
}

/**
 * Lässt weg, was in dieser Sprache für den Vergleich keine Rolle spielt.
 * Englisch: "to go" wird zu "go", "ask somebody" wird zu "ask". Französisch bleibt, wie es ist.
 */
function relaxed(s: string, lang: Foreign): string {
  const { optionalLead, spelledOut } = RULES[lang];
  let out = s;
  if (spelledOut) out = out.replace(spelledOut, " ").replace(/\s+/g, " ").trim();
  if (optionalLead) out = out.replace(optionalLead, "");
  return out;
}

// Richtig, wenn die Antwort zu mindestens einem Ziel passt.
export function isCorrect(answer: string, targets: string[], lang: Foreign = "fr"): boolean {
  const a = norm(answer);
  if (!a) return false;
  if (targets.some((t) => acceptedAnswers(t).has(a))) return true;
  // Nur Sprachen mit lockeren Regeln vergleichen ein zweites Mal. Französisch bleibt genau wie bisher.
  if (!RULES[lang].optionalLead && !RULES[lang].spelledOut) return false;
  const short = relaxed(a, lang);
  return short !== "" && targets.some((t) => [...acceptedAnswers(t)].some((right) => relaxed(right, lang) === short));
}

/** Warum eine falsche Antwort fast richtig ist. null heisst: nicht nah genug. */
export type Closeness = "accents" | "article" | "typo" | null;

/** Akzente und Ligaturen weg: "découvrir" und "decouvrir" sind danach gleich. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

/**
 * Anzahl der Änderungen, um a in b zu verwandeln.
 * Zwei vertauschte Nachbarbuchstaben zählen als eine Änderung.
 * Bricht ab, sobald es mehr als max sind.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, before[j - 2]! + 1);
      }
      row.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    before = prev;
    prev = row;
  }
  return prev[b.length]!;
}

/** Der Artikel am Anfang, sonst "". */
function articleOf(s: string, article: RegExp | null): string {
  return article?.exec(s)?.[1] ?? "";
}

/**
 * Prüft, ob eine falsche Antwort eine zweite Chance verdient.
 *
 * accents: nur Akzente fehlen oder sind falsch.
 * article: das Wort stimmt, aber der Artikel fehlt.
 * typo: ein Buchstabe ist falsch, bei langen Wörtern höchstens zwei.
 *   Ein falscher Artikel ("la" statt "le") zählt nicht als Tippfehler.
 * Kurze Wörter bekommen keine Nachsicht. "la" und "le" sind zu nah beieinander.
 * Den Hinweis auf den Artikel gibt es nur in Sprachen, in denen er zum Wort gehört (siehe lang.ts).
 */
export function closeness(answer: string, targets: string[], lang: Foreign = "fr"): Closeness {
  const { article, elision } = RULES[lang];
  const given = fold(relaxed(norm(answer), lang));
  if (!given) return null;
  const accepted = new Set<string>();
  for (const target of targets) for (const a of acceptedAnswers(target)) accepted.add(fold(relaxed(a, lang)));
  if (accepted.has(given)) return "accents";

  let typo = false;
  for (const right of accepted) {
    if (article && right.replace(article, "") === given && right !== given) return "article";
    // norm() entfernt den Apostroph. Aus "l'amour" wird "lamour".
    if (elision && right === "l" + given) return "article";
    // "la roman" statt "le roman" ist kein Tippfehler, sondern das falsche Geschlecht.
    if (articleOf(right, article) !== articleOf(given, article)) continue;
    const max = right.length >= 9 ? 2 : right.length >= 4 ? 1 : 0;
    if (max > 0 && editDistance(given, right, max) <= max) typo = true;
  }
  return typo ? "typo" : null;
}
