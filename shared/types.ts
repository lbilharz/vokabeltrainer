/** Gemeinsame Typen für Logik (shared/) und Oberfläche (src/). */

export type Lang = "fr" | "de";

/** Ein Eintrag, wie er in src/data/*.json steht. */
export interface RawItem {
  /** Abschnitt im Buch oder Thema, zum Beispiel "Volet 2". */
  c: string;
  fr: string;
  de: string;
  /** Merkhinweis, zum Beispiel "wird wie ouvrir konjugiert". */
  n?: string;
}

/** Ein Eintrag mit fester Kennung. Die Kennung ist der Schlüssel im Fortschritt. */
export interface Item extends RawItem {
  /** `${setId}:${fnv1a(fr)}`, siehe itemId() in text.ts. */
  id: string;
  setId: string;
}

/** Lernstand einer Karte (Leitner-System). */
export interface CardState {
  /** 1 bis MAX_BOX. Ab MASTER gilt die Karte als "sitzt". */
  box: number;
  /** Tag der nächsten Abfrage, als Tagesnummer aus dayNumber(). */
  due: number;
  /** false, solange das Kind die Karte noch nie gesehen hat. */
  seen: boolean;
}

/** Fortschritt aller Karten. Schlüssel ist Item.id. Fehlt ein Eintrag, ist die Karte neu. */
export type Progress = Record<string, CardState>;
