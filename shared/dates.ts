/**
 * Lesbare Daten für die Oberfläche. Gerechnet wird in der Zeit von Europa/Berlin.
 * Alle Funktionen bekommen "jetzt" als Argument. So sind sie im Test fest.
 */

const ZONE = "Europe/Berlin";
/** Ein Tag in Millisekunden. */
export const DAY_MS = 86_400_000;

export const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
export const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

interface Day {
  year: number;
  month: number;
  day: number;
  /** Tage seit 1970 nach Berliner Kalender. */
  number: number;
  /** 0 ist Sonntag. */
  weekday: number;
}

function berlinDay(ms: number): Day {
  const parts = formatter.formatToParts(new Date(ms));
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  const utc = Date.UTC(year, month - 1, day);
  return { year, month, day, number: Math.round(utc / DAY_MS), weekday: new Date(utc).getUTCDay() };
}

/** Ein Datum gilt nur, wenn es echt ist. Das Datum 0 heisst: unbekannt. */
export function hasDate(ms: number | undefined): ms is number {
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0;
}

function longDate(then: Day): string {
  return `${then.day}. ${MONTHS[then.month - 1]}`;
}

/**
 * Wie ein Zeitpunkt in einem Satz heisst.
 * "heute", "gestern", "am Sonntag", "am 14. November", "am 14. November 2025".
 */
export function dateWord(ms: number, now: number): string {
  const then = berlinDay(ms);
  const today = berlinDay(now);
  const back = today.number - then.number;
  if (back <= 0) return "heute";
  if (back === 1) return "gestern";
  if (back <= 6) return `am ${WEEKDAYS[then.weekday]}`;
  return then.year === today.year ? `am ${longDate(then)}` : `am ${longDate(then)} ${then.year}`;
}

/** Wie `dateWord`, aber zum Anhängen an einen Namen: "von heute", "vom Sonntag", "vom 14. November". */
export function dateFrom(ms: number, now: number): string {
  const word = dateWord(ms, now);
  if (word === "heute" || word === "gestern") return `von ${word}`;
  return `vom ${word.slice(3)}`;
}

/** Die Zeile unter dem Namen einer Lektion. Ohne Datum gibt es keine Zeile. */
export function photoLine(ms: number | undefined, now: number): string | null {
  if (!hasDate(ms)) return null;
  const word = dateWord(ms, now);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} fotografiert`;
}

/** Name für eine Lektion ohne Überschrift: "Vokabeln vom 22. November". */
export function defaultLessonName(now: number): string {
  return `Vokabeln vom ${longDate(berlinDay(now))}`;
}
