/** Reine Logik für die tägliche Übungserinnerung. Läuft im Worker und in Tests. */

import { DAY_MS } from "./dates";

const ZONE = "Europe/Berlin";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Wanduhr in Berlin als UTC-Millisekunden und als Teile. */
function wallClock(ms: number): { wallMs: number; year: number; month: number; day: number; hour: number; minute: number } {
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(ms))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const year = parts.year!;
  const month = parts.month!;
  const day = parts.day!;
  const hour = parts.hour! % 24;
  const wallMs = Date.UTC(year, month - 1, day, hour, parts.minute!, parts.second!);
  return { wallMs, year, month, day, hour, minute: parts.minute! };
}

/** Kalendertag, Stunde und Minute in Europe/Berlin. */
export function berlinNow(date: Date): { day: number; hour: number; minute: number; dayStartMs: number } {
  // Auf ganze Sekunden gekürzt, weil die Wanduhr keine Millisekunden liefert.
  const ms = Math.floor(date.getTime() / 1000) * 1000;
  const clock = wallClock(ms);
  const midnightWall = Date.UTC(clock.year, clock.month - 1, clock.day);
  // Die Zeitumstellung liegt nachts um 2 oder 3 Uhr. Um Mitternacht ändert sich der Versatz nie.
  const offsetNow = clock.wallMs - ms;
  const guess = midnightWall - offsetNow;
  const offsetAtGuess = wallClock(guess).wallMs - guess;
  return {
    day: midnightWall / DAY_MS,
    hour: clock.hour,
    minute: clock.minute,
    dayStartMs: midnightWall - offsetAtGuess,
  };
}

/** Soll heute eine Erinnerung kommen? */
export function shouldRemind(input: {
  /** Gesehene Karten mit due <= heute. */
  dueCount: number;
  /** Alle gesehenen Karten des Nutzers. */
  seenCount: number;
  /** Alle Vokabeln in den nicht gelöschten Sets des Nutzers. */
  itemCount: number;
  /** Größtes cards.t des Nutzers, 0 wenn keine Karte da ist. */
  lastPracticeMs: number;
  dayStartMs: number;
}): boolean {
  if (input.lastPracticeMs >= input.dayStartMs) return false;
  if (input.dueCount > 0) return true;
  return input.itemCount > input.seenCount;
}

/**
 * Ein täglicher Kalendertermin als .ics-Text.
 *
 * Das ist die Erinnerung ganz ohne Mitteilungsdienst: der Termin liegt nur im Kalender
 * des Geräts. Die Uhrzeit steht ohne Zeitzone da und gilt damit in der Ortszeit des Geräts.
 * Die Kennung ist fest. Wer den Termin noch einmal hinzufügt, ersetzt den alten.
 */
export function buildCalendar(hour: number, minute: number, now: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const h = Math.min(Math.max(Math.round(hour), 0), 23);
  // Auf das Viertel abrunden: 0, 15, 30 oder 45.
  const m = Math.min(Math.max(Math.floor((Number.isFinite(minute) ? minute : 0) / 15) * 15, 0), 45);
  // Das Ende liegt 15 Minuten später. Um 23:45 endet der Termin um 23:59 am selben Tag.
  const endTotal = Math.min(h * 60 + m + 15, 23 * 60 + 59);
  const end = `${two(Math.floor(endTotal / 60))}${two(endTotal % 60)}`;
  const day = `${now.getUTCFullYear()}${two(now.getUTCMonth() + 1)}${two(now.getUTCDate())}`;
  const stamp = `${day}T${two(now.getUTCHours())}${two(now.getUTCMinutes())}${two(now.getUTCSeconds())}Z`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//vok.cards//Erinnerung//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:taegliche-erinnerung@vok.cards",
    `DTSTAMP:${stamp}`,
    `DTSTART:${day}T${two(h)}${two(m)}00`,
    `DTEND:${day}T${end}00`,
    "RRULE:FREQ=DAILY",
    "SUMMARY:Vokabeln üben",
    "DESCRIPTION:Ein paar Karten warten auf dich: https://vok.cards",
    "URL:https://vok.cards",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Vokabeln üben",
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
