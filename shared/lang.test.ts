import { describe, expect, it } from "vitest";
import { ruleTyped } from "./answer";
import { contentWords } from "./forms";
import { foreignOf, withLang } from "./lang";
import { closeness, isCorrect, sayText, stripPlaceholders } from "./text";
import type { Foreign, Item } from "./types";

const item = (id: string, fr: string, de: string, lang: Foreign = "en"): Item => ({ id, setId: "s", lang, c: "c", fr, de });
const typed = { kind: "type" as const, articleHinted: false, formHinted: false };

describe("foreignOf", () => {
  it("kennt Englisch und nimmt sonst Französisch", () => {
    expect(foreignOf("en")).toBe("en");
    expect(foreignOf("fr")).toBe("fr");
    expect(foreignOf(undefined)).toBe("fr");
    expect(foreignOf("xx")).toBe("fr");
  });
});

describe("Englisch: richtig", () => {
  it('nimmt ein Verb mit und ohne "to"', () => {
    expect(isCorrect("go", ["to go"], "en")).toBe(true);
    expect(isCorrect("to go", ["go"], "en")).toBe(true);
    expect(isCorrect("to go", ["(to) go"], "en")).toBe(true);
    expect(isCorrect("go", ["(to) go"], "en")).toBe(true);
  });

  it("nimmt ein Nomen mit und ohne Artikel", () => {
    expect(isCorrect("house", ["a house"], "en")).toBe(true);
    expect(isCorrect("the house", ["house"], "en")).toBe(true);
    expect(isCorrect("an apple", ["apple"], "en")).toBe(true);
  });

  it("lässt kurze Wörter in Ruhe", () => {
    expect(isCorrect("to", ["to"], "en")).toBe(true);
    expect(isCorrect("a", ["to"], "en")).toBe(false);
    expect(isCorrect("to", ["to go"], "en")).toBe(false);
  });

  it("nimmt die drei Formen eines unregelmäßigen Verbs mit und ohne Komma", () => {
    expect(isCorrect("go went gone", ["go, went, gone"], "en")).toBe(true);
    expect(isCorrect("go, went, gone", ["go, went, gone"], "en")).toBe(true);
    expect(isCorrect("go went", ["go, went, gone"], "en")).toBe(false);
  });

  it("nimmt Platzhalter als Kürzel, ausgeschrieben oder gar nicht", () => {
    expect(isCorrect("ask sb for sth", ["to ask sb for sth"], "en")).toBe(true);
    expect(isCorrect("ask for", ["to ask sb for sth"], "en")).toBe(true);
    expect(isCorrect("to ask somebody for something", ["to ask sb for sth"], "en")).toBe(true);
    expect(isCorrect("something", ["something"], "en")).toBe(true);
    expect(isCorrect("something", ["to ask sb for sth"], "en")).toBe(false);
  });

  it("ändert nichts am Französischen", () => {
    expect(isCorrect("roman", ["le roman"])).toBe(false);
    expect(isCorrect("to go", ["go"])).toBe(false);
    expect(isCorrect("le roman", ["le roman"], "fr")).toBe(true);
  });
});

describe("Englisch: fast richtig", () => {
  it("kennt Tippfehler", () => {
    expect(closeness("beautifull", ["beautiful"], "en")).toBe("typo");
    expect(closeness("to arive", ["arrive"], "en")).toBe("typo");
  });

  it("gibt keinen Hinweis auf den Artikel", () => {
    expect(closeness("mouse", ["a house"], "en")).toBe("typo");
    expect(closeness("house", ["a house"], "en")).not.toBe("article");
    expect(closeness("roman", ["le roman"], "fr")).toBe("article");
  });
});

describe("Englisch: die Regel für eine getippte Antwort", () => {
  const go = item("1", "to go", "gehen");
  const house = item("2", "house", "das Haus");
  const pool = [go, house];

  it("wertet ohne Hinweis auf den Artikel", () => {
    expect(ruleTyped("go", go, pool, typed)).toEqual({ type: "correct" });
    expect(ruleTyped("the house", house, pool, typed)).toEqual({ type: "correct" });
  });

  it("erkennt eine andere Form desselben Wortes", () => {
    const arrive = item("3", "to arrive", "ankommen");
    expect(ruleTyped("he arrives", arrive, [arrive], typed)).toEqual({ type: "formHint", other: null });
  });

  it("bittet um alle Formen, wenn nur die erste da steht", () => {
    const irregular = item("4", "(to) go, went, gone", "gehen");
    expect(ruleTyped("go", irregular, [irregular], typed)).toEqual({ type: "formHint", other: null, partial: true });
    expect(ruleTyped("to go", irregular, [irregular], typed)).toEqual({ type: "formHint", other: null, partial: true });
    expect(ruleTyped("go went gone", irregular, [irregular], typed)).toEqual({ type: "correct" });
    expect(ruleTyped("to go, went, gone", irregular, [irregular], typed)).toEqual({ type: "correct" });
    expect(ruleTyped("went", irregular, [irregular], typed)).toEqual({ type: "wrong", askJudge: true });
  });

  it("fragt bei einem anderen Wort den Schiedsrichter", () => {
    expect(ruleTyped("walk", go, pool, typed)).toEqual({ type: "wrong", askJudge: true });
    expect(ruleTyped("house", go, pool, typed)).toEqual({ type: "wrong", askJudge: false });
  });
});

describe("Englisch: Platzhalter und Aussprache", () => {
  it("lässt Platzhalter beim Abschreiben weg", () => {
    expect(stripPlaceholders("to ask sb for sth")).toBe("to ask for");
    expect(stripPlaceholders("to hurt sb/sth")).toBe("to hurt");
    expect(stripPlaceholders("sb's turn")).toBe("turn");
    expect(stripPlaceholders("(to) go")).toBe("go");
  });

  it("spricht Platzhalter aus", () => {
    expect(sayText("to ask sb for sth", "en")).toBe("to ask somebody for something");
    expect(sayText("(to) go", "en")).toBe("to go");
    expect(sayText("sb's turn", "en")).toBe("somebody's turn");
    expect(sayText("go, went, gone", "en")).toBe("go, went, gone");
  });

  it("zählt Artikel und Pronomen nicht als Inhalt", () => {
    expect(contentWords("to arrive", "en")).toEqual(["arrive"]);
    expect(contentWords("he/she arrives", "en")).toEqual(["arrives"]);
    expect(contentWords("le roman", "en")).toEqual(["le", "roman"]);
  });
});

describe("withLang", () => {
  it("nennt die Sprache nur, wenn es mehr als eine gibt", () => {
    expect(withLang("Gestern fotografiert", "en", ["fr", "fr"])).toBe("Gestern fotografiert");
    expect(withLang("Gestern fotografiert", "en", ["fr", "en"])).toBe("Englisch · gestern fotografiert");
    expect(withLang(null, "fr", ["fr", "en"])).toBe("Französisch");
    expect(withLang(null, "fr", ["fr"])).toBeNull();
  });
});
