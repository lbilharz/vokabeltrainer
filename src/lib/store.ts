import type { Focus } from "@shared/focus";
import { type SyncState, emptySync } from "@shared/sync";
import type { Progress, SetDoc } from "@shared/types";

const userKey = (userId: string) => `vokabeltrainer_v2:${userId}`;

export interface Settings {
  /** Hör-Aufgaben an oder aus. */
  listen: boolean;
  /** Abspieltempo der Aufnahmen. 1 ist das Originaltempo. */
  rate: number;
}

/** Kleine Angaben zum Konto. Sie wandern als ein Block zum Server. */
export interface Meta {
  settings: Settings;
  /** Das Set, dessen Lernpfad gerade zu sehen ist. Leer heisst: das neueste. */
  activeSet: string;
  /** Wie viele neue Karten "Heute" an diesem Tag schon gezeigt hat. */
  newLog: { day: number; count: number };
  /**
   * Der Test-Fokus. Fehlt er oder ist null, gibt es keinen.
   * Ein Gerät, das ihn nicht kennt, lässt das Feld einfach weg. Dann bleibt der lokale Stand.
   * Null beendet den Fokus auf allen Geräten.
   */
  focus?: Focus | null;
}

export interface Persisted extends Meta {
  v: 2;
  cards: Progress;
  /** Was der Server vom Kartenstand schon kennt und was noch nicht. */
  sync: SyncState;
  /** Änderungszeit des Meta-Blocks in ms. */
  metaT: number;
  metaDirty: boolean;
  /** Die Vokabel-Sets dieses Kontos. */
  sets: Record<string, SetDoc>;
  /** Sets, die der Server noch nicht kennt. */
  setsDirty: string[];
}

function fresh(): Persisted {
  return {
    v: 2,
    cards: {},
    settings: { listen: true, rate: 0.8 },
    activeSet: "",
    newLog: { day: 0, count: 0 },
    sync: emptySync(),
    metaT: 0,
    metaDirty: false,
    sets: {},
    setsDirty: [],
  };
}

export function metaOf(data: Persisted): Meta {
  return { settings: data.settings, activeSet: data.activeSet, newLog: data.newLog, focus: data.focus ?? null };
}

/** Prüft einen Fokus aus dem Speicher oder vom Server. Kaputtes gilt als "kein Fokus". */
function parseFocus(raw: unknown): Focus | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<Focus>;
  if (typeof value.setId !== "string" || !value.setId) return null;
  if (typeof value.day !== "number" || !Number.isInteger(value.day)) return null;
  const sure = Array.isArray(value.sure) ? value.sure.filter((id): id is string => typeof id === "string") : [];
  return { setId: value.setId, day: value.day, sure: sure.slice(0, 2000) };
}

/** Übernimmt einen Meta-Block, der vom Server oder aus dem Speicher kommt. Unbekanntes fällt weg. */
export function withMeta(data: Persisted, raw: unknown): Persisted {
  if (!raw || typeof raw !== "object") return data;
  const meta = raw as Partial<Meta>;
  const next = { ...data };
  if (meta.settings && typeof meta.settings === "object") {
    const rate = Number(meta.settings.rate);
    next.settings = {
      listen: typeof meta.settings.listen === "boolean" ? meta.settings.listen : data.settings.listen,
      rate: Number.isFinite(rate) && rate >= 0.5 && rate <= 1.3 ? rate : data.settings.rate,
    };
  }
  if (typeof meta.activeSet === "string") next.activeSet = meta.activeSet;
  if (meta.newLog && Number.isFinite(meta.newLog.day) && Number.isFinite(meta.newLog.count)) {
    next.newLog = { day: meta.newLog.day, count: meta.newLog.count };
  }
  // Fehlt das Feld, bleibt der lokale Fokus. Nur ein ausdrückliches null beendet ihn.
  if (meta.focus === null) delete next.focus;
  else if (meta.focus !== undefined) {
    const focus = parseFocus(meta.focus);
    if (focus) next.focus = focus;
    else delete next.focus;
  }
  return next;
}

/** Füllt fehlende Felder auf. So bleibt ein älterer gespeicherter Stand lesbar. */
function normalize(stored: Record<string, unknown>): Persisted | null {
  if (stored.v !== 2 || !stored.cards || typeof stored.cards !== "object") return null;
  const base = fresh();
  const sync = stored.sync as Partial<SyncState> | undefined;
  const sets = stored.sets && typeof stored.sets === "object" ? (stored.sets as Record<string, SetDoc>) : {};
  return {
    ...withMeta(base, stored),
    cards: stored.cards as Progress,
    sync: {
      stamps: sync?.stamps && typeof sync.stamps === "object" ? sync.stamps : {},
      dirty: Array.isArray(sync?.dirty) ? sync.dirty : [],
      since: Number.isFinite(sync?.since) ? Number(sync?.since) : 0,
    },
    metaT: Number.isFinite(stored.metaT) ? Number(stored.metaT) : 0,
    metaDirty: stored.metaDirty === true,
    sets,
    setsDirty: Array.isArray(stored.setsDirty) ? (stored.setsDirty as string[]) : [],
  };
}

/** Lädt den Stand eines Kontos auf diesem Gerät. Ohne gespeicherten Stand startet es leer. */
export function loadFor(userId: string): Persisted {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(userKey(userId)) ?? "null");
    const own = value && typeof value === "object" ? normalize(value as Record<string, unknown>) : null;
    if (own) {
      // Ein Stand aus der Zeit vor den Sets kennt die Sets des Servers noch nicht.
      // Dann holt der nächste Abgleich alles neu.
      if (!("sets" in (value as object))) own.sync = { ...own.sync, since: 0 };
      return own;
    }
  } catch {
    // Kaputter oder gesperrter Speicher: mit leerem Stand starten.
  }
  return fresh();
}

export function saveFor(userId: string, data: Persisted): void {
  try {
    localStorage.setItem(userKey(userId), JSON.stringify(data));
  } catch {
    // Privater Modus oder voller Speicher. Die App läuft trotzdem weiter.
  }
}
