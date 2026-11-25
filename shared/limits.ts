/**
 * Grenzen, die App und Server beide kennen müssen.
 *
 * Der Abgleich lehnt alles ab, was über den Grenzen für Sets liegt. Deshalb halten sich
 * das Fotolesen und das Speichern in der App an dieselben Zahlen.
 */
export const LIMITS = {
  /** Französisches oder deutsches Wort. */
  MAX_WORD_CHARS: 300,
  /** Merkhinweis. */
  MAX_NOTE_CHARS: 300,
  /** Überschrift eines Abschnitts. */
  MAX_HEADING_CHARS: 60,
  /** Name eines Sets. */
  MAX_LABEL_CHARS: 60,
  /** Einträge in einem Set. */
  MAX_ITEMS_PER_SET: 400,
  /** Eine getippte Antwort, die der Schiedsrichter prüft. */
  MAX_ANSWER_CHARS: 120,
  /** Längster Text, für den der Server eine Aufnahme macht. */
  MAX_AUDIO_CHARS: 200,
  /** So viele Texte nimmt eine Anfrage nach Aufnahmen höchstens an. */
  MAX_AUDIO_TEXTS: 10,
} as const;
