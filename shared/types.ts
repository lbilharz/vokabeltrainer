/** Gemeinsame Typen für Logik (shared/) und Oberfläche (src/). */

/** Eine Sprache, die das Kind lernt. */
export type Foreign = "fr" | "en";

/** Jede Sprache, die die App spricht und schreibt. */
export type Lang = Foreign | "de";

/** Ein Eintrag, wie er in src/data/*.json steht. */
export interface RawItem {
  /** Abschnitt im Buch oder Thema, zum Beispiel "Volet 2". */
  c: string;
  /**
   * Das Wort in der Fremdsprache. Der Name stammt aus der Zeit, als es nur Französisch gab.
   * Er bleibt, weil er in jedem gespeicherten Set und in jeder Kartenkennung steckt.
   */
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
  /** Die Sprache der Lektion. */
  lang: Foreign;
  /**
   * true: eine Lernkarte aus einem Sachfach, zum Beispiel Biologie.
   * `de` ist dann die Vorderseite (Frage oder Erklärung), `fr` die Rückseite (Antwort), `n` die Stichpunkte.
   * Solche Karten werden nicht getippt und nicht vorgelesen. Das Kind deckt auf und sagt selbst, ob es die Antwort wusste.
   */
  cards?: boolean;
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

/** Inhalt eines Vokabel-Sets, so wie er beim Konto auf dem Server liegt. */
export interface SetData {
  label: string;
  /** Einzahl und Mehrzahl für die Anzeige, zum Beispiel ["Wort", "Wörter"]. */
  unit: [string, string];
  items: RawItem[];
  /** Zeitpunkt des Anlegens in ms. Das neueste Set steht oben. */
  createdAt: number;
  /** Die Sprache der Lektion. Fehlt sie, ist es Französisch. */
  lang?: Foreign;
  /** "cards": Lernkarten aus einem Sachfach statt Vokabeln. Fehlt die Angabe, sind es Vokabeln. */
  kind?: "cards";
  /** Das Fach einer Lektion mit Lernkarten, zum Beispiel "Biologie". */
  subject?: string;
}

/** Ein Set im Abgleich. Gelöschte Sets bleiben als leerer Eintrag stehen, damit die Löschung mitwandert. */
export interface SetDoc {
  id: string;
  /** Änderungszeit in ms. Beim Abgleich gewinnt die jüngere. */
  t: number;
  deleted: boolean;
  data: SetData | null;
}
