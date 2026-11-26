import { foreignOf } from "@shared/lang";
import { itemId } from "@shared/text";
import type { Foreign, Item, SetData, SetDoc } from "@shared/types";
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
  /** Die Sprache der Lektion. */
  lang: Foreign;
  items: Item[];
  /** Zeitpunkt des Anlegens in ms. 0, wenn unbekannt (zum Beispiel bei Vorlagen ohne Datum). */
  createdAt: number;
}

/** Die Lektionen eines Kontos mit festen Kennungen je Eintrag. Die neueste steht vorn, ohne Datum zuletzt. */
export function buildSets(docs: Record<string, SetDoc>): SetView[] {
  return Object.values(docs)
    .filter((doc): doc is SetDoc & { data: SetData } => !doc.deleted && doc.data !== null)
    .sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0) || a.id.localeCompare(b.id))
    .map((doc) => {
      const lang = foreignOf(doc.data.lang);
      const taken = new Set<string>();
      const items: Item[] = [];
      for (const raw of doc.data.items) {
        const id = itemId(doc.id, raw.fr);
        if (taken.has(id)) continue;
        taken.add(id);
        items.push({ ...raw, id, setId: doc.id, lang });
      }
      return { id: doc.id, label: doc.data.label, unit: doc.data.unit, lang, items, createdAt: doc.data.createdAt || 0 };
    });
}
