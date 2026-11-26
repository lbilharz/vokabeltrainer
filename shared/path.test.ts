import { describe, expect, it } from "vitest";
import u2 from "../src/data/u2.json";
import saetze from "../src/data/saetze.json";
import { buildStations, stationStatuses } from "./path";
import { itemId } from "./text";
import type { Item, Progress, RawItem } from "./types";

const toItems = (setId: string, raw: RawItem[]): Item[] =>
  raw.map((r) => ({ ...r, setId, lang: "fr" as const, id: itemId(setId, r.fr) }));

const mk = (c: string, n: number, setId = "t"): Item[] =>
  Array.from({ length: n }, (_, i) => ({ c, fr: `${c}${i}`, de: "", setId, lang: "fr" as const, id: `${setId}:${c}${i}` }));

describe("buildStations mit u2.json", () => {
  const items = toItems("u2", u2 as RawItem[]);
  const st = buildStations(items);

  it("ergibt 6 Stationen mit ausgewogenen Größen", () => {
    expect(st.map((s) => s.itemIds.length)).toEqual([8, 8, 8, 8, 6, 5]);
  });
  it("benennt die Stationen", () => {
    expect(st.map((s) => s.label)).toEqual([
      "Volet 2, Teil 1", "Volet 2, Teil 2", "Volet 2, Teil 3", "Volet 2, Teil 4",
      "Volet 3, Teil 1", "Volet 3, Teil 2",
    ]);
  });
  it("vergibt fortlaufende Kennungen", () => {
    expect(st.map((s) => s.id)).toEqual(["u2:0", "u2:1", "u2:2", "u2:3", "u2:4", "u2:5"]);
  });
  it("behält die Reihenfolge und verliert nichts", () => {
    expect(st.flatMap((s) => s.itemIds)).toEqual(items.map((i) => i.id));
  });
});

describe("buildStations allgemein", () => {
  it("leere Eingabe gibt leeres Ergebnis", () => {
    expect(buildStations([])).toEqual([]);
  });
  it("genau 8 Einträge geben eine Station mit schlichtem Namen", () => {
    const st = buildStations(mk("Thema", 8));
    expect(st).toHaveLength(1);
    expect(st[0].label).toBe("Thema");
  });
  it("9 Einträge werden 5 und 4", () => {
    expect(buildStations(mk("A", 9)).map((s) => s.itemIds.length)).toEqual([5, 4]);
  });
  it("hält die Reihenfolge der ersten Nennung von c", () => {
    const items = [...mk("B", 2), ...mk("A", 2)];
    expect(buildStations(items).map((s) => s.label)).toEqual(["B", "A"]);
  });
  it("fasst nicht zusammenhängende Einträge desselben c zusammen", () => {
    const [a1, a2] = mk("A", 2);
    const [b1] = mk("B", 1);
    const st = buildStations([a1, b1, a2]);
    expect(st.map((s) => s.itemIds)).toEqual([[a1.id, a2.id], [b1.id]]);
  });
  it("beachtet eine eigene Größe", () => {
    expect(buildStations(mk("A", 5), 2).map((s) => s.itemIds.length)).toEqual([2, 2, 1]);
  });
});

describe("stationStatuses", () => {
  const stations = buildStations(toItems("u2", u2 as RawItem[]));
  const ids = stations.map((s) => s.itemIds);
  const seen = (list: string[]): Progress =>
    Object.fromEntries(list.map((id) => [id, { box: 1, due: 0, seen: true }]));

  it("leerer Fortschritt: erste Station aktuell, Rest gesperrt", () => {
    expect(stationStatuses(stations, {})).toEqual(["current", "locked", "locked", "locked", "locked", "locked"]);
  });
  it("teilweiser Fortschritt: eine ungesehene Karte hält die Station aktuell", () => {
    const p = seen([...ids[0], ...ids[1].slice(0, 3)]);
    expect(stationStatuses(stations, p)).toEqual(["done", "current", "locked", "locked", "locked", "locked"]);
  });
  it("seen=false zählt als ungesehen", () => {
    const p: Progress = { ...seen(ids[0]), [ids[0][0]]: { box: 1, due: 0, seen: false } };
    expect(stationStatuses(stations, p)[0]).toBe("current");
  });
  it("alles gesehen: alle erledigt", () => {
    expect(stationStatuses(stations, seen(ids.flat()))).toEqual(Array(6).fill("done"));
  });
  it("keine Stationen: leeres Ergebnis", () => {
    expect(stationStatuses([], {})).toEqual([]);
  });
});

describe("Daten", () => {
  it.each([["u2", u2], ["saetze", saetze]])("%s: itemId ist eindeutig", (setId, raw) => {
    const ids = (raw as RawItem[]).map((r) => itemId(setId, r.fr));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildStations ohne Überschrift", () => {
  it("nennt Stationen ohne Abschnitt Teil 1, Teil 2", () => {
    const items: Item[] = Array.from({ length: 10 }, (_, i) => ({
      id: `x:${i}`,
      setId: "x",
      lang: "fr" as const,
      c: "",
      fr: `mot ${i}`,
      de: `Wort ${i}`,
    }));
    expect(buildStations(items).map((station) => station.label)).toEqual(["Teil 1", "Teil 2"]);
    expect(buildStations(items.slice(0, 3)).map((station) => station.label)).toEqual(["Teil 1"]);
  });
});
