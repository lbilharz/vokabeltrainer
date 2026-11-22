import type { Lang } from "./types";

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

// Antwort vergleichbar machen: klein, ohne Satzzeichen und Auslassungspunkte.
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.\.\.|…/g, "")
    .replace(/[.,!?;:«»"'’‘]/g, "") // ’ ist der Apostroph der iPhone-Tastatur
    .replace(/\s+/g, " ")
    .trim();
}

// Platzhalter weglassen: qn/qc, + inf., jdn/etw., (à qn), (sich)
export function stripPlaceholders(s: string): string {
  return s
    .replace(/\([^)]*\)/g, " ")
    .replace(/\+\s*inf\.?/g, " ")
    .replace(/\bqn\/qc\b|\bqn\b|\bqc\b/g, " ")
    .replace(/\b(jdn|jdm|jds|etw)\.?(\/(jdn|jdm|jds|etw)\.?)*/g, " ")
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

// Richtig, wenn die Antwort zu mindestens einem Ziel passt.
export function isCorrect(answer: string, targets: string[]): boolean {
  const a = norm(answer);
  if (!a) return false;
  return targets.some((t) => acceptedAnswers(t).has(a));
}
