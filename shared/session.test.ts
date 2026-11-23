import { describe, expect, it } from "vitest";
import u2 from "../src/data/u2.json";
import saetze from "../src/data/saetze.json";
import {
  NEW_PER_ROUND,
  REVIEW_LIMIT,
  buildOptions,
  countDueBy,
  makeStep,
  pickKind,
  planToday,
  shuffle,
  targetsFor,
} from "./session";
import type { Random, SetItems } from "./session";
import { itemId, norm } from "./text";
import type { CardState, Item, Progress, RawItem } from "./types";

// Kleiner Zufallsgenerator mit festem Startwert (mulberry32).
const seeded = (seed: number): Random => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Liefert feste Werte der Reihe nach, am Ende wieder von vorn.
const fixed = (values: number[]): Random => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

const toItems = (setId: string, raw: RawItem[]): Item[] =>
  raw.map((r) => ({ ...r, setId, id: itemId(setId, r.fr) }));

const mk = (setId: string, n: number, c = "A"): Item[] =>
  Array.from({ length: n }, (_, i) => ({
    c,
    fr: `fr${i}`,
    de: `de${setId}${i}`,
    setId,
    id: `${setId}:${i}`,
  }));

const card = (box: number, due: number, seen = true): CardState => ({ box, due, seen });

describe("shuffle", () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];

  it("gibt ein neues Array zurück", () => {
    expect(shuffle(xs, seeded(1))).not.toBe(xs);
  });
  it("behält dieselben Elemente", () => {
    const out = shuffle(xs, seeded(2));
    expect(out).toHaveLength(xs.length);
    expect([...out].sort((a, b) => a - b)).toEqual(xs);
  });
  it("verändert die Eingabe nicht", () => {
    const copy = [...xs];
    shuffle(xs, seeded(3));
    expect(xs).toEqual(copy);
  });
  it("kommt mit leerer und einelementiger Liste klar", () => {
    expect(shuffle([], seeded(1))).toEqual([]);
    expect(shuffle([7], seeded(1))).toEqual([7]);
  });
});

describe("pickKind", () => {
  it("ungesehene Karte gibt intro, auch mit Hör-Aufgaben", () => {
    expect(pickKind(card(1, 0, false), false, fixed([0.9]))).toBe("intro");
    expect(pickKind(card(1, 0, false), true, fixed([0.9]))).toBe("intro");
  });
  it("ohne Hör-Aufgaben ab Box 3 immer type", () => {
    for (const box of [3, 5, 8]) {
      expect(pickKind(card(box, 0), false, fixed([0.1]))).toBe("type");
      expect(pickKind(card(box, 0), false, fixed([0.9]))).toBe("type");
    }
  });
  it("ohne Hör-Aufgaben wechseln in Box 1 und 2 Lückenwort und type", () => {
    for (const box of [1, 2]) {
      expect(pickKind(card(box, 0), false, fixed([0.1]))).toBe("gap");
      expect(pickKind(card(box, 0), false, fixed([0.9]))).toBe("type");
    }
  });
  it("mit Hör-Aufgaben und random unter 0.5 wird geschrieben", () => {
    expect(pickKind(card(1, 0), true, fixed([0.49, 0.49]))).toBe("gap");
    expect(pickKind(card(1, 0), true, fixed([0.49, 0.9]))).toBe("type");
    expect(pickKind(card(5, 0), true, fixed([0]))).toBe("type");
  });
  it("mit Hör-Aufgaben und random ab 0.5 gibt listenChoice in Box 1 und 2", () => {
    expect(pickKind(card(1, 0), true, fixed([0.5]))).toBe("listenChoice");
    expect(pickKind(card(2, 0), true, fixed([0.9]))).toBe("listenChoice");
  });
  it("mit Hör-Aufgaben und random ab 0.5 gibt listenType ab Box 3", () => {
    expect(pickKind(card(3, 0), true, fixed([0.5]))).toBe("listenType");
    expect(pickKind(card(8, 0), true, fixed([0.99]))).toBe("listenType");
  });
});

describe("buildOptions mit u2.json", () => {
  const items = toItems("u2", u2 as RawItem[]);

  it("gibt für jede Karte genau 4 verschiedene Antworten mit der richtigen genau einmal", () => {
    for (const seed of [1, 2, 3, 42]) {
      const random = seeded(seed);
      for (const item of items) {
        const opts = buildOptions(item, items, random);
        expect(opts).toHaveLength(4);
        expect(opts.filter((o) => o === item.de)).toHaveLength(1);
        expect(new Set(opts).size).toBe(4);
        expect(new Set(opts.map(norm)).size).toBe(4);
      }
    }
  });
  it("nimmt falsche Antworten zuerst aus demselben Abschnitt", () => {
    const volet2 = items.filter((i) => i.c === "Volet 2");
    const de2 = new Set(volet2.map((i) => i.de));
    for (const seed of [1, 2, 3]) {
      const random = seeded(seed);
      for (const item of volet2) {
        const opts = buildOptions(item, items, random);
        expect(opts.every((o) => de2.has(o))).toBe(true);
      }
    }
  });
  it("füllt aus dem ganzen Pool auf, wenn der Abschnitt zu klein ist", () => {
    const own: Item = { c: "Allein", fr: "x", de: "einzig", setId: "t", id: "t:x" };
    const opts = buildOptions(own, [own, ...items], seeded(5));
    expect(opts).toHaveLength(4);
    expect(opts).toContain("einzig");
  });
  it("gibt bei einem Pool aus nur 2 Karten 2 Antworten", () => {
    const pair = mk("p", 2);
    const opts = buildOptions(pair[0]!, pair, seeded(1));
    expect(opts).toHaveLength(2);
    expect([...opts].sort()).toEqual(pair.map((i) => i.de).sort());
  });
  it("lässt eine zweite Karte mit gleichem deutschen Text nicht als falsche Antwort zu", () => {
    const a: Item = { c: "A", fr: "a", de: "Gleich", setId: "t", id: "t:a" };
    const b: Item = { c: "A", fr: "b", de: "gleich!", setId: "t", id: "t:b" };
    const opts = buildOptions(a, [a, b], seeded(1));
    expect(opts).toEqual(["Gleich"]);
  });
});

describe("makeStep", () => {
  const pool = mk("p", 6);
  const item = pool[0]!;

  it("setzt options bei intro", () => {
    const step = makeStep(item, card(1, 0, false), pool, true, seeded(1));
    expect(step.kind).toBe("intro");
    expect(step.itemId).toBe(item.id);
    expect(step.options).toHaveLength(4);
  });
  it("setzt options bei listenChoice", () => {
    const step = makeStep(item, card(1, 0), pool, true, fixed([0.9]));
    expect(step.kind).toBe("listenChoice");
    expect(step.options).toHaveLength(4);
    expect(step.options).toContain(item.de);
  });
  it("lässt options bei type weg", () => {
    const step = makeStep(item, card(2, 0), pool, false, fixed([0.9]));
    expect(step.kind).toBe("type");
    expect(step.options).toBeUndefined();
  });
  it("gibt in Box 1 auch das Lückenwort", () => {
    const step = makeStep(item, card(1, 0), pool, false, fixed([0.1]));
    expect(step.kind).toBe("gap");
    expect(step.options).toBeUndefined();
  });
  it("nimmt type, wenn es nichts zu füllen gibt", () => {
    const bare = { ...item, fr: "… ?" };
    expect(makeStep(bare, card(1, 0), pool, false, fixed([0.1])).kind).toBe("type");
  });
  it("lässt options bei listenType weg", () => {
    const step = makeStep(item, card(4, 0), pool, true, fixed([0.9]));
    expect(step.kind).toBe("listenType");
    expect(step.options).toBeUndefined();
  });
});

describe("targetsFor", () => {
  it("gibt normalerweise nur die eigene französische Seite", () => {
    const pool = mk("p", 4);
    expect(targetsFor(pool[1]!, pool)).toEqual([pool[1]!.fr]);
  });
  it("nimmt bei gleichem deutschen Text beide Lösungen, die eigene zuerst", () => {
    const pool = toItems("saetze", saetze as RawItem[]);
    const same = pool.filter((i) => i.de === "Wo wohnst du?");
    expect(same).toHaveLength(2);
    const [a, b] = same as [Item, Item];
    expect(targetsFor(a, pool)).toEqual([a.fr, b.fr]);
    expect(targetsFor(b, pool)).toEqual([b.fr, a.fr]);
  });
  it("vergleicht ohne Groß- und Kleinschreibung und ohne Satzzeichen", () => {
    const a: Item = { c: "A", fr: "a", de: "Wo wohnst du?", setId: "t", id: "t:a" };
    const b: Item = { c: "A", fr: "b", de: "wo wohnst du", setId: "t", id: "t:b" };
    expect(targetsFor(a, [a, b])).toEqual(["a", "b"]);
  });
});

describe("planToday", () => {
  const today = 100;
  const setA: SetItems = { id: "a", items: mk("a", 12) };
  const setB: SetItems = { id: "b", items: mk("b", 12) };
  const sets = [setA, setB];

  it("nimmt fällige Karten aus allen Sets, nach due und dann nach box sortiert", () => {
    const progress: Progress = {
      "a:0": card(3, 98),
      "b:0": card(1, 95),
      "a:1": card(2, 98),
      "b:1": card(5, 98),
      "a:2": card(1, 99),
    };
    const plan = planToday(sets, "a", progress, today, 5);
    expect(plan.dueIds).toEqual(["b:0", "a:1", "a:0", "b:1", "a:2"]);
    expect(plan.dueTotal).toBe(5);
  });
  it("lässt ungesehene Karten nie in dueIds", () => {
    const progress: Progress = { "a:0": card(1, 50, false), "a:1": card(1, 50) };
    const plan = planToday(sets, "a", progress, today, 5);
    expect(plan.dueIds).toEqual(["a:1"]);
  });
  it("lässt Karten mit due nach heute weg, nimmt aber due gleich heute", () => {
    const progress: Progress = { "a:0": card(2, today + 1), "a:1": card(2, today) };
    const plan = planToday(sets, "a", progress, today, 5);
    expect(plan.dueIds).toEqual(["a:1"]);
    expect(plan.dueTotal).toBe(1);
  });
  it("kappt dueIds bei REVIEW_LIMIT und meldet in dueTotal alle", () => {
    const progress: Progress = {};
    for (const item of setA.items) progress[item.id] = card(1, 90);
    for (const item of setB.items.slice(0, 3)) progress[item.id] = card(1, 90);
    const plan = planToday(sets, "a", progress, today, 5);
    expect(plan.dueIds).toHaveLength(REVIEW_LIMIT);
    expect(plan.dueTotal).toBe(15);
  });
  it("nimmt neue Karten nur aus dem aktiven Set, in Reihenfolge und nur ungesehene", () => {
    const progress: Progress = { "b:0": card(1, today, false), "a:0": card(1, 200), "a:2": card(2, 200) };
    const plan = planToday(sets, "a", progress, today, 3);
    expect(plan.newIds).toEqual(["a:1", "a:3", "a:4"]);
    const planB = planToday(sets, "b", progress, today, 2);
    expect(planB.newIds).toEqual(["b:0", "b:1"]);
  });
  it("kappt neue Karten bei min(newLeft, NEW_PER_ROUND)", () => {
    expect(planToday(sets, "a", {}, today, 2).newIds).toHaveLength(2);
    expect(planToday(sets, "a", {}, today, 100).newIds).toHaveLength(NEW_PER_ROUND);
  });
  it("gibt bei newLeft 0 oder negativ keine neuen Karten", () => {
    expect(planToday(sets, "a", {}, today, 0).newIds).toEqual([]);
    expect(planToday(sets, "a", {}, today, -3).newIds).toEqual([]);
  });
  it("gibt bei unbekanntem activeSetId keine neuen Karten", () => {
    const plan = planToday(sets, "gibt-es-nicht", {}, today, 5);
    expect(plan.newIds).toEqual([]);
    expect(plan.dueIds).toEqual([]);
    expect(plan.dueTotal).toBe(0);
  });
});

describe("countDueBy", () => {
  const sets: SetItems[] = [
    { id: "a", items: mk("a", 4) },
    { id: "b", items: mk("b", 4) },
  ];

  it("zählt gesehene Karten mit due bis einschließlich day aus allen Sets", () => {
    const progress: Progress = {
      "a:0": card(1, 10),
      "a:1": card(1, 11),
      "b:0": card(2, 5),
      "b:1": card(2, 12),
    };
    expect(countDueBy(sets, progress, 11)).toBe(3);
    expect(countDueBy(sets, progress, 4)).toBe(0);
    expect(countDueBy(sets, progress, 50)).toBe(4);
  });
  it("ignoriert ungesehene Karten und Karten ohne Eintrag", () => {
    const progress: Progress = { "a:0": card(1, 1, false), "b:0": card(1, 1) };
    expect(countDueBy(sets, progress, 10)).toBe(1);
  });
  it("gibt bei leerem Fortschritt 0", () => {
    expect(countDueBy(sets, {}, 10)).toBe(0);
  });
});
