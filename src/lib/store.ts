import { MASTER, MAX_BOX, dayNumber } from "@shared/srs";
import { type SyncState, emptySync, markAllDirty } from "@shared/sync";
import { itemId } from "@shared/text";
import type { Progress, RawItem } from "@shared/types";
import { DEFAULT_SET, SET_DEFS } from "../data/sets";

/** Stand ohne Konto, aus der Zeit vor dem Login. Wird einmal übernommen. */
const ANON_KEY = "vokabeltrainer_v2";
/** Speicher der alten App. Wird nur gelesen, nie verändert. */
const OLD_KEY = "vokabeltrainer_fr_v1";
/** Merkt sich, welches Konto den Stand ohne Konto bekommen hat. */
const ADOPTED_KEY = "vokabeltrainer_adopted";
const userKey = (userId: string) => `${ANON_KEY}:${userId}`;

export interface Settings {
  /** Hör-Aufgaben an oder aus. */
  listen: boolean;
  /** Abspieltempo der Aufnahmen. 1 ist das Originaltempo. */
  rate: number;
}

/** Alles ausser dem Kartenstand. Wandert als ein Block zum Server. */
export interface Meta {
  settings: Settings;
  activeSet: string;
  /** Wie viele neue Karten "Heute" an diesem Tag schon gezeigt hat. */
  newLog: { day: number; count: number };
  /** Eigene Einträge aus der alten App, je Set. */
  custom: Record<string, RawItem[]>;
}

export interface Persisted extends Meta {
  v: 2;
  cards: Progress;
  /** Was der Server schon kennt und was noch nicht. */
  sync: SyncState;
  /** Änderungszeit des Meta-Blocks in ms. */
  metaT: number;
  metaDirty: boolean;
}

function fresh(): Persisted {
  return {
    v: 2,
    cards: {},
    settings: { listen: true, rate: 0.8 },
    activeSet: DEFAULT_SET,
    newLog: { day: 0, count: 0 },
    custom: {},
    sync: emptySync(),
    metaT: 0,
    metaDirty: false,
  };
}

export function metaOf(data: Persisted): Meta {
  return { settings: data.settings, activeSet: data.activeSet, newLog: data.newLog, custom: data.custom };
}

function validItems(value: unknown): RawItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c) => c && typeof c.fr === "string" && typeof c.de === "string" && c.fr && c.de)
    .map((c) => ({ c: typeof c.c === "string" && c.c ? c.c : "Eigene", fr: c.fr as string, de: c.de as string }));
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
  if (typeof meta.activeSet === "string" && SET_DEFS.some((d) => d.id === meta.activeSet)) {
    next.activeSet = meta.activeSet;
  }
  if (meta.newLog && Number.isFinite(meta.newLog.day) && Number.isFinite(meta.newLog.count)) {
    next.newLog = { day: meta.newLog.day, count: meta.newLog.count };
  }
  if (meta.custom && typeof meta.custom === "object") {
    const custom: Record<string, RawItem[]> = {};
    for (const def of SET_DEFS) {
      const items = validItems((meta.custom as Record<string, unknown>)[def.id]);
      if (items.length) custom[def.id] = items;
    }
    next.custom = custom;
  }
  return next;
}

interface OldSet {
  known?: Record<string, unknown>;
  srs?: Record<string, { box?: number; due?: number } | null>;
  custom?: unknown;
}

/**
 * Übernimmt den Stand der alten App.
 * Dort hing der Fortschritt an der Position in der Liste. Hier hängt er an der Kennung.
 */
function migrate(old: Record<string, unknown>, today: number): Persisted {
  const next = fresh();
  if (typeof old.rate === "number") next.settings.rate = old.rate;
  if (typeof old.activeSet === "string" && SET_DEFS.some((d) => d.id === old.activeSet)) {
    next.activeSet = old.activeSet;
  }

  let sets = old.sets as Record<string, OldSet> | undefined;
  if (!sets && (old.known || old.srs)) {
    // Ganz alter Stand ohne Sets: alles gehörte zu den Sätzen.
    const known = (old.known ?? {}) as Record<string, unknown>;
    const srs =
      (old.srs as OldSet["srs"]) ??
      Object.fromEntries(Object.keys(known).map((k) => [k, { box: MASTER, due: today + 2 }]));
    sets = { saetze: { srs, custom: old.custom } };
  }

  for (const def of SET_DEFS) {
    const oldSet = sets?.[def.id];
    if (!oldSet) continue;
    const custom = validItems(oldSet.custom);
    if (custom.length) next.custom[def.id] = custom;

    const all = [...def.items, ...custom];
    for (const [index, srs] of Object.entries(oldSet.srs ?? {})) {
      const item = all[Number(index)];
      if (!item || !srs) continue;
      const box = Math.min(Math.max(Math.round(Number(srs.box) || 1), 1), MAX_BOX);
      const due = Number.isFinite(Number(srs.due)) ? Number(srs.due) : today;
      next.cards[itemId(def.id, item.fr)] = { box, due, seen: true };
    }
  }
  return next;
}

function parse(raw: string | null): Record<string, unknown> | null {
  const value: unknown = JSON.parse(raw ?? "null");
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Füllt fehlende Felder auf. So bleibt ein älterer gespeicherter Stand lesbar. */
function normalize(stored: Record<string, unknown>): Persisted | null {
  if (stored.v !== 2 || !stored.cards || typeof stored.cards !== "object") return null;
  const base = fresh();
  const sync = stored.sync as Partial<SyncState> | undefined;
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
  };
}

/**
 * Lädt den Stand eines Kontos auf diesem Gerät.
 *
 * Gibt es noch keinen, bekommt das erste Konto den Stand aus der Zeit ohne Login.
 * Dessen Karten gelten als sehr alt. Kennt der Server die Karte schon, gewinnt der Server.
 */
export function loadFor(userId: string): Persisted {
  try {
    const own = parse(localStorage.getItem(userKey(userId)));
    const ownData = own && normalize(own);
    if (ownData) return ownData;

    if (!localStorage.getItem(ADOPTED_KEY)) {
      const anon = parse(localStorage.getItem(ANON_KEY));
      const old = parse(localStorage.getItem(OLD_KEY));
      const base = (anon && normalize(anon)) ?? (old ? migrate(old, dayNumber(new Date())) : null);
      if (base && Object.keys(base.cards).length > 0) {
        localStorage.setItem(ADOPTED_KEY, userId);
        return { ...base, sync: markAllDirty(base.cards, emptySync()), metaT: 1, metaDirty: true };
      }
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
