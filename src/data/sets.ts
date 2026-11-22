import { itemId } from "@shared/text";
import type { Item, RawItem } from "@shared/types";
import saetze from "./saetze.json";
import u2 from "./u2.json";

/** Ein eingebautes Set. Das erste in der Liste ist das neueste und der Standard. */
export interface SetDef {
  id: string;
  label: string;
  /** Einzahl und Mehrzahl für die Anzeige, zum Beispiel "11 Wörter". */
  unit: [string, string];
  items: RawItem[];
}

export const SET_DEFS: SetDef[] = [
  { id: "u2", label: "Unité 2", unit: ["Wort", "Wörter"], items: u2 },
  { id: "saetze", label: "Sätze", unit: ["Satz", "Sätze"], items: saetze },
];

export const DEFAULT_SET = SET_DEFS[0]!.id;

export interface SetView {
  id: string;
  label: string;
  unit: [string, string];
  items: Item[];
}

/** Eingebaute Einträge plus eigene Einträge aus der alten App, mit festen Kennungen. */
export function buildSets(custom: Record<string, RawItem[]>): SetView[] {
  return SET_DEFS.map((def) => {
    const taken = new Set<string>();
    const items: Item[] = [];
    for (const raw of [...def.items, ...(custom[def.id] ?? [])]) {
      const id = itemId(def.id, raw.fr);
      if (taken.has(id)) continue;
      taken.add(id);
      items.push({ ...raw, id, setId: def.id });
    }
    return { id: def.id, label: def.label, unit: def.unit, items };
  });
}
