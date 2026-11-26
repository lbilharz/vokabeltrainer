import { describe, expect, it } from "vitest";
import { type RulingState, ruleTyped } from "./answer";
import type { Item } from "./types";

const item = (id: string, fr: string, de: string): Item => ({ id, setId: "s", lang: "fr", c: "c", fr, de });

const maison = item("1", "la maison", "das Haus");
const ecole = item("2", "l'école", "die Schule");
const arriver = item("3", "il/elle arrive à + inf.", "es gelingt ihm/ihr, etw. zu tun");
const arriverQc = item("4", "arriver à qc / + inf.", "etw. erreichen");
const pool = [maison, ecole, arriver, arriverQc];

const first: RulingState = { kind: "type", articleHinted: false, formHinted: false };

describe("ruleTyped", () => {
  it("wertet eine leere Antwort nicht", () => {
    expect(ruleTyped("  ", maison, pool, first)).toEqual({ type: "empty" });
  });

  it("nimmt die richtige Antwort", () => {
    expect(ruleTyped("la maison", maison, pool, first)).toEqual({ type: "correct" });
  });

  it("nimmt fehlende Akzente und einen Tippfehler als fast richtig", () => {
    expect(ruleTyped("l'ecole", ecole, pool, first)).toEqual({ type: "correct", near: "accents" });
    expect(ruleTyped("la maisen", maison, pool, first)).toEqual({ type: "correct", near: "typo" });
  });

  it("gibt beim fehlenden Artikel einen Hinweis und beim zweiten Mal falsch", () => {
    expect(ruleTyped("maison", maison, pool, first)).toEqual({ type: "articleHint" });
    expect(ruleTyped("maison", maison, pool, { ...first, articleHinted: true })).toEqual({
      type: "wrong",
      askJudge: false,
    });
  });

  it("gibt bei einer anderen Form einen Hinweis, aber nur einmal", () => {
    expect(ruleTyped("arriver à", arriver, [arriver], first)).toEqual({ type: "formHint", other: null });
    expect(ruleTyped("arriver à", arriver, [arriver], { ...first, formHinted: true })).toEqual({
      type: "wrong",
      askJudge: true,
    });
  });

  it("nennt die andere Karte, wenn deren Lösung getippt wurde", () => {
    expect(ruleTyped("arriver à qc", arriver, pool, first)).toEqual({ type: "formHint", other: arriverQc });
  });

  it("fragt bei einem fremden Wort den Schiedsrichter", () => {
    expect(ruleTyped("le bâtiment", maison, pool, first)).toEqual({ type: "wrong", askJudge: true });
  });

  it("fragt nicht nach, wenn ein anderes Wort der Lektion getippt wurde", () => {
    expect(ruleTyped("l'école", maison, pool, first)).toEqual({ type: "wrong", askJudge: false });
  });

  it("kennt beim Hören keine andere Form und keinen Schiedsrichter", () => {
    const listening: RulingState = { ...first, kind: "listenType" };
    expect(ruleTyped("arriver à", arriver, [arriver], listening)).toEqual({ type: "wrong", askJudge: false });
    expect(ruleTyped("le bâtiment", maison, pool, listening)).toEqual({ type: "wrong", askJudge: false });
  });
});
