import { describe, expect, it } from "vitest";
import { mergeReadings, type ReadItem } from "./extract";

const it_ = (fr: string, de: string, c: string | null = null, n: string | null = null): ReadItem => ({
  c,
  fr,
  de,
  n,
});

const frs = (items: { fr: string }[]) => items.map((i) => i.fr);

describe("mergeReadings", () => {
  it("Regel 1 und 2: gleiche Einträge sind sicher, Reihenfolge von a", () => {
    const a = [it_("un", "ein"), it_("deux", "zwei"), it_("trois", "drei")];
    const b = [it_("trois", "drei"), it_("un", "ein"), it_("deux", "zwei")];
    const r = mergeReadings(a, b);
    expect(frs(r)).toEqual(["un", "deux", "trois"]);
    expect(r.every((i) => !i.check)).toBe(true);
  });

  it("Regel 2: c und n kommen aus a, fehlen sie, aus b", () => {
    const a = [it_("un", "ein", "Volet 1", null), it_("deux", "zwei", null, "Hinweis a")];
    const b = [it_("un", "ein", "Volet X", "Hinweis b"), it_("deux", "zwei", "Volet 2", "Hinweis b")];
    const r = mergeReadings(a, b);
    expect(r[0]).toEqual({ c: "Volet 1", fr: "un", de: "ein", n: "Hinweis b", check: false });
    expect(r[1]).toEqual({ c: "Volet 2", fr: "deux", de: "zwei", n: "Hinweis a", check: false });
  });

  it("vergleicht ohne Groß- und Kleinschreibung, Satzzeichen und Leerzeichen um den Schrägstrich", () => {
    const a = [it_("le gardien / la gardienne", "der Wächter")];
    const b = [it_("Le gardien/la gardienne", "der Wächter.")];
    const r = mergeReadings(a, b);
    expect(r).toHaveLength(1);
    expect(r[0]?.check).toBe(false);
    expect(r[0]?.fr).toBe("le gardien / la gardienne");
  });

  it("Regel 3: gleiches Stichwort, andere Übersetzung gibt check und behält a", () => {
    const r = mergeReadings([it_("un", "ein")], [it_("un", "eins")]);
    expect(r).toEqual([{ c: null, fr: "un", de: "ein", n: null, check: true }]);
  });

  it("Regel 4: Stichwort fehlt in b gibt check", () => {
    const r = mergeReadings([it_("un", "ein"), it_("deux", "zwei")], [it_("un", "ein")]);
    expect(r.map((i) => i.check)).toEqual([false, true]);
  });

  it("Regel 5: Eintrag nur in b kommt hinter den Vorgänger aus b", () => {
    const a = [it_("un", "ein"), it_("deux", "zwei"), it_("trois", "drei")];
    const b = [it_("un", "ein"), it_("x", "X"), it_("y", "Y"), it_("deux", "zwei"), it_("trois", "drei")];
    const r = mergeReadings(a, b);
    expect(frs(r)).toEqual(["un", "x", "y", "deux", "trois"]);
    expect(r.map((i) => i.check)).toEqual([false, true, true, false, false]);
  });

  it("Regel 5: ohne Vorgänger in a kommt der Eintrag an den Anfang, Reihenfolge von b bleibt", () => {
    const a = [it_("un", "ein")];
    const b = [it_("x", "X"), it_("y", "Y"), it_("un", "ein")];
    const r = mergeReadings(a, b);
    expect(frs(r)).toEqual(["x", "y", "un"]);
    expect(r.map((i) => i.check)).toEqual([true, true, false]);
  });

  it("Regel 5: Eintrag nur in b am Ende kommt ans Ende", () => {
    const r = mergeReadings([it_("un", "ein")], [it_("un", "ein"), it_("x", "X")]);
    expect(frs(r)).toEqual(["un", "x"]);
    expect(r[1]?.check).toBe(true);
  });

  it("Regel 5: Vorgänger ist ein Eintrag aus b, der in a vorkommt, auch bei anderer Übersetzung", () => {
    const a = [it_("un", "ein"), it_("deux", "zwei")];
    const b = [it_("un", "eins"), it_("x", "X")];
    expect(frs(mergeReadings(a, b))).toEqual(["un", "x", "deux"]);
  });

  it("Regel 6: doppelte Stichwörter, nur das erste zählt", () => {
    const a = [it_("un", "ein"), it_("un", "falsch"), it_("deux", "zwei")];
    const b = [it_("un", "ein"), it_("un", "anders"), it_("deux", "zwei")];
    const r = mergeReadings(a, b);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ fr: "un", de: "ein", check: false });
  });

  it("leere Lesungen", () => {
    expect(mergeReadings([], [])).toEqual([]);
    expect(mergeReadings([it_("un", "ein")], []).map((i) => i.check)).toEqual([true]);
    expect(mergeReadings([], [it_("un", "ein")]).map((i) => i.check)).toEqual([true]);
  });

  it("verschobene Zeilen: fünf Übersetzungen um eine Zeile versetzt", () => {
    const words = Array.from({ length: 14 }, (_, i) => it_(`mot${i}`, `Wort${i}`));
    const b = words.map((w) => ({ ...w }));
    // Zeilen 4 bis 8 bekommen die Übersetzung der jeweils nächsten Zeile.
    for (let i = 4; i <= 8; i++) b[i] = { ...words[i]!, de: words[i + 1]!.de };
    const r = mergeReadings(words, b);
    expect(frs(r)).toEqual(frs(words));
    r.forEach((item, i) => expect(item.check).toBe(i >= 4 && i <= 8));
  });

  it("zusammengezogene Einträge: beide Einträge aus a und der Zusatz aus b sind markiert", () => {
    const a = [
      it_("avant", "vor"),
      it_("le personnage", "die Figur"),
      it_("principal/principale/principaux", "Haupt-"),
      it_("la fin", "das Ende"),
    ];
    const b = [
      it_("avant", "vor"),
      it_("le personnage principal/principale/principaux", "die Figur Haupt-"),
      it_("la fin", "das Ende"),
    ];
    const r = mergeReadings(a, b);
    expect(frs(r)).toEqual([
      "avant",
      "le personnage principal/principale/principaux",
      "le personnage",
      "principal/principale/principaux",
      "la fin",
    ]);
    expect(r.map((i) => i.check)).toEqual([false, true, true, true, false]);
  });
});
