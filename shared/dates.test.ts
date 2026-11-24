import { describe, expect, it } from "vitest";
import { dateFrom, dateWord, defaultLessonName, hasDate, photoLine } from "./dates";

// Samstag, 22. November 2025, 14:00 in Berlin (13:00 UTC).
const now = Date.UTC(2025, 10, 22, 13, 0);
const day = 86_400_000;

describe("dateWord", () => {
  it("sagt heute am selben Tag", () => {
    expect(dateWord(now, now)).toBe("heute");
    expect(dateWord(now - 5 * 3_600_000, now)).toBe("heute");
  });
  it("sagt gestern einen Tag davor", () => {
    expect(dateWord(now - day, now)).toBe("gestern");
  });
  it("nennt bei 2 bis 6 Tagen den Wochentag", () => {
    expect(dateWord(now - 2 * day, now)).toBe("am Donnerstag");
    expect(dateWord(now - 6 * day, now)).toBe("am Sonntag");
  });
  it("nennt ab 7 Tagen das Datum", () => {
    expect(dateWord(now - 7 * day, now)).toBe("am 15. November");
    expect(dateWord(Date.UTC(2025, 0, 3, 12), now)).toBe("am 3. Januar");
  });
  it("nennt in einem anderen Jahr auch das Jahr", () => {
    expect(dateWord(Date.UTC(2024, 11, 24, 12), now)).toBe("am 24. Dezember 2024");
  });
  it("rechnet nach Berliner Zeit, nicht nach UTC", () => {
    // 23:30 UTC am 21. November ist in Berlin schon der 22. November, 00:30.
    const jetzt = Date.UTC(2025, 10, 21, 23, 30);
    expect(dateWord(Date.UTC(2025, 10, 21, 23, 10), jetzt)).toBe("heute");
    // 22:45 UTC am 21. November ist in Berlin noch der 21. November, 23:45.
    expect(dateWord(Date.UTC(2025, 10, 21, 22, 45), jetzt)).toBe("gestern");
  });
  it("kommt mit der Zeitumstellung zurecht", () => {
    // 30. März 2025: Sommerzeit beginnt, der Tag hat 23 Stunden.
    const sonntag = Date.UTC(2025, 2, 30, 12);
    expect(dateWord(Date.UTC(2025, 2, 29, 12), sonntag)).toBe("gestern");
    expect(dateWord(Date.UTC(2025, 2, 28, 12), sonntag)).toBe("am Freitag");
  });
  it("behandelt die Zukunft wie heute", () => {
    expect(dateWord(now + 3 * day, now)).toBe("heute");
  });
});

describe("dateFrom", () => {
  it("passt zu einem Namen davor", () => {
    expect(dateFrom(now, now)).toBe("von heute");
    expect(dateFrom(now - day, now)).toBe("von gestern");
    expect(dateFrom(now - 5 * day, now)).toBe("vom Montag");
    expect(dateFrom(now - 8 * day, now)).toBe("vom 14. November");
    expect(dateFrom(Date.UTC(2024, 10, 14, 12), now)).toBe("vom 14. November 2024");
  });
});

describe("photoLine", () => {
  it("schreibt den ersten Buchstaben gross", () => {
    expect(photoLine(now, now)).toBe("Heute fotografiert");
    expect(photoLine(now - day, now)).toBe("Gestern fotografiert");
    expect(photoLine(now - 6 * day, now)).toBe("Am Sonntag fotografiert");
    expect(photoLine(Date.UTC(2025, 10, 14, 12), now)).toBe("Am 14. November fotografiert");
  });
  it("gibt ohne Datum keine Zeile", () => {
    expect(photoLine(0, now)).toBeNull();
    expect(photoLine(undefined, now)).toBeNull();
    expect(photoLine(Number.NaN, now)).toBeNull();
  });
});

describe("defaultLessonName", () => {
  it("nennt den Tag in Berlin", () => {
    expect(defaultLessonName(now)).toBe("Vokabeln vom 22. November");
    expect(defaultLessonName(Date.UTC(2025, 11, 31, 23, 30))).toBe("Vokabeln vom 1. Januar");
  });
});

describe("hasDate", () => {
  it("lässt 0 und fehlende Werte nicht gelten", () => {
    expect(hasDate(0)).toBe(false);
    expect(hasDate(undefined)).toBe(false);
    expect(hasDate(1)).toBe(true);
  });
});
