import { describe, expect, it } from "vitest";
import { anotherForm, contentWords } from "./forms";
import type { Item } from "./types";

const item = (id: string, fr: string, de: string): Item => ({ id, setId: "s", lang: "fr", c: "c", fr, de });

const arriver = item("1", "il/elle arrive à + inf.", "es gelingt ihm/ihr, etw. zu tun");
const arriverQc = item("2", "arriver à qc / + inf.", "etw. erreichen");
const pool = [arriver, arriverQc];

describe("contentWords", () => {
  it("lässt Artikel, Pronomen und Platzhalter weg", () => {
    expect(contentWords("il/elle arrive à + inf.")).toEqual(["arrive", "a"]);
    expect(contentWords("Arriver à qc")).toEqual(["arriver", "a"]);
    expect(contentWords("l'amour")).toEqual(["amour"]);
    expect(contentWords("j'arrive")).toEqual(["arrive"]);
    expect(contentWords("les élèves")).toEqual(["eleves"]);
  });
});

describe("anotherForm", () => {
  it("erkennt den Infinitiv statt der konjugierten Form", () => {
    expect(anotherForm("arriver à", [arriver.fr], arriver, [arriver])).toEqual({ other: null });
  });

  it("erkennt die konjugierte Form ohne Pronomen", () => {
    expect(anotherForm("arrive à", [arriver.fr], arriver, [arriver])).toEqual({ other: null });
  });

  it("nennt die andere Karte, wenn deren Lösung getippt wurde", () => {
    const result = anotherForm("arriver à", [arriver.fr], arriver, pool);
    expect(result?.other?.id).toBe("2");
  });

  it("lässt Akzente und Großschreibung außer Acht", () => {
    expect(anotherForm("ARRIVER A", [arriver.fr], arriver, [arriver])).toEqual({ other: null });
  });

  it("ist nicht zuständig für richtige Antworten", () => {
    expect(anotherForm("il arrive à", [arriver.fr], arriver, [arriver])).toBeNull();
    expect(anotherForm("elle arrive à", [arriver.fr], arriver, [arriver])).toBeNull();
  });

  it("ist nicht zuständig für fast richtige Antworten", () => {
    expect(anotherForm("il arrive a", [arriver.fr], arriver, [arriver])).toBeNull(); // Akzent
    expect(anotherForm("il arrve à", [arriver.fr], arriver, [arriver])).toBeNull(); // Tippfehler
    const roman = item("3", "le roman", "der Roman");
    expect(anotherForm("roman", [roman.fr], roman, [roman])).toBeNull(); // Artikel fehlt
  });

  it("verlangt gleich viele Inhaltswörter", () => {
    expect(anotherForm("arriver", [arriver.fr], arriver, [arriver])).toBeNull();
    expect(anotherForm("arriver à faire", [arriver.fr], arriver, [arriver])).toBeNull();
  });

  it("verlangt einen gemeinsamen Wortanfang", () => {
    expect(anotherForm("partir à", [arriver.fr], arriver, [arriver])).toBeNull();
    expect(anotherForm("arriver de", [arriver.fr], arriver, [arriver])).toBeNull();
  });

  it("verlangt bei kurzen Wörtern Gleichheit", () => {
    const aller = item("4", "il va au lit", "er geht ins Bett");
    expect(anotherForm("il vu au lit", [aller.fr], aller, [aller])).toBeNull();
  });

  it("lässt unverwandte Wörter der Lektion unberührt", () => {
    const chat = item("5", "le chat", "die Katze");
    expect(anotherForm("le chien", [chat.fr], chat, [chat, item("6", "le chien", "der Hund")])).toBeNull();
  });

  it("kennt den Plural", () => {
    const chat = item("5", "le chat", "die Katze");
    expect(anotherForm("les chats", [chat.fr], chat, [chat])).toEqual({ other: null });
  });

  it("kennt leere Antworten", () => {
    expect(anotherForm("  ", [arriver.fr], arriver, [arriver])).toBeNull();
    expect(anotherForm("il", [arriver.fr], arriver, [arriver])).toBeNull();
  });
});
