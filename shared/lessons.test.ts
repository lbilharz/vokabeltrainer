import { describe, expect, it } from "vitest";
import { addCounts, countWords, lessonLine, listLine, openHint, openLessons, vocabularyLine } from "./lessons";
import type { LessonLike } from "./lessons";
import { MASTER } from "./srs";
import type { Item, Progress } from "./types";

const items = (setId: string, n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ c: "", fr: `f${i}`, de: `d${i}`, setId, id: `${setId}:${i}` }));
const lesson = (id: string, n: number, createdAt = 0): LessonLike => ({
  id,
  label: `Lektion ${id}`,
  createdAt,
  items: items(id, n),
});

const today = 100;
const now = Date.UTC(2025, 10, 22, 13, 0);
const seen = { box: 1, due: today, seen: true };
const sitting = { box: MASTER, due: today + 9, seen: true };

describe("countWords", () => {
  it("zählt geübte und sitzende Wörter", () => {
    const progress: Progress = { "a:0": seen, "a:1": sitting, "a:2": sitting };
    expect(countWords(items("a", 5), progress, today)).toEqual({ total: 5, practised: 3, mastered: 2 });
  });
  it("addiert", () => {
    expect(addCounts({ total: 3, practised: 2, mastered: 1 }, { total: 4, practised: 1, mastered: 0 })).toEqual({
      total: 7,
      practised: 3,
      mastered: 1,
    });
  });
});

describe("Zeilen", () => {
  it("vocabularyLine", () => {
    expect(vocabularyLine({ total: 79, practised: 53, mastered: 12 })).toBe("53 geübt, 12 sitzen");
    expect(vocabularyLine({ total: 79, practised: 53, mastered: 0 })).toBe("53 geübt");
    expect(vocabularyLine({ total: 5, practised: 5, mastered: 5 })).toBe("Alle sitzen");
  });
  it("lessonLine", () => {
    expect(lessonLine({ total: 18, practised: 0, mastered: 0 })).toBe("0 von 18 geübt");
    expect(lessonLine({ total: 18, practised: 10, mastered: 4 })).toBe("10 von 18 geübt, 4 sitzen");
  });
  it("listLine", () => {
    expect(listLine({ total: 18, practised: 10, mastered: 2 })).toBe("10 von 18 geübt. 8 offen");
    expect(listLine({ total: 18, practised: 0, mastered: 0 })).toBe("0 von 18 geübt");
    expect(listLine({ total: 43, practised: 43, mastered: 12 })).toBe("43 Wörter geübt, 12 sitzen");
    expect(listLine({ total: 43, practised: 43, mastered: 0 })).toBe("43 Wörter geübt");
    expect(listLine({ total: 43, practised: 43, mastered: 43 })).toBe("43 Wörter geübt, alle sitzen");
    expect(listLine({ total: 1, practised: 1, mastered: 0 })).toBe("1 Wort geübt");
  });
});

describe("openLessons und openHint", () => {
  const a = lesson("a", 4, now);
  const b = lesson("b", 10, now - 5 * 86_400_000);
  const c = lesson("c", 6, 0);

  it("lässt die aktuelle und fertige Lektionen weg", () => {
    const progress: Progress = {};
    for (const item of c.items) progress[item.id] = seen;
    const open = openLessons([a, b, c], "a", progress, today);
    expect(open.map((entry) => entry.lesson.id)).toEqual(["b"]);
    expect(open[0]!.open).toBe(10);
  });
  it("sagt bei keiner offenen Lektion nichts", () => {
    expect(openHint([], now)).toBeNull();
  });
  it("nennt eine Lektion mit Namen und Datum", () => {
    const hint = openHint(openLessons([a, b], "a", { "b:0": seen, "b:1": seen }, today), now);
    expect(hint).toBe("In „Lektion b“ vom Montag sind noch 8 Wörter offen.");
  });
  it("lässt das Datum weg, wenn es fehlt", () => {
    expect(openHint(openLessons([a, c], "a", {}, today), now)).toBe("In „Lektion c“ sind noch 6 Wörter offen.");
  });
  it("kann ein einzelnes Wort", () => {
    const progress: Progress = {};
    for (const item of b.items.slice(1)) progress[item.id] = seen;
    expect(openHint(openLessons([a, b], "a", progress, today), now)).toBe("In „Lektion b“ vom Montag ist noch 1 Wort offen.");
  });
  it("fasst mehrere Lektionen zusammen", () => {
    expect(openHint(openLessons([a, b, c], "a", {}, today), now)).toBe("In 2 anderen Lektionen sind noch 16 Wörter offen.");
  });
});
