import { itemId } from "@shared/text";
import type { Item, SetData, SetDoc } from "@shared/types";
import saetze from "./saetze.json";
import u2 from "./u2.json";

/**
 * Vorlagen. Sie gehören zu keinem Konto.
 * Nur der Testlink /prefill legt sie in einem Konto an. Normale Konten starten leer.
 */
export const TEMPLATES: { id: string; data: Omit<SetData, "createdAt"> }[] = [
  { id: "u2", data: { label: "Unité 2", unit: ["Wort", "Wörter"], items: u2 } },
  { id: "saetze", data: { label: "Sätze", unit: ["Satz", "Sätze"], items: saetze } },
];

export interface SetView {
  id: string;
  label: string;
  unit: [string, string];
  items: Item[];
}

/** Die Sets eines Kontos mit festen Kennungen je Eintrag. Das neueste steht vorn. */
export function buildSets(docs: Record<string, SetDoc>): SetView[] {
  return Object.values(docs)
    .filter((doc): doc is SetDoc & { data: SetData } => !doc.deleted && doc.data !== null)
    .sort((a, b) => b.data.createdAt - a.data.createdAt || a.id.localeCompare(b.id))
    .map((doc) => {
      const taken = new Set<string>();
      const items: Item[] = [];
      for (const raw of doc.data.items) {
        const id = itemId(doc.id, raw.fr);
        if (taken.has(id)) continue;
        taken.add(id);
        items.push({ ...raw, id, setId: doc.id });
      }
      return { id: doc.id, label: doc.data.label, unit: doc.data.unit, items };
    });
}
