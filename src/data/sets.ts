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
  /** true: Lernkarten aus einem Sachfach. */
  cards: boolean;
  /** Das Fach bei Lernkarten, sonst leer. */
  subject: string;
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
      const cards = doc.data.kind === "cards";
      const taken = new Set<string>();
      const items: Item[] = [];
      for (const raw of doc.data.items) {
        // Zwei Fragen können dieselbe Antwort haben. Bei Lernkarten gehört deshalb die Frage zur Kennung.
        const id = itemId(doc.id, cards ? `${raw.de}\n${raw.fr}` : raw.fr);
        if (taken.has(id)) continue;
        taken.add(id);
        items.push({ ...raw, id, setId: doc.id, lang, ...(cards ? { cards } : {}) });
      }
      return { id: doc.id, label: doc.data.label, unit: doc.data.unit, lang, cards, subject: doc.data.subject ?? "", items, createdAt: doc.data.createdAt || 0 };
    });
}
