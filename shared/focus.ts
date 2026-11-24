import { MONTHS, WEEKDAYS } from "./dates";
import type { Counts } from "./lessons";
import type { Item } from "./types";

/**
 * Der Test-Fokus: ein Kind schreibt an einem Tag einen Test über eine Lektion.
 * Bis dahin hat diese Lektion Vorrang. Alles hier ist reine Logik ohne Oberfläche.
 */
export interface Focus {
  setId: string;
  /** Tagesnummer des Tests, gezählt wie `today` in der App (dayNumber aus srs.ts). */
  day: number;
  /** Kennungen der Wörter, die das Kind gerade schreiben kann. */
  sure: string[];
}

/** Nicht weniger neue Wörter pro Tag, solange noch ungesehene da sind. */
export const FOCUS_MIN_NEW = 3;
/** Nicht mehr neue Wörter pro Tag. */
export const FOCUS_MAX_NEW = 12;
/** So viele Wörter hat eine Übungsrunde für den Test höchstens. */
export const PRACTICE_LIMIT = 20;
/** Der Test darf höchstens so viele Tage voraus liegen. */
export const FOCUS_MAX_AHEAD = 60;

/** Aufgaben, bei denen das Kind das Wort selbst schreibt. Nur sie ändern, was "sicher" ist. */
const WRITTEN_KINDS: ReadonlySet<string> = new Set(["type", "gap", "listenType"]);

/** Was an einem Wort in einer Runde nicht stimmte. */
export type WeakReason = "accents" | "typo" | "article" | "unknown";

const REASON_LABELS: Record<WeakReason, string> = {
  accents: "Akzent",
  typo: "Schreibweise",
  article: "Artikel",
  unknown: "nicht gewusst",
};

export function reasonLabel(reason: WeakReason): string {
  return REASON_LABELS[reason];
}

// ---------- Tage ----------
// Eine Tagesnummer zählt Tage seit 1970. Als Millisekunden gelesen gibt sie den Tag in UTC wieder.

const DAY_MS = 86_400_000;
const SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const dateOf = (day: number) => new Date(day * DAY_MS);

/** 0 ist Sonntag. */
export function weekdayOf(day: number): number {
  return dateOf(day).getUTCDay();
}

export function weekdayName(day: number): string {
  return WEEKDAYS[weekdayOf(day)]!;
}

export function weekdayShort(day: number): string {
  return SHORT[weekdayOf(day)]!;
}

/** "27.11." */
export function shortDate(day: number): string {
  const date = dateOf(day);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.`;
}

/** "4. Dezember" */
export function longDate(day: number): string {
  const date = dateOf(day);
  return `${date.getUTCDate()}. ${MONTHS[date.getUTCMonth()]}`;
}

/** Tag im Format JJJJ-MM-TT für das Datumsfeld. */
export function dayToIso(day: number): string {
  return dateOf(day).toISOString().slice(0, 10);
}

/** Tagesnummer zu einem Datum aus dem Datumsfeld. Null, wenn es kein echtes Datum ist. */
export function isoToDay(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, date);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) return null;
  return ms / DAY_MS;
}

/** Die nächsten Schultage (Montag bis Freitag), ab morgen. */
export function schoolDays(today: number, count = 4): number[] {
  const out: number[] = [];
  for (let day = today + 1; out.length < count; day++) {
    const weekday = weekdayOf(day);
    if (weekday !== 0 && weekday !== 6) out.push(day);
  }
  return out;
}

/** Ein Testtag muss zwischen morgen und FOCUS_MAX_AHEAD Tagen liegen. */
export function isTestDayAllowed(day: number, today: number): boolean {
  return Number.isInteger(day) && day >= today + 1 && day <= today + FOCUS_MAX_AHEAD;
}

/** Tage bis zum Test, mindestens 1. Am Testtag selbst bleibt es bei 1. */
export function daysLeft(focus: Pick<Focus, "day">, today: number): number {
  return Math.max(1, focus.day - today);
}

/** Wie viele neue Wörter pro Tag. Null, wenn nichts Ungesehenes mehr da ist. */
export function newPerDay(unseen: number, left: number): number {
  if (unseen <= 0) return 0;
  const raw = Math.ceil(unseen / Math.max(1, left));
  return Math.min(FOCUS_MAX_NEW, Math.max(FOCUS_MIN_NEW, raw));
}

/** Der Fokus gilt bis einschliesslich Testtag. Danach endet er von selbst. */
export function isExpired(focus: Pick<Focus, "day">, today: number): boolean {
  return today > focus.day;
}

/** Der Fokus gilt, wenn der Test nicht vorbei ist und die Lektion noch da ist. */
export function isFocusValid(focus: Focus | null | undefined, today: number, setIds: readonly string[]): focus is Focus {
  return Boolean(focus) && !isExpired(focus!, today) && setIds.includes(focus!.setId);
}

// ---------- Texte ----------

function dayPhrase(day: number, today: number): string {
  return day - today <= 6 ? weekdayName(day) : longDate(day);
}

/** "Test heute", "Test morgen", "Test am Freitag", "Test am 4. Dezember". */
export function testTitle(day: number, today: number): string {
  const diff = day - today;
  if (diff <= 0) return "Test heute";
  if (diff === 1) return "Test morgen";
  return `Test am ${dayPhrase(day, today)}`;
}

/** "Heute", "Morgen", "Noch 3 Tage". */
export function leftWord(day: number, today: number): string {
  const diff = day - today;
  if (diff <= 0) return "Heute";
  if (diff === 1) return "Morgen";
  return `Noch ${diff} Tage`;
}

/** Das Schild in der Lektionsliste: "Test Fr" oder, weiter weg, "Test 04.12.". */
export function testChip(day: number, today: number): string {
  return day - today <= 6 ? `Test ${weekdayShort(day)}` : `Test ${shortDate(day)}`;
}

/** "Für Freitag lernen" oder, weiter weg, "Für den 4. Dezember lernen". */
export function learnLabel(day: number, today: number): string {
  return day - today <= 6 ? `Für ${weekdayName(day)} lernen` : `Für den ${longDate(day)} lernen`;
}

export function planTitle(day: number, today: number): string {
  return day - today <= 6 ? `Dein Plan bis ${weekdayName(day)}` : `Dein Plan bis zum ${longDate(day)}`;
}

function listDays(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} und ${names[names.length - 1]}`;
}

/**
 * Die Zeilen des Plans bis zum Test.
 * `unseen` sind die ungesehenen Wörter der Lektion, `total` alle.
 * Die erste Zeile nennt die neuen Wörter pro Tag, die zweite die Generalprobe am Tag vor dem Test.
 */
export function planLines(unseen: number, total: number, day: number, today: number): string[] {
  const lines: string[] = [];
  const left = Math.max(1, day - today);
  const perDay = newPerDay(unseen, left);
  if (perDay === 0) {
    lines.push("Alle Wörter sind schon geübt. Bis zum Test wird wiederholt.");
  } else {
    const each = perDay === 1 ? "je 1 neues Wort" : `je ${perDay} neue Wörter`;
    if (left <= 3) {
      const names = Array.from({ length: left }, (_, i) => (i === 0 ? "Heute" : weekdayName(today + i)));
      lines.push(`${listDays(names)}: ${each}.`);
    } else {
      lines.push(`Bis zum Test jeden Tag: ${each}.`);
    }
  }
  const rehearsal = day - 1;
  const when = rehearsal <= today ? "Heute" : `Am ${weekdayName(rehearsal)}`;
  const all = total === 1 ? "dem Wort" : `allen ${total} Wörtern`;
  lines.push(`${when}: die Generalprobe mit ${all}.`);
  return lines;
}

/** "18 Wörter. 6 geübt, 12 offen" unter dem Balken der Lektion. */
export function openLine(counts: Counts, unit: [string, string]): string {
  const words = counts.total === 1 ? unit[0] : unit[1];
  return `${counts.total} ${words}. ${counts.practised} geübt, ${counts.total - counts.practised} offen`;
}

/** "6 von 18 sicher" */
export function sureLine(sure: number, total: number): string {
  return `${sure} von ${total} sicher`;
}

// ---------- Stand ----------

/** Wie viele Wörter der Lektion das Kind gerade schreiben kann. */
export function sureCount(focus: Pick<Focus, "sure">, items: readonly Item[]): number {
  const sure = new Set(focus.sure);
  return items.filter((item) => sure.has(item.id)).length;
}

/**
 * Trägt das Ergebnis einer Aufgabe ein.
 * Richtig geschrieben macht ein Wort sicher. Falsch geschrieben oder "Weiß ich nicht" nimmt es heraus.
 * Wahl-Aufgaben und das Kennenlernen zählen nicht.
 * Ändert sich nichts, kommt dasselbe Objekt zurück.
 */
export function updateSure(focus: Focus, itemId: string, kind: string, correct: boolean): Focus {
  if (!WRITTEN_KINDS.has(kind)) return focus;
  const has = focus.sure.includes(itemId);
  if (correct && !has) return { ...focus, sure: [...focus.sure, itemId] };
  if (!correct && has) return { ...focus, sure: focus.sure.filter((id) => id !== itemId) };
  return focus;
}

// ---------- Runden ----------

export type RoundKind = "practice" | "rehearsal";

/** Am Tag vor dem Test und am Testtag gibt es die Generalprobe, sonst eine Übungsrunde. */
export function roundKind(focus: Pick<Focus, "day">, today: number): RoundKind {
  return today >= focus.day - 1 ? "rehearsal" : "practice";
}

/** Wörter der Übungsrunde: die noch nicht sicheren, in Buchreihenfolge, höchstens PRACTICE_LIMIT. */
export function practiceItems(items: readonly Item[], focus: Pick<Focus, "sure">): Item[] {
  const sure = new Set(focus.sure);
  return items.filter((item) => !sure.has(item.id)).slice(0, PRACTICE_LIMIT);
}

// ---------- Ergebnis der Generalprobe ----------

/** "sicher für den Test morgen" oder "heute". Liegt der Test weiter weg, steht nur "sicher für den Test". */
export function verdictLine(day: number, today: number): string {
  const diff = day - today;
  if (diff <= 0) return "sicher für den Test heute";
  if (diff === 1) return "sicher für den Test morgen";
  return "sicher für den Test";
}

export function weakTitle(n: number): string {
  return n === 1 ? "Dieses Wort wackelt noch" : `Diese ${n} wackeln noch`;
}

export function retryLabel(n: number): string {
  return n === 1 ? "Dieses Wort noch einmal üben" : `Diese ${n} noch einmal üben`;
}

export const PRAISE = "Alle Wörter sitzen. Du bist bereit für den Test.";
