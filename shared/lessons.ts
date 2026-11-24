import { dateFrom, hasDate } from "./dates";
import { getCard, isMastered } from "./srs";
import type { Item, Progress } from "./types";

/** Das Nötige einer Lektion für die Zahlen. SetView aus der Oberfläche passt hierher. */
export interface LessonLike {
  id: string;
  label: string;
  /** 0 oder fehlend heisst: kein Datum bekannt. */
  createdAt: number;
  items: Item[];
}

export interface Counts {
  total: number;
  /** Mindestens einmal geübt. */
  practised: number;
  /** Sitzt. */
  mastered: number;
}

export function countWords(items: readonly Item[], progress: Progress, today: number): Counts {
  let practised = 0;
  let mastered = 0;
  for (const item of items) {
    const card = getCard(progress, item.id, today);
    if (card.seen) practised++;
    if (isMastered(card)) mastered++;
  }
  return { total: items.length, practised, mastered };
}

export function addCounts(a: Counts, b: Counts): Counts {
  return { total: a.total + b.total, practised: a.practised + b.practised, mastered: a.mastered + b.mastered };
}

/** "53 geübt, 12 sitzen" für den ganzen Wortschatz. */
export function vocabularyLine(c: Counts): string {
  if (c.total > 0 && c.mastered === c.total) return "Alle sitzen";
  return c.mastered > 0 ? `${c.practised} geübt, ${c.mastered} sitzen` : `${c.practised} geübt`;
}

/** "10 von 18 geübt" und bei Bedarf ", 4 sitzen". Für die aktuelle Lektion. */
export function lessonLine(c: Counts): string {
  const base = `${c.practised} von ${c.total} geübt`;
  return c.mastered > 0 ? `${base}, ${c.mastered} sitzen` : base;
}

/** Die Zeile je Lektion in der Liste. Ist alles geübt, zählt sie die Wörter, sonst die offenen. */
export function listLine(c: Counts): string {
  if (c.total > 0 && c.practised === c.total) {
    const words = `${c.total} ${c.total === 1 ? "Wort" : "Wörter"} geübt`;
    if (c.mastered === c.total) return `${words}, alle sitzen`;
    return c.mastered > 0 ? `${words}, ${c.mastered} sitzen` : words;
  }
  if (c.practised === 0) return `0 von ${c.total} geübt`;
  return `${c.practised} von ${c.total} geübt. ${c.total - c.practised} offen`;
}

export interface Open {
  lesson: LessonLike;
  /** Ungesehene Wörter. */
  open: number;
}

/** Andere Lektionen, in denen noch ungesehene Wörter liegen. Die Reihenfolge von `lessons` bleibt. */
export function openLessons(
  lessons: readonly LessonLike[],
  activeId: string,
  progress: Progress,
  today: number,
): Open[] {
  const out: Open[] = [];
  for (const lesson of lessons) {
    if (lesson.id === activeId) continue;
    const c = countWords(lesson.items, progress, today);
    if (c.total > c.practised) out.push({ lesson, open: c.total - c.practised });
  }
  return out;
}

/**
 * Der Hinweis unter der aktuellen Lektion. Null, wenn nichts offen ist.
 * Eine Lektion: `In „Name“ vom Sonntag sind noch 8 Wörter offen.`
 * Mehrere: `In 2 anderen Lektionen sind noch 14 Wörter offen.`
 */
export function openHint(entries: readonly Open[], now: number): string | null {
  if (entries.length === 0) return null;
  const sum = entries.reduce((n, entry) => n + entry.open, 0);
  const words = sum === 1 ? "ist noch 1 Wort offen" : `sind noch ${sum} Wörter offen`;
  if (entries.length > 1) return `In ${entries.length} anderen Lektionen ${words}.`;
  const { lesson } = entries[0]!;
  const date = hasDate(lesson.createdAt) ? ` ${dateFrom(lesson.createdAt, now)}` : "";
  return `In „${lesson.label}“${date} ${words}.`;
}
