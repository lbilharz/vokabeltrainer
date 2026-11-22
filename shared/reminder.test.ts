import { describe, expect, it } from "vitest";
import { berlinNow, buildCalendar, shouldRemind } from "./reminder";

describe("berlinNow", () => {
  it("rechnet Winterzeit (UTC+1)", () => {
    const now = berlinNow(new Date("2026-01-15T16:30:00Z"));
    expect(now.hour).toBe(17);
    expect(now.day).toBe(Date.UTC(2026, 0, 15) / 86_400_000);
    expect(now.dayStartMs).toBe(Date.parse("2026-01-14T23:00:00Z"));
  });

  it("rechnet Sommerzeit (UTC+2)", () => {
    const now = berlinNow(new Date("2026-07-15T15:30:00Z"));
    expect(now.hour).toBe(17);
    expect(now.day).toBe(Date.UTC(2026, 6, 15) / 86_400_000);
    expect(now.dayStartMs).toBe(Date.parse("2026-07-14T22:00:00Z"));
  });

  it("nimmt den Berliner Tag kurz nach Mitternacht, obwohl UTC noch der Vortag ist", () => {
    const now = berlinNow(new Date("2026-07-15T22:30:00Z"));
    expect(now.hour).toBe(0);
    expect(now.day).toBe(Date.UTC(2026, 6, 16) / 86_400_000);
    expect(now.dayStartMs).toBe(Date.parse("2026-07-15T22:00:00Z"));
  });

  it("nimmt auch im Winter den Berliner Tag nach Mitternacht", () => {
    const now = berlinNow(new Date("2026-01-15T23:05:00Z"));
    expect(now.hour).toBe(0);
    expect(now.day).toBe(Date.UTC(2026, 0, 16) / 86_400_000);
    expect(now.dayStartMs).toBe(Date.parse("2026-01-15T23:00:00Z"));
  });

  it("liegt dayStartMs genau auf Mitternacht und nie nach dem Zeitpunkt", () => {
    const date = new Date("2026-03-29T10:00:00Z"); // Tag der Umstellung auf Sommerzeit
    const now = berlinNow(date);
    expect(now.dayStartMs).toBe(Date.parse("2026-03-28T23:00:00Z"));
    expect(now.dayStartMs).toBeLessThanOrEqual(date.getTime());
  });

  it("rechnet Millisekunden mit", () => {
    const now = berlinNow(new Date("2026-01-15T16:30:00.789Z"));
    expect(now.hour).toBe(17);
    expect(now.dayStartMs).toBe(Date.parse("2026-01-14T23:00:00Z"));
  });
});

describe("shouldRemind", () => {
  const base = { dueCount: 0, seenCount: 5, itemCount: 5, lastPracticeMs: 100, dayStartMs: 1000 };

  it("schweigt, wenn heute schon geübt wurde", () => {
    expect(shouldRemind({ ...base, dueCount: 3, itemCount: 9, lastPracticeMs: 1000 })).toBe(false);
    expect(shouldRemind({ ...base, dueCount: 3, lastPracticeMs: 5000 })).toBe(false);
  });

  it("erinnert bei fälligen Karten", () => {
    expect(shouldRemind({ ...base, dueCount: 1 })).toBe(true);
  });

  it("erinnert bei neuen Vokabeln", () => {
    expect(shouldRemind({ ...base, itemCount: 6 })).toBe(true);
  });

  it("schweigt, wenn nichts fällig und nichts neu ist", () => {
    expect(shouldRemind(base)).toBe(false);
  });

  it("erinnert bei einem neuen Konto ohne Übung", () => {
    expect(shouldRemind({ dueCount: 0, seenCount: 0, itemCount: 8, lastPracticeMs: 0, dayStartMs: 1000 })).toBe(true);
  });

  it("schweigt ganz ohne Vokabeln", () => {
    expect(shouldRemind({ dueCount: 0, seenCount: 0, itemCount: 0, lastPracticeMs: 0, dayStartMs: 1000 })).toBe(false);
  });
});

describe("buildCalendar", () => {
  const text = buildCalendar(17, new Date("2026-11-22T10:05:09Z"));

  it("legt einen täglichen Termin zur gewählten Stunde an", () => {
    expect(text).toContain("DTSTART:20261122T170000");
    expect(text).toContain("DTEND:20261122T171500");
    expect(text).toContain("RRULE:FREQ=DAILY");
    expect(text).toContain("DTSTAMP:20261122T100509Z");
  });

  it("hat einen Hinweiston und eine feste Kennung", () => {
    expect(text).toContain("BEGIN:VALARM");
    expect(text).toContain("UID:taegliche-erinnerung@vok.cards");
  });

  it("trennt Zeilen mit CRLF, wie Kalender es erwarten", () => {
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.split("\r\n").every((line) => !line.includes("\n"))).toBe(true);
  });

  it("begrenzt die Stunde auf 0 bis 23", () => {
    expect(buildCalendar(99, new Date("2026-11-22T10:00:00Z"))).toContain("T230000");
    expect(buildCalendar(7, new Date("2026-11-22T10:00:00Z"))).toContain("T070000");
  });
});
