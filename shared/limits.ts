/**
 * Grenzen für Sets und ihre Einträge.
 *
 * Der Abgleich lehnt alles ab, was darüber liegt. Deshalb halten sich das Fotolesen
 * und das Speichern in der App an dieselben Zahlen.
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
} as const;
