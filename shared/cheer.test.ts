import { describe, expect, it } from "vitest";
import { doneHeadline, justMastered, streakAfter, streakLine } from "./cheer";
import { MASTER } from "./srs";
import type { CardState } from "./types";

const card = (box: number): CardState => ({ box, due: 0, seen: true });

describe("streakAfter", () => {
  it("zählt eine richtige Antwort dazu", () => {
    expect(streakAfter(0, true, true)).toBe(1);
    expect(streakAfter(4, true, true)).toBe(5);
  });

  it("setzt eine falsche Antwort auf 0 zurück", () => {
    expect(streakAfter(7, false, true)).toBe(0);
    expect(streakAfter(0, false, true)).toBe(0);
  });

  it("lässt die Serie beim Kennenlernen unverändert", () => {
    expect(streakAfter(4, true, false)).toBe(4);
    expect(streakAfter(4, false, false)).toBe(4);
  });
});

describe("streakLine", () => {
  it("gibt nur bei den Meilensteinen eine Zeile", () => {
    for (const n of [3, 5, 10, 15, 20, 30, 40, 50, 60]) expect(streakLine(n)).not.toBeNull();
    for (const n of [0, 1, 2, 4, 6, 9, 11, 16, 25, 31, 45]) expect(streakLine(n)).toBeNull();
  });

  it("nennt die Zahl in der Zeile", () => {
    expect(streakLine(3)).toBe("3 in Folge");
    expect(streakLine(5)).toBe("5 in Folge. Läuft.");
    expect(streakLine(10)).toBe("10 in Folge. Stark.");
    expect(streakLine(30)).toMatch(/^30 in Folge/);
    expect(streakLine(100)).toMatch(/^100 in Folge/);
  });

  it("hat keinen Gedankenstrich", () => {
    for (let n = 0; n <= 200; n++) expect(streakLine(n) ?? "").not.toContain(String.fromCharCode(8212));
  });
});

describe("justMastered", () => {
  it("ist wahr, wenn die Karte MASTER erreicht", () => {
    expect(justMastered(card(MASTER - 1), card(MASTER))).toBe(true);
  });

  it("ist falsch, wenn die Karte schon saß", () => {
    expect(justMastered(card(MASTER), card(MASTER + 1))).toBe(false);
  });

  it("ist falsch, wenn die Karte darunter bleibt oder fällt", () => {
    expect(justMastered(card(2), card(3))).toBe(false);
    expect(justMastered(card(MASTER - 1), card(1))).toBe(false);
    expect(justMastered(card(MASTER), card(1))).toBe(false);
  });
});

describe("doneHeadline", () => {
  it("lobt eine fehlerfreie Runde ab 3 Karten", () => {
    expect(doneHeadline({ total: 3, again: 0 }).title).toBe("Fehlerfrei");
    expect(doneHeadline({ total: 12, again: 0 }).line).toBe("12 Karten, kein Fehler.");
  });

  it("sagt bei kleinen Runden nur Geschafft", () => {
    expect(doneHeadline({ total: 2, again: 0 })).toEqual({ title: "Geschafft", line: "2 Karten sind durch." });
    expect(doneHeadline({ total: 1, again: 0 })).toEqual({ title: "Geschafft", line: "1 Karte ist durch." });
  });

  it("sagt bei einem Fehler Geschafft", () => {
    expect(doneHeadline({ total: 8, again: 1 })).toEqual({ title: "Geschafft", line: "8 Karten sind durch." });
  });
});
