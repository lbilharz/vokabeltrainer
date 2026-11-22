import type { Item, Progress } from "./types";

export interface Station {
  id: string;
  label: string;
  itemIds: string[];
}
export type StationStatus = "done" | "current" | "locked";

// Gruppiert nach Abschnitt (c) und teilt große Gruppen in gleichmäßige Stationen.
export function buildStations(items: Item[], size = 8): Station[] {
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const g = groups.get(it.c);
    if (g) g.push(it);
    else groups.set(it.c, [it]);
  }
  const stations: Station[] = [];
  for (const [c, list] of groups) {
    const n = list.length;
    const parts = Math.ceil(n / size);
    const base = Math.floor(n / parts);
    const extra = n % parts;
    let start = 0;
    for (let k = 0; k < parts; k++) {
      const len = base + (k < extra ? 1 : 0);
      const chunk = list.slice(start, start + len);
      start += len;
      stations.push({
        id: `${chunk[0].setId}:${stations.length}`,
        // Ohne Überschrift auf der Buchseite heisst die Station einfach "Teil 1".
        label: c === "" ? `Teil ${k + 1}` : parts === 1 ? c : `${c}, Teil ${k + 1}`,
        itemIds: chunk.map((i) => i.id),
      });
    }
  }
  return stations;
}

// Erste Station mit ungesehenen Karten ist "current". Davor "done", danach "locked".
export function stationStatuses(stations: Station[], progress: Progress): StationStatus[] {
  const current = stations.findIndex((s) => s.itemIds.some((id) => progress[id]?.seen !== true));
  return stations.map((_, i) => (current === -1 || i < current ? "done" : i === current ? "current" : "locked"));
}
