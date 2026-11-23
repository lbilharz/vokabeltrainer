import { describe, expect, it } from "vitest";
import {
  accentBase,
  advanceCopy,
  closestVariant,
  copySlots,
  copyTarget,
  gapSlots,
  hasGaps,
  markDiff,
  rateGaps,
  skipGiven,
} from "./copy";

const typeAll = (target: string, input: string) => advanceCopy(copySlots(target), 0, input);
const marked = (answer: string, right: string) =>
  markDiff(answer, right)
    .map((m) => (m.miss ? `[${m.ch}]` : m.ch))
    .join("");

describe("copyTarget", () => {
  it("lässt Platzhalter weg", () => {
    expect(copyTarget("découvrir qn/qc")).toBe("découvrir");
    expect(copyTarget("proposer (à qn) de + inf.")).toBe("proposer de");
  });

  it("nimmt bei zwei Sätzen den ersten", () => {
    expect(copyTarget("Tu habites où ? / Où est-ce que tu habites ?")).toBe("Tu habites où ?");
    expect(copyTarget("le gardien / la gardienne")).toBe("le gardien");
  });

  it("behält beide Formen eines Wortes", () => {
    expect(copyTarget("italien/italienne")).toBe("italien/italienne");
  });
});

describe("copySlots", () => {
  it("lässt das Kind Buchstaben, Apostroph, Bindestrich und Wortlücken tippen", () => {
    const slots = copySlots("l'ami est-ce");
    expect(slots.every((slot) => !slot.given)).toBe(true);
  });

  it("setzt Satzzeichen und die Lücken daneben selbst", () => {
    const slots = copySlots("Tu habites où ?");
    expect(slots.filter((slot) => slot.given).map((slot) => slot.ch)).toEqual([" ", "?"]);
    expect(copySlots("italien/italienne").filter((slot) => slot.given).map((slot) => slot.ch)).toEqual(["/"]);
  });
});

describe("advanceCopy", () => {
  it("nimmt das richtige Wort Buchstabe für Buchstabe an", () => {
    const slots = copySlots("le rêve");
    let done = 0;
    for (const ch of "le rêve") {
      const step = advanceCopy(slots, done, ch);
      expect(step.wrong).toBeNull();
      done = step.done;
    }
    expect(done).toBe(slots.length);
  });

  it("nimmt einen falschen Buchstaben nicht an", () => {
    expect(typeAll("le rêve", "le reve")).toEqual({ done: 4, wrong: "e" });
    expect(typeAll("le roman", "la")).toEqual({ done: 1, wrong: "a" });
  });

  it("achtet nicht auf groß und klein", () => {
    expect(typeAll("Tu habites", "tu HABITES").done).toBe(10);
  });

  it("nimmt jeden Apostroph der Tastatur", () => {
    expect(typeAll("l'ami", "l’ami")).toEqual({ done: 5, wrong: null });
  });

  it("setzt Satzzeichen selbst und verzeiht getippte", () => {
    const target = "Tu habites où ?";
    expect(typeAll(target, "tu habites où")).toEqual({ done: target.length, wrong: null });
    expect(typeAll(target, "tu habites où ?")).toEqual({ done: target.length, wrong: null });
    expect(typeAll("italien/italienne", "italienitalienne").done).toBe(17);
    expect(typeAll("italien/italienne", "italien/italienne").done).toBe(17);
  });

  it("verzeiht eine doppelte Lücke", () => {
    expect(typeAll("le rêve", "le  rêve")).toEqual({ done: 7, wrong: null });
  });

  it("verlangt die Lücke zwischen zwei Wörtern", () => {
    expect(typeAll("le rêve", "lerêve")).toEqual({ done: 2, wrong: "r" });
  });

  it("überspringt Zeichen am Anfang, die die App setzt", () => {
    expect(skipGiven(copySlots("… et toi"), 0)).toBe(2);
  });
});

describe("accentBase", () => {
  it("erkennt den Buchstaben ohne Akzent", () => {
    expect(accentBase("ê", "e")).toBe("e");
    expect(accentBase("ù", "u")).toBe("u");
    expect(accentBase("œ", "o")).toBe("o");
    expect(accentBase("é", "è")).toBe("e");
  });

  it("sagt nichts bei einem ganz anderen Buchstaben", () => {
    expect(accentBase("ê", "a")).toBeNull();
    expect(accentBase("e", "a")).toBeNull();
  });
});

describe("closestVariant", () => {
  it("wählt die Form, die gemeint war", () => {
    expect(closestVariant("la gardiene", "le gardien / la gardienne")).toBe("la gardienne");
    expect(closestVariant("le journalist", "le/la journaliste")).toBe("le journaliste");
    expect(closestVariant("decouvrir", "découvrir qn/qc")).toBe("découvrir");
  });

  it("nimmt bei Gleichstand die längere Form", () => {
    // "italiene" ist von "italien" und von "italienne" gleich weit weg.
    expect(closestVariant("italiene", "italien/italienne")).toBe("italienne");
    expect(marked("italiene", closestVariant("italiene", "italien/italienne"))).toMatch(/^italie(\[n\]n|n\[n\])e$/);
  });
});

describe("markDiff", () => {
  it("markiert den fehlenden Akzent", () => {
    expect(marked("le reve", "le rêve")).toBe("le r[ê]ve");
    expect(marked("decouvrir", "découvrir")).toBe("d[é]couvrir");
  });

  it("markiert einen fehlenden und einen falschen Buchstaben", () => {
    expect(marked("la gardiene", "la gardienne")).toMatch(/^la gardie(\[n\]n|n\[n\])e$/);
    expect(marked("le roman polisier", "le roman policier")).toBe("le roman poli[c]ier");
  });

  it("markiert nichts bei richtiger Antwort und nie ein Satzzeichen", () => {
    expect(marked("l'ami", "l'ami")).toBe("l'ami");
    expect(marked("lami", "l'ami")).toBe("l'ami");
    expect(marked("tu habites ou", "Tu habites où ?")).toBe("Tu habites o[ù] ?");
  });
});

describe("gapSlots", () => {
  const shown = (target: string) =>
    gapSlots(target)
      .map((slot) => (slot.hidden ? "_" : slot.ch))
      .join("");

  it("lässt den ersten Buchstaben längerer Wortteile stehen", () => {
    expect(shown("le roman policier")).toBe("__ r____ p_______");
    expect(shown("découvrir")).toBe("d________");
  });

  it("verbirgt kurze Teile ganz", () => {
    expect(shown("l'amour")).toBe("_'a____");
    expect(shown("à la mer")).toBe("_ __ m__");
  });

  it("lässt Satzzeichen, Striche und Schrägstriche stehen", () => {
    expect(shown("Où est-ce que tu habites ?")).toBe("__ e__-__ q__ __ h______ ?");
    expect(shown("italien/italienne")).toBe("i______/i________");
  });

  it("lässt sich nur mit den Lücken füllen", () => {
    const slots = gapSlots("le roman policier");
    expect(advanceCopy(slots, 0, "leomanolicier")).toEqual({ done: slots.length, wrong: null });
    // Wer die Lücken zwischen den Wörtern mittippt, macht keinen Fehler.
    expect(advanceCopy(slots, 0, "le oman olicier")).toEqual({ done: slots.length, wrong: null });
    expect(advanceCopy(slots, 0, "la")).toEqual({ done: 1, wrong: "a" });
  });

  it("erkennt Texte ohne Lücken", () => {
    expect(hasGaps("le rêve")).toBe(true);
    expect(hasGaps("… ?")).toBe(false);
  });
});

describe("rateGaps", () => {
  const long = gapSlots("le roman policier");
  const short = gapSlots("la mer");

  it("ist richtig ohne Fehlversuch", () => {
    expect(rateGaps(long, 0)).toEqual({ correct: true, near: false });
  });

  it("verzeiht bei längeren Wörtern einen Ausrutscher", () => {
    expect(rateGaps(long, 1)).toEqual({ correct: true, near: true });
    expect(rateGaps(long, 2)).toEqual({ correct: false, near: false });
  });

  it("verzeiht bei kurzen Wörtern nichts", () => {
    expect(short.filter((slot) => slot.hidden)).toHaveLength(4);
    expect(rateGaps(gapSlots("la"), 1)).toEqual({ correct: false, near: false });
  });
});
