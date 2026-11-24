import { hasGaps } from "./copy";
import { daysLeft, newPerDay } from "./focus";
import { getCard, isDue } from "./srs";
import { norm } from "./text";
import type { CardState, Item, Progress } from "./types";

/**
 * Aufgabenarten.
 * intro: neues Wort sehen und hören, deutsche Bedeutung wählen.
 * gap: deutsches Wort sehen, im französischen Wort die Lücken füllen. Die Starthilfe vor dem freien Schreiben.
 * type: deutsches Wort sehen, französisch tippen.
 * listenChoice: nur hören, deutsche Bedeutung wählen.
 * listenType: nur hören, französisch tippen.
 */
export type ExerciseKind = "intro" | "gap" | "type" | "listenChoice" | "listenType";

/** Bis zu diesem Fach gibt es das Lückenwort. Danach schreibt das Kind immer frei. */
export const GAP_MAX_BOX = 2;

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
  if (listen && random() >= 0.5) return card.box >= 3 ? "listenType" : "listenChoice";
  // Solange das Wort neu ist, wechseln sich Lückenwort und freies Schreiben ab.
  return card.box <= GAP_MAX_BOX && random() < 0.5 ? "gap" : "type";
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

/**
 * Baut die Aufgabe zu einer Karte.
 * freeWriting: Gesehene Wörter werden nur frei geschrieben (Generalprobe). Neue Wörter beginnen wie immer mit dem Kennenlernen.
 */
export function makeStep(
  item: Item,
  card: CardState,
  pool: readonly Item[],
  listen: boolean,
  random: Random,
  freeWriting = false,
): Step {
  if (freeWriting && card.seen) return { itemId: item.id, kind: "type" };
  let kind = pickKind(card, listen, random);
  // Ohne Buchstaben gibt es nichts zu füllen.
  if (kind === "gap" && !hasGaps(item.fr)) kind = "type";
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
  /** Fällige Karten aus allen Lektionen, älteste zuerst, höchstens REVIEW_LIMIT. */
  dueIds: string[];
  /** Neue Karten: zuerst die aus der aktuellen Lektion, dann die aus dem Rückstand. */
  newIds: string[];
  /** Wie viele der neuen Karten aus der aktuellen Lektion kommen. Sie stehen vorn in newIds. */
  newFromActive: number;
  /** Wie viele der neuen Karten aus anderen Lektionen kommen (Rückstand). Sie stehen hinten in newIds. */
  newFromBacklog: number;
  /** Alle fälligen Karten, auch die über dem Limit. */
  dueTotal: number;
  /** true, wenn die neuen Karten für einen Test aus der Fokus-Lektion kommen. */
  forTest: boolean;
}

/** Der Test-Fokus, wie die Planung ihn braucht. */
export interface FocusInput {
  setId: string;
  /** Tagesnummer des Tests. */
  day: number;
  /** Neue Karten, die heute schon gezeigt wurden (aus dem Tageszähler). */
  newToday: number;
}

/**
 * Plant die Runde "Heute".
 *
 * Wiederholungen kommen aus allen Lektionen.
 * Neue Karten kommen zuerst aus der aktuellen Lektion.
 * Hat eine andere Lektion noch ungesehene Wörter (der Rückstand), ist ein Platz der Runde für sie reserviert.
 * Der Rückstand beginnt bei der ältesten Lektion. Das ist die letzte in `sets`, denn `sets` steht neueste zuerst.
 */
export function planToday(
  sets: readonly SetItems[],
  activeSetId: string,
  progress: Progress,
  today: number,
  newLeft: number,
  focus?: FocusInput,
): TodayPlan {
  const due: { id: string; card: CardState }[] = [];
  for (const set of sets) {
    for (const item of set.items) {
      const card = getCard(progress, item.id, today);
      if (isDue(card, today)) due.push({ id: item.id, card });
    }
  }
  due.sort((a, b) => a.card.due - b.card.due || a.card.box - b.card.box);

  const unseen = (items: readonly Item[]) =>
    items.filter((item) => !getCard(progress, item.id, today).seen).map((item) => item.id);
  const dueIds = due.slice(0, REVIEW_LIMIT).map((d) => d.id);

  // Mit Test-Fokus kommen neue Karten nur aus der Fokus-Lektion. Es gibt keinen Rückstand-Platz.
  // Die Zahl pro Tag ersetzt NEW_PER_ROUND und NEW_PER_DAY. Was heute schon gezeigt wurde, zählt dagegen.
  const focusSet = focus ? sets.find((set) => set.id === focus.setId) : undefined;
  if (focus && focusSet) {
    const open = unseen(focusSet.items);
    // Der Tageswert hängt am Stand vom Morgen. Deshalb zählen die heute gezeigten Karten mit.
    const perDay = newPerDay(open.length + focus.newToday, daysLeft(focus, today));
    const take = Math.max(0, Math.min(perDay - focus.newToday, open.length));
    return {
      dueIds,
      newIds: open.slice(0, take),
      newFromActive: take,
      newFromBacklog: 0,
      dueTotal: due.length,
      forTest: true,
    };
  }

  const active = sets.find((set) => set.id === activeSetId);
  const limit = Math.max(0, Math.min(newLeft, NEW_PER_ROUND));
  const fromActive = unseen(active?.items ?? []);
  // Ohne aktuelle Lektion gibt es keine neuen Karten. So war es immer.
  const backlog = active
    ? [...sets]
        .reverse()
        .filter((set) => set.id !== active.id)
        .flatMap((set) => unseen(set.items))
    : [];

  let takeActive: number;
  let takeBacklog: number;
  if (backlog.length === 0) {
    takeActive = Math.min(limit, fromActive.length);
    takeBacklog = 0;
  } else {
    // Erst höchstens limit - 1 aus der aktuellen Lektion, dann 1 aus dem Rückstand.
    takeActive = Math.min(Math.max(limit - 1, 0), fromActive.length);
    takeBacklog = Math.min(limit - takeActive, 1, backlog.length);
    // Was übrig ist, füllt zuerst die aktuelle Lektion, dann der Rückstand.
    takeActive += Math.min(limit - takeActive - takeBacklog, fromActive.length - takeActive);
    takeBacklog += Math.min(limit - takeActive - takeBacklog, backlog.length - takeBacklog);
  }

  return {
    dueIds,
    newIds: [...fromActive.slice(0, takeActive), ...backlog.slice(0, takeBacklog)],
    newFromActive: takeActive,
    newFromBacklog: takeBacklog,
    dueTotal: due.length,
    forTest: false,
  };
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
