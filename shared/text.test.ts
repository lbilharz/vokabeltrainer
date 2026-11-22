import { describe, expect, it } from "vitest";
import { acceptedAnswers, closeness, fnv1a, isCorrect, itemId, norm, sayText } from "./text";

describe("fnv1a", () => {
  it("passt zum Python-Wert (Datei public/audio/fr/62eca1fc.mp3 existiert)", () => {
    expect(fnv1a("le rêve")).toBe("62eca1fc");
  });
  it("liefert immer 8 Hex-Zeichen", () => {
    expect(fnv1a("")).toBe("811c9dc5");
    expect(fnv1a("a")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("itemId", () => {
  it("setzt Set und Hash zusammen", () => {
    expect(itemId("u2", "le rêve")).toBe("u2:62eca1fc");
  });
});

describe("sayText", () => {
  it("entfernt Platzhalter im Französischen", () => {
    expect(sayText("découvrir qn/qc", "fr")).toBe("découvrir");
    expect(sayText("proposer (à qn) de + inf.", "fr")).toBe("proposer de");
  });
  it("setzt Schrägstrich im Französischen zu Komma", () => {
    expect(sayText("le gardien / la gardienne", "fr")).toBe("le gardien, la gardienne");
  });
  it("löst Abkürzungen im Deutschen auf", () => {
    expect(sayText("jdn/etw. entdecken", "de")).toBe("jemanden oder etwas entdecken");
    expect(sayText("(sich) ändern", "de")).toBe("sich ändern");
    expect(sayText("der/die Autor/in", "de")).toBe("der, die Autor, Autorin");
  });
});

describe("norm", () => {
  it("ignoriert Groß- und Kleinschreibung und Satzzeichen", () => {
    expect(norm("  Qu’est-ce   que TU fais ? ")).toBe("quest-ce que tu fais");
    expect(norm("Qu'est")).toBe("quest");
  });
  it("entfernt Auslassungspunkte", () => {
    expect(norm("je m'appelle … Et toi ?")).toBe("je mappelle et toi");
    expect(norm("je m'appelle ... Et toi")).toBe("je mappelle et toi");
  });
});

describe("acceptedAnswers und isCorrect", () => {
  it("akzeptiert mit und ohne Platzhalter", () => {
    expect(isCorrect("découvrir", ["découvrir qn/qc"])).toBe(true);
    expect(isCorrect("découvrir qn/qc", ["découvrir qn/qc"])).toBe(true);
  });
  it("akzeptiert jede Variante bei Schrägstrich", () => {
    const t = ["italien/italienne"];
    expect(isCorrect("italien", t)).toBe(true);
    expect(isCorrect("italienne", t)).toBe(true);
    expect(isCorrect("italien/italienne", t)).toBe(true);
  });
  it("akzeptiert eine Hälfte bei ' / '", () => {
    expect(isCorrect("le gardien", ["le gardien / la gardienne"])).toBe(true);
    expect(isCorrect("la gardienne", ["le gardien / la gardienne"])).toBe(true);
    // Im Diktat hört das Kind beide Formen und darf beide schreiben.
    expect(isCorrect("italien, italienne", ["italien/italienne"])).toBe(true);
    expect(isCorrect("le gardien, la gardienne", ["le gardien / la gardienne"])).toBe(true);
  });
  it("akzeptiert den typografischen Apostroph", () => {
    expect(isCorrect("l’amour", ["l'amour"])).toBe(true);
  });
  it("verlangt den Artikel", () => {
    expect(isCorrect("roman", ["le roman"])).toBe(false);
    expect(isCorrect("le roman", ["le roman"])).toBe(true);
  });
  it("ignoriert Schreibweise von Groß/Klein und Satzzeichen", () => {
    expect(isCorrect("  LE Roman! ", ["le roman"])).toBe(true);
  });
  it("lehnt leere Antworten ab", () => {
    expect(isCorrect("", ["le roman"])).toBe(false);
    expect(isCorrect(" ?! ", ["le roman"])).toBe(false);
  });
  it("akzeptiert eines von mehreren Zielen", () => {
    const t = ["le roman", "la nouvelle"];
    expect(isCorrect("la nouvelle", t)).toBe(true);
    expect(isCorrect("le roman", t)).toBe(true);
    expect(isCorrect("le livre", t)).toBe(false);
  });
  it("enthält die normierte Grundform", () => {
    expect(acceptedAnswers("Le Roman").has("le roman")).toBe(true);
  });
});

describe("closeness", () => {
  it("erkennt fehlende Akzente", () => {
    expect(closeness("decouvrir", ["découvrir qn/qc"])).toBe("accents");
    expect(closeness("le reve", ["le rêve"])).toBe("accents");
    expect(closeness("coeur", ["cœur"])).toBe("accents");
  });

  it("erkennt einen Tippfehler", () => {
    expect(closeness("decuvrir", ["découvrir qn/qc"])).toBe("typo");
    expect(closeness("heureusment", ["heureusement"])).toBe("typo");
    // Vertauschte Buchstaben zählen als ein Fehler.
    expect(closeness("triset", ["triste"])).toBe("typo");
    expect(closeness("tirset", ["triste"])).toBe(null);
    expect(closeness("tristes", ["triste"])).toBe("typo");
  });

  it("erkennt einen fehlenden Artikel", () => {
    expect(closeness("roman", ["le roman"])).toBe("article");
    expect(closeness("amour", ["l'amour"])).toBe("article");
    expect(closeness("gardienne", ["le gardien / la gardienne"])).toBe("article");
  });

  it("wertet einen falschen Artikel nicht als Tippfehler", () => {
    expect(closeness("la roman", ["le roman"])).toBe(null);
    expect(closeness("le fée", ["la fée"])).toBe(null);
    expect(closeness("un roman", ["le roman"])).toBe(null);
    // Mit richtigem Artikel bleibt ein Tippfehler ein Tippfehler.
    expect(closeness("le romam", ["le roman"])).toBe("typo");
  });

  it("gibt bei kurzen Wörtern keine Nachsicht", () => {
    expect(closeness("le", ["la"])).toBe(null);
    expect(closeness("dz", ["da"])).toBe(null);
  });

  it("lehnt ganz andere Antworten ab", () => {
    expect(closeness("falsch", ["découvrir qn/qc"])).toBe(null);
    expect(closeness("", ["le roman"])).toBe(null);
    expect(closeness("le thème", ["le roman"])).toBe(null);
  });

  it("erlaubt bei langen Wörtern zwei Fehler", () => {
    expect(closeness("heureusmnt", ["heureusement"])).toBe("typo");
    expect(closeness("heursmnt", ["heureusement"])).toBe(null);
  });
});
