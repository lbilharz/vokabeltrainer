import { describe, expect, it } from "vitest";
import {
  type Focus,
  PRACTICE_LIMIT,
  daysLeft,
  dayToIso,
  isExpired,
  isFocusValid,
  isTestDayAllowed,
  isoToDay,
  leftWord,
  learnLabel,
  newPerDay,
  openLine,
  planLines,
  practiceItems,
  roundKind,
  schoolDays,
  shortDate,
  sureCount,
  testChip,
  testTitle,
  updateSure,
  verdictLine,
  weakTitle,
  weekdayName,
  weekdayShort,
} from "./focus";
import type { Item } from "./types";

// Tagesnummer für Mittwoch, 25. November 2026.
const wed = Date.UTC(2026, 10, 25) / 86_400_000;
const mk = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `a:${i}`, setId: "a", c: "", fr: `f${i}`, de: `d${i}` }));
const focus = (day: number, sure: string[] = []): Focus => ({ setId: "a", day, sure });

describe("Tage", () => {
  it("nennt Wochentag und Datum", () => {
    expect(weekdayName(wed)).toBe("Mittwoch");
    expect(weekdayShort(wed + 2)).toBe("Fr");
    expect(shortDate(wed + 2)).toBe("27.11.");
    expect(testTitle(wed + 9, wed)).toBe("Test am 4. Dezember");
  });
  it("wandelt Datumsfeld und Tag ineinander um", () => {
    expect(dayToIso(wed)).toBe("2026-11-25");
    expect(isoToDay("2026-11-25")).toBe(wed);
    expect(isoToDay("2026-02-30")).toBeNull();
    expect(isoToDay("kein Datum")).toBeNull();
  });
  it("wählt die nächsten vier Schultage ab morgen", () => {
    expect(schoolDays(wed).map(weekdayShort)).toEqual(["Do", "Fr", "Mo", "Di"]);
    // Am Freitag beginnt es am Montag.
    expect(schoolDays(wed + 2).map(weekdayShort)).toEqual(["Mo", "Di", "Mi", "Do"]);
  });
  it("erlaubt Tage von morgen bis 60 Tage voraus", () => {
    expect(isTestDayAllowed(wed, wed)).toBe(false);
    expect(isTestDayAllowed(wed + 1, wed)).toBe(true);
    expect(isTestDayAllowed(wed + 60, wed)).toBe(true);
    expect(isTestDayAllowed(wed + 61, wed)).toBe(false);
  });
});

describe("Tage bis zum Test und neue Wörter", () => {
  it("zählt mindestens einen Tag", () => {
    expect(daysLeft(focus(wed + 3), wed)).toBe(3);
    expect(daysLeft(focus(wed), wed)).toBe(1);
  });
  it("rundet auf, mit Untergrenze 3 und Obergrenze 12", () => {
    expect(newPerDay(12, 3)).toBe(4);
    expect(newPerDay(13, 3)).toBe(5);
    expect(newPerDay(4, 4)).toBe(3);
    expect(newPerDay(100, 2)).toBe(12);
    expect(newPerDay(0, 2)).toBe(0);
  });
});

describe("Gültigkeit", () => {
  it("gilt bis einschliesslich Testtag", () => {
    expect(isExpired(focus(wed), wed)).toBe(false);
    expect(isExpired(focus(wed), wed + 1)).toBe(true);
  });
  it("endet, wenn die Lektion fehlt", () => {
    expect(isFocusValid(focus(wed + 1), wed, ["a"])).toBe(true);
    expect(isFocusValid(focus(wed + 1), wed, ["b"])).toBe(false);
    expect(isFocusValid(undefined, wed, ["a"])).toBe(false);
    expect(isFocusValid(null, wed, ["a"])).toBe(false);
    expect(isFocusValid(focus(wed - 1), wed, ["a"])).toBe(false);
  });
});

describe("Texte", () => {
  it("benennt den Testtag", () => {
    expect(testTitle(wed, wed)).toBe("Test heute");
    expect(testTitle(wed + 1, wed)).toBe("Test morgen");
    expect(testTitle(wed + 2, wed)).toBe("Test am Freitag");
    expect(testTitle(wed + 6, wed)).toBe("Test am Dienstag");
    expect(testTitle(wed + 7, wed)).toBe("Test am 2. Dezember");
  });
  it("sagt, wie lange es noch dauert", () => {
    expect(leftWord(wed, wed)).toBe("Heute");
    expect(leftWord(wed + 1, wed)).toBe("Morgen");
    expect(leftWord(wed + 3, wed)).toBe("Noch 3 Tage");
  });
  it("kürzt für die Lektionsliste und den Knopf", () => {
    expect(testChip(wed + 2, wed)).toBe("Test Fr");
    expect(testChip(wed + 9, wed)).toBe("Test 04.12.");
    expect(learnLabel(wed + 2, wed)).toBe("Für Freitag lernen");
    expect(learnLabel(wed + 9, wed)).toBe("Für den 4. Dezember lernen");
  });
  it("schreibt den Plan", () => {
    expect(planLines(8, 18, wed + 2, wed)).toEqual([
      "Heute und Donnerstag: je 4 neue Wörter.",
      "Am Donnerstag: die Generalprobe mit allen 18 Wörtern.",
    ]);
    expect(planLines(40, 50, wed + 20, wed)[0]).toBe("Bis zum Test jeden Tag: je 3 neue Wörter.");
    expect(planLines(0, 18, wed + 1, wed)).toEqual([
      "Alle Wörter sind schon geübt. Bis zum Test wird wiederholt.",
      "Heute: die Generalprobe mit allen 18 Wörtern.",
    ]);
  });
  it("zählt die offenen Wörter", () => {
    expect(openLine({ total: 18, practised: 6, mastered: 0 }, ["Wort", "Wörter"])).toBe("18 Wörter. 6 geübt, 12 offen");
  });
  it("nennt das Urteil und die Überschrift der wackligen Wörter", () => {
    expect(verdictLine(wed + 1, wed)).toBe("sicher für den Test morgen");
    expect(verdictLine(wed, wed)).toBe("sicher für den Test heute");
    expect(weakTitle(3)).toBe("Diese 3 wackeln noch");
    expect(weakTitle(1)).toBe("Dieses Wort wackelt noch");
  });
});

describe("updateSure", () => {
  it("macht ein Wort sicher, wenn es richtig geschrieben wird", () => {
    for (const kind of ["type", "gap", "listenType"]) {
      expect(updateSure(focus(wed), "a:0", kind, true).sure).toEqual(["a:0"]);
    }
  });
  it("nimmt ein Wort bei einer falschen Antwort heraus", () => {
    expect(updateSure(focus(wed, ["a:0", "a:1"]), "a:0", "type", false).sure).toEqual(["a:1"]);
  });
  it("lässt Wahl-Aufgaben und Kennenlernen aussen vor", () => {
    const f = focus(wed, ["a:0"]);
    expect(updateSure(f, "a:0", "listenChoice", false)).toBe(f);
    expect(updateSure(f, "a:1", "intro", true)).toBe(f);
  });
  it("gibt dasselbe Objekt zurück, wenn sich nichts ändert", () => {
    const f = focus(wed, ["a:0"]);
    expect(updateSure(f, "a:0", "type", true)).toBe(f);
    expect(updateSure(f, "a:1", "type", false)).toBe(f);
  });
  it("ändert das Original nicht", () => {
    const f = focus(wed);
    updateSure(f, "a:0", "type", true);
    expect(f.sure).toEqual([]);
  });
});

describe("Runden", () => {
  it("startet die Generalprobe am Tag vor dem Test und am Testtag", () => {
    expect(roundKind(focus(wed + 2), wed)).toBe("practice");
    expect(roundKind(focus(wed + 1), wed)).toBe("rehearsal");
    expect(roundKind(focus(wed), wed)).toBe("rehearsal");
  });
  it("nimmt für die Übung die unsicheren Wörter in Buchreihenfolge", () => {
    const items = mk(5);
    expect(practiceItems(items, { sure: ["a:1", "a:3"] }).map((i) => i.id)).toEqual(["a:0", "a:2", "a:4"]);
  });
  it("nimmt höchstens 20 Wörter", () => {
    expect(practiceItems(mk(30), { sure: [] })).toHaveLength(PRACTICE_LIMIT);
  });
  it("zählt die sicheren Wörter der Lektion", () => {
    expect(sureCount({ sure: ["a:0", "a:1", "x:9"] }, mk(3))).toBe(2);
  });
});
