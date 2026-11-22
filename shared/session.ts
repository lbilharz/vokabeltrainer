import { getCard, isDue } from "./srs";
import { norm } from "./text";
import type { CardState, Item, Progress } from "./types";

/**
 * Aufgabenarten.
 * intro: neues Wort sehen und hören, deutsche Bedeutung wählen.
 * type: deutsches Wort sehen, französisch tippen.
 * listenChoice: nur hören, deutsche Bedeutung wählen.
 * listenType: nur hören, französisch tippen.
 */
export type ExerciseKind = "intro" | "type" | "listenChoice" | "listenType";

export interface Step {
  itemId: string;
  kind: ExerciseKind;
  /** Vier deutsche Antworten, nur bei intro und listenChoice. */
  options?: string[];
}

/** Zufallsquelle zum Austauschen im Test. Liefert Werte von 0 bis unter 1. */
export type Random = () => number;

export interface SetItems {
  id: string;
  items: Item[];
}

/** So viele Wiederholungen kommen höchstens in eine Runde "Heute". */
export const REVIEW_LIMIT = 10;
/** So viele neue Karten kommen höchstens in eine Runde "Heute". */
export const NEW_PER_ROUND = 5;
/** So viele neue Karten bietet "Heute" pro Tag an. Stationen sind davon frei. */
export const NEW_PER_DAY = 10;

export function shuffle<T>(xs: readonly T[], random: Random): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Wählt die Aufgabenart nach dem Lernstand. Hör-Aufgaben nur, wenn sie an sind. */
export function pickKind(card: CardState, listen: boolean, random: Random): ExerciseKind {
  if (!card.seen) return "intro";
  if (!listen || random() < 0.5) return "type";
  return card.box >= 3 ? "listenType" : "listenChoice";
}

/** Vier deutsche Antworten: die richtige und drei falsche, bevorzugt aus demselben Abschnitt. */
export function buildOptions(item: Item, pool: readonly Item[], random: Random): string[] {
  const right = norm(item.de);
  const seen = new Set([right]);
  const wrong: string[] = [];
  const take = (candidates: readonly Item[]) => {
    for (const other of shuffle(candidates, random)) {
      if (wrong.length >= 3) return;
      const key = norm(other.de);
      if (seen.has(key)) continue;
      seen.add(key);
      wrong.push(other.de);
    }
  };
  take(pool.filter((other) => other.c === item.c));
  take(pool);
  return shuffle([item.de, ...wrong], random);
}

export function makeStep(
  item: Item,
  card: CardState,
  pool: readonly Item[],
  listen: boolean,
  random: Random,
): Step {
  const kind = pickKind(card, listen, random);
  if (kind === "intro" || kind === "listenChoice") {
    return { itemId: item.id, kind, options: buildOptions(item, pool, random) };
  }
  return { itemId: item.id, kind };
}

/**
 * Alle französischen Lösungen, die zur deutschen Seite passen.
 * Zwei Einträge können dieselbe Übersetzung haben. Dann gilt jede davon als richtig.
 */
export function targetsFor(item: Item, pool: readonly Item[]): string[] {
  const de = norm(item.de);
  const out = [item.fr];
  for (const other of pool) {
    if (other.id !== item.id && norm(other.de) === de) out.push(other.fr);
  }
  return out;
}

export interface TodayPlan {
  /** Fällige Karten aus allen Sets, älteste zuerst, höchstens REVIEW_LIMIT. */
  dueIds: string[];
  /** Neue Karten aus dem aktiven Set in Buchreihenfolge. */
  newIds: string[];
  /** Alle fälligen Karten, auch die über dem Limit. */
  dueTotal: number;
}

export function planToday(
  sets: readonly SetItems[],
  activeSetId: string,
  progress: Progress,
  today: number,
  newLeft: number,
): TodayPlan {
  const due: { id: string; card: CardState }[] = [];
  for (const set of sets) {
    for (const item of set.items) {
      const card = getCard(progress, item.id, today);
      if (isDue(card, today)) due.push({ id: item.id, card });
    }
  }
  due.sort((a, b) => a.card.due - b.card.due || a.card.box - b.card.box);

  const active = sets.find((set) => set.id === activeSetId);
  const limit = Math.max(0, Math.min(newLeft, NEW_PER_ROUND));
  const newIds = (active?.items ?? [])
    .filter((item) => !getCard(progress, item.id, today).seen)
    .slice(0, limit)
    .map((item) => item.id);

  return { dueIds: due.slice(0, REVIEW_LIMIT).map((d) => d.id), newIds, dueTotal: due.length };
}

/** Zählt gesehene Karten, die bis einschliesslich `day` fällig sind. */
export function countDueBy(sets: readonly SetItems[], progress: Progress, day: number): number {
  let n = 0;
  for (const set of sets) {
    for (const item of set.items) {
      const card = progress[item.id];
      if (card?.seen && card.due <= day) n++;
    }
  }
  return n;
}
