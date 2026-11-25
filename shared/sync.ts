/**
 * Abgleich des Lernstands zwischen Geräten.
 *
 * Regel: Pro Karte gewinnt die jüngste Änderung (last write wins).
 * Jede Karte hat dazu eine Änderungszeit `t` in ms.
 * Alles hier ist rein und verändert seine Eingaben nicht.
 */

import type { Progress, SetDoc } from "./types";

export interface SyncCard {
  id: string;
  box: number;
  due: number;
  seen: boolean;
  t: number;
}

export interface SyncState {
  /** Änderungszeit je Karte in ms. Karten ohne Eintrag gelten als sehr alt (1). */
  stamps: Record<string, number>;
  /** Karten, die der Server noch nicht kennt. */
  dirty: string[];
  /** Serverzeit des letzten erfolgreichen Abgleichs. 0 = noch nie. */
  since: number;
}

export function emptySync(): SyncState {
  return { stamps: {}, dirty: [], since: 0 };
}

/** Änderungszeit einer Karte. Eine Karte ohne Stempel gilt als alt, eine fehlende als nie da. */
function localTime(cards: Progress, sync: SyncState, id: string): number {
  return sync.stamps[id] ?? (id in cards ? 1 : 0);
}

/** Das Kind hat die Karte geändert. Stempel setzen und als ungesendet merken. */
export function touch(sync: SyncState, id: string, now: number): SyncState {
  return {
    ...sync,
    stamps: { ...sync.stamps, [id]: now },
    dirty: sync.dirty.includes(id) ? sync.dirty : [...sync.dirty, id],
  };
}

/** Die Karten, die beim nächsten Abgleich zum Server gehen. */
export function outgoing(cards: Progress, sync: SyncState): SyncCard[] {
  const result: SyncCard[] = [];
  for (const id of sync.dirty) {
    const card = cards[id];
    if (!card) continue;
    result.push({ id, box: card.box, due: card.due, seen: card.seen, t: sync.stamps[id] ?? 1 });
  }
  return result;
}

/** Antwort des Servers einarbeiten. */
export function applyResponse(
  cards: Progress,
  sync: SyncState,
  pushed: SyncCard[],
  incoming: SyncCard[],
  serverNow: number,
): { cards: Progress; sync: SyncState } {
  const nextCards: Progress = { ...cards };
  const nextStamps: Record<string, number> = { ...sync.stamps };
  const removeFromDirty = new Set<string>();

  // Gesendete Karten sind erledigt, wenn sie sich seitdem nicht geändert haben.
  // Geprüft wird gegen den Stand vor der Antwort.
  for (const card of pushed) {
    if (localTime(cards, sync, card.id) === card.t) removeFromDirty.add(card.id);
  }

  for (const card of incoming) {
    const local = localTime(cards, sync, card.id);
    if (card.t < local) continue;
    nextCards[card.id] = { box: card.box, due: card.due, seen: card.seen };
    nextStamps[card.id] = card.t;
    // Der Server hat schon einen neueren Stand als wir. Senden lohnt nicht mehr.
    if (card.t > local) removeFromDirty.add(card.id);
  }

  return {
    cards: nextCards,
    sync: {
      stamps: nextStamps,
      dirty: sync.dirty.filter((id) => !removeFromDirty.has(id)),
      since: serverNow,
    },
  };
}

/**
 * Arbeitet Lektionen vom Server ein. Je Lektion gewinnt die jüngere Änderung, wie bei den Karten.
 * Ohne Änderung kommt dasselbe Objekt zurück. Sonst rechnet die App bei jedem Abgleich alles neu.
 */
export function mergeSets(local: Record<string, SetDoc>, incoming: SetDoc[]): Record<string, SetDoc> {
  let merged = local;
  for (const doc of incoming) {
    const known = merged[doc.id];
    if (known && (doc.t < known.t || (doc.t === known.t && doc.deleted === known.deleted))) continue;
    if (merged === local) merged = { ...local };
    merged[doc.id] = doc;
  }
  return merged;
}
