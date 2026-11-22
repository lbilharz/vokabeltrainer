import { MASTER, MAX_BOX, dayNumber } from "@shared/srs";
import { itemId } from "@shared/text";
import type { Progress, RawItem } from "@shared/types";
import { DEFAULT_SET, SET_DEFS } from "../data/sets";

const KEY = "vokabeltrainer_v2";
/** Speicher der alten App. Wird nur gelesen, nie verändert. */
const OLD_KEY = "vokabeltrainer_fr_v1";

export interface Settings {
  /** Hör-Aufgaben an oder aus. */
  listen: boolean;
  /** Abspieltempo der Aufnahmen. 1 ist das Originaltempo. */
  rate: number;
}

export interface Persisted {
  v: 2;
  cards: Progress;
  settings: Settings;
  activeSet: string;
  /** Wie viele neue Karten "Heute" an diesem Tag schon gezeigt hat. */
  newLog: { day: number; count: number };
  /** Eigene Einträge aus der alten App, je Set. */
  custom: Record<string, RawItem[]>;
}

function fresh(): Persisted {
  return {
    v: 2,
    cards: {},
    settings: { listen: true, rate: 0.8 },
    activeSet: DEFAULT_SET,
    newLog: { day: 0, count: 0 },
    custom: {},
  };
}

interface OldSet {
  known?: Record<string, unknown>;
  srs?: Record<string, { box?: number; due?: number } | null>;
  custom?: { c?: string; fr?: string; de?: string }[];
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
    sets = { saetze: { srs, custom: old.custom as OldSet["custom"] } };
  }

  for (const def of SET_DEFS) {
    const oldSet = sets?.[def.id];
    if (!oldSet) continue;
    const custom: RawItem[] = (Array.isArray(oldSet.custom) ? oldSet.custom : [])
      .filter((c) => c && typeof c.fr === "string" && typeof c.de === "string" && c.fr && c.de)
      .map((c) => ({ c: c.c || "Eigene", fr: c.fr!, de: c.de! }));
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

export function load(): Persisted {
  const today = dayNumber(new Date());
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Persisted | null;
    if (stored && stored.v === 2 && stored.cards) {
      const base = fresh();
      return {
        ...base,
        ...stored,
        settings: { ...base.settings, ...stored.settings },
        activeSet: SET_DEFS.some((d) => d.id === stored.activeSet) ? stored.activeSet : DEFAULT_SET,
      };
    }
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? "null") as Record<string, unknown> | null;
    if (old && typeof old === "object") return migrate(old, today);
  } catch {
    // Kaputter oder gesperrter Speicher: mit leerem Stand starten.
  }
  return fresh();
}

export function save(data: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Privater Modus oder voller Speicher. Die App läuft trotzdem weiter.
  }
}
