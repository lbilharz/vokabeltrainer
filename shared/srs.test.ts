import { describe, expect, it } from "vitest";
import { INTERVAL, MASTER, MAX_BOX, dayNumber, getCard, introduce, isDue, isMastered, rate } from "./srs";
import type { CardState } from "./types";

const T = 20000;

describe("Konstanten", () => {
  it("hat die vereinbarten Werte", () => {
    expect(MASTER).toBe(4);
    expect(MAX_BOX).toBe(8);
    expect(INTERVAL).toEqual({ 1: 0, 2: 1, 3: 2, 4: 4, 5: 7, 6: 14, 7: 30, 8: 90 });
  });
});

describe("dayNumber", () => {
  it("gibt für aufeinanderfolgende lokale Tage aufeinanderfolgende Zahlen", () => {
    const a = dayNumber(new Date(2026, 2, 28, 12));
    const b = dayNumber(new Date(2026, 2, 29, 12)); // Zeitumstellung in Europa
    const c = dayNumber(new Date(2026, 2, 30, 12));
    expect(b - a).toBe(1);
    expect(c - b).toBe(1);
  });
  it("gibt für 00:05 und 23:55 am selben Tag denselben Wert", () => {
    expect(dayNumber(new Date(2026, 10, 22, 0, 5))).toBe(dayNumber(new Date(2026, 10, 22, 23, 55)));
  });
  it("wechselt um Mitternacht", () => {
    expect(dayNumber(new Date(2026, 10, 23, 0, 5))).toBe(dayNumber(new Date(2026, 10, 22, 23, 55)) + 1);
  });
});

describe("getCard", () => {
  it("liefert eine neue Karte, wenn nichts gespeichert ist", () => {
    expect(getCard({}, "x", T)).toEqual({ box: 1, due: T, seen: false });
  });
  it("liefert den gespeicherten Stand", () => {
    const c: CardState = { box: 3, due: T + 2, seen: true };
    expect(getCard({ x: c }, "x", T)).toBe(c);
  });
});

describe("isDue und isMastered", () => {
  it("ungesehene Karten sind nie fällig", () => {
    expect(isDue({ box: 1, due: T - 5, seen: false }, T)).toBe(false);
  });
  it("gesehene Karten sind ab dem Fälligkeitstag fällig", () => {
    expect(isDue({ box: 2, due: T, seen: true }, T)).toBe(true);
    expect(isDue({ box: 2, due: T - 1, seen: true }, T)).toBe(true);
    expect(isDue({ box: 2, due: T + 1, seen: true }, T)).toBe(false);
  });
  it("sitzt ab Box MASTER und nur wenn gesehen", () => {
    expect(isMastered({ box: MASTER - 1, due: T, seen: true })).toBe(false);
    expect(isMastered({ box: MASTER, due: T, seen: true })).toBe(true);
    expect(isMastered({ box: MASTER, due: T, seen: false })).toBe(false);
  });
});

describe("introduce", () => {
  it("macht eine neue Karte zu einer gesehenen in Box 1", () => {
    expect(introduce({ box: 1, due: T - 3, seen: false }, T)).toEqual({ box: 1, due: T, seen: true });
  });
  it("lässt gesehene Karten unverändert", () => {
    const c: CardState = { box: 3, due: T + 2, seen: true };
    expect(introduce(c, T)).toBe(c);
  });
});

describe("rate", () => {
  it("falsch: zurück in Box 1, heute fällig", () => {
    expect(rate({ box: 5, due: T + 7, seen: true }, false, T)).toEqual({ box: 1, due: T, seen: true });
    expect(rate({ box: 1, due: T, seen: false }, false, T)).toEqual({ box: 1, due: T, seen: true });
  });
  it("richtig und fällig: eine Box höher, Termin nach Intervall", () => {
    expect(rate({ box: 1, due: T, seen: true }, true, T)).toEqual({ box: 2, due: T + 1, seen: true });
    expect(rate({ box: 3, due: T - 4, seen: true }, true, T)).toEqual({ box: 4, due: T + 4, seen: true });
  });
  it("richtig, aber noch nicht fällig: bleibt unverändert", () => {
    expect(rate({ box: 3, due: T + 2, seen: true }, true, T)).toEqual({ box: 3, due: T + 2, seen: true });
  });
  it("richtig bei ungesehener Karte mit Termin heute: Box 2, seen", () => {
    expect(rate({ box: 1, due: T, seen: false }, true, T)).toEqual({ box: 2, due: T + 1, seen: true });
  });
  it("Box wird bei MAX_BOX gedeckelt", () => {
    expect(rate({ box: MAX_BOX, due: T, seen: true }, true, T)).toEqual({ box: MAX_BOX, due: T + 90, seen: true });
    expect(rate({ box: MAX_BOX - 1, due: T, seen: true }, true, T).box).toBe(MAX_BOX);
  });
  it("Intervalle wachsen über alle Boxen", () => {
    let card: CardState = { box: 1, due: T, seen: true };
    const boxes: number[] = [];
    const gaps: number[] = [];
    for (let i = 0; i < 9; i++) {
      const next = rate(card, true, card.due);
      boxes.push(next.box);
      gaps.push(next.due - card.due);
      card = next;
    }
    expect(boxes).toEqual([2, 3, 4, 5, 6, 7, 8, 8, 8]);
    expect(gaps).toEqual([1, 2, 4, 7, 14, 30, 90, 90, 90]);
  });
  it("verändert die Eingabe nicht und gibt ein neues Objekt zurück", () => {
    const c: CardState = { box: 2, due: T, seen: true };
    const copy = { ...c };
    const early = rate({ box: 2, due: T + 1, seen: true }, true, T);
    const r = rate(c, true, T);
    expect(c).toEqual(copy);
    expect(r).not.toBe(c);
    expect(early.seen).toBe(true);
  });
});
