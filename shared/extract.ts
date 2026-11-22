import { norm } from "./text";

/** Ein Eintrag, wie das Bildmodell ihn liest. */
export interface ReadItem {
  c: string | null;
  fr: string;
  de: string;
  n: string | null;
}

/** Ein Eintrag nach dem Vergleich zweier Lesungen. `check` heißt: bitte prüfen. */
export interface MergedItem extends ReadItem {
  check: boolean;
}

/** Vergleichsschlüssel. Leerzeichen um den Schrägstrich spielen keine Rolle. */
function key(s: string): string {
  return norm(s.replace(/\s*\/\s*/g, "/"));
}

/** Pro Stichwort zählt nur das erste Vorkommen. */
function dedupe(items: ReadItem[]): { item: ReadItem; k: string }[] {
  const seen = new Set<string>();
  const out: { item: ReadItem; k: string }[] = [];
  for (const item of items) {
    const k = key(item.fr);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ item, k });
  }
  return out;
}

/**
 * Führt zwei Lesungen derselben Seite zusammen.
 *
 * Die Reihenfolge folgt Lesung a. Einträge, bei denen beide Lesungen
 * übereinstimmen, sind sicher. Alle anderen bekommen `check: true`.
 * Einträge, die nur Lesung b hat, kommen hinter den letzten gemeinsamen
 * Vorgänger aus b. Gibt es keinen, kommen sie an den Anfang.
 */
export function mergeReadings(a: ReadItem[], b: ReadItem[]): MergedItem[] {
  const listA = dedupe(a);
  const listB = dedupe(b);
  const inA = new Set(listA.map((e) => e.k));
  const mapB = new Map(listB.map((e) => [e.k, e.item]));

  // Nur in b vorhandene Einträge, gruppiert nach dem Anker aus a. null heißt: Anfang.
  const extras = new Map<string | null, MergedItem[]>();
  let anchor: string | null = null;
  for (const { item, k } of listB) {
    if (inA.has(k)) {
      anchor = k;
      continue;
    }
    const group = extras.get(anchor) ?? [];
    group.push({ ...item, check: true });
    extras.set(anchor, group);
  }

  const result: MergedItem[] = [...(extras.get(null) ?? [])];
  for (const { item, k } of listA) {
    const other = mapB.get(k);
    if (other && key(other.de) === key(item.de)) {
      result.push({ ...item, c: item.c ?? other.c, n: item.n ?? other.n, check: false });
    } else {
      result.push({ ...item, check: true });
    }
    result.push(...(extras.get(k) ?? []));
  }
  return result;
}

/** Liest einen JSON-String ab Position `start` (dort steht das öffnende Anführungszeichen). */
function readJsonString(text: string, start: number): { value: string; end: number } | null {
  let value = "";
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"') return { value, end: i + 1 };
    if (ch !== "\\") {
      value += ch;
      i++;
      continue;
    }
    const next = text[i + 1];
    if (next === undefined) return null; // Escape ist noch nicht ganz da.
    if (next === "u") {
      const hex = text.slice(i + 2, i + 6);
      if (hex.length < 4) return null; // \uXXXX ist noch nicht ganz da.
      const code = /^[0-9a-fA-F]{4}$/.test(hex) ? parseInt(hex, 16) : 0xfffd;
      value += String.fromCharCode(code);
      i += 6;
      continue;
    }
    const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };
    value += simple[next] ?? next; // \" \\ \/ und alles Unbekannte bleibt das Zeichen selbst.
    i += 2;
  }
  return null;
}

/** Zieht die schon vollständig angekommenen französischen Stichwörter aus einem angefangenen JSON-Text. */
export function partialWords(text: string): string[] {
  const words: string[] = [];
  try {
    const skipSpace = (from: number) => {
      let i = from;
      while (i < text.length && /\s/.test(text[i]!)) i++;
      return i;
    };
    let pos = 0;
    while (pos < text.length) {
      if (text[pos] !== '"') {
        pos++;
        continue;
      }
      // Jeder String wird ganz gelesen. So hält ein Wert nie als Schlüssel her.
      const token = readJsonString(text, pos);
      if (!token) break;
      pos = token.end;
      const colon = skipSpace(pos);
      if (text[colon] !== ":") continue;
      if (token.value !== "fr") continue;
      const open = skipSpace(colon + 1);
      if (text[open] !== '"') continue;
      const word = readJsonString(text, open);
      if (!word) break;
      words.push(word.value);
      pos = word.end;
    }
  } catch {
    // Nie werfen. Was schon gefunden ist, bleibt gültig.
  }
  return words;
}
