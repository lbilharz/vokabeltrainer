import { describe, expect, it } from "vitest";
import {
  applyResponse,
  emptySync,
  markAllDirty,
  outgoing,
  touch,
  type SyncCard,
  type SyncState,
} from "./sync";
import type { Progress } from "./types";

const card = (box: number, due = 10, seen = true) => ({ box, due, seen });

describe("emptySync", () => {
  it("startet leer", () => {
    expect(emptySync()).toEqual({ stamps: {}, dirty: [], since: 0 });
  });
});

describe("touch", () => {
  it("setzt Stempel und merkt eine neue Karte", () => {
    const next = touch(emptySync(), "a", 100);
    expect(next.stamps).toEqual({ a: 100 });
    expect(next.dirty).toEqual(["a"]);
  });

  it("aktualisiert den Stempel, ohne die Karte doppelt zu merken", () => {
    const next = touch(touch(emptySync(), "a", 100), "a", 200);
    expect(next.stamps).toEqual({ a: 200 });
    expect(next.dirty).toEqual(["a"]);
  });

  it("verändert die Eingabe nicht", () => {
    const before = emptySync();
    const snapshot = structuredClone(before);
    const next = touch(before, "a", 5);
    expect(before).toEqual(snapshot);
    expect(next).not.toBe(before);
    expect(next.stamps).not.toBe(before.stamps);
    expect(next.dirty).not.toBe(before.dirty);
  });

  it("behält since und andere Karten", () => {
    const base: SyncState = { stamps: { b: 7 }, dirty: ["b"], since: 50 };
    const next = touch(base, "a", 9);
    expect(next).toEqual({ stamps: { b: 7, a: 9 }, dirty: ["b", "a"], since: 50 });
  });
});

describe("markAllDirty", () => {
  it("macht jede Karte ungesendet, ohne Stempel zu erfinden", () => {
    const cards: Progress = { a: card(1), b: card(2) };
    const next = markAllDirty(cards, emptySync());
    expect(next.dirty.sort()).toEqual(["a", "b"]);
    expect(next.stamps).toEqual({});
  });

  it("behält vorhandene Stempel und doppelt nichts", () => {
    const cards: Progress = { a: card(1), b: card(2) };
    const sync: SyncState = { stamps: { a: 42 }, dirty: ["a"], since: 3 };
    const next = markAllDirty(cards, sync);
    expect(next.stamps).toEqual({ a: 42 });
    expect(next.dirty.filter((id) => id === "a")).toHaveLength(1);
    expect(next.dirty).toContain("b");
    expect(next.since).toBe(3);
  });

  it("verändert die Eingaben nicht", () => {
    const cards: Progress = { a: card(1) };
    const sync = emptySync();
    markAllDirty(cards, sync);
    expect(sync).toEqual(emptySync());
    expect(cards).toEqual({ a: card(1) });
  });
});

describe("outgoing", () => {
  it("liefert eine SyncCard je ungesendeter Karte", () => {
    const cards: Progress = { a: card(3, 12, true) };
    const sync = touch(emptySync(), "a", 500);
    expect(outgoing(cards, sync)).toEqual([{ id: "a", box: 3, due: 12, seen: true, t: 500 }]);
  });

  it("überspringt Karten, die es nicht mehr gibt", () => {
    const sync = touch(touch(emptySync(), "a", 1), "gone", 2);
    expect(outgoing({ a: card(1) }, sync).map((c) => c.id)).toEqual(["a"]);
  });

  it("nimmt t = 1 ohne Stempel", () => {
    const sync = markAllDirty({ a: card(2) }, emptySync());
    expect(outgoing({ a: card(2) }, sync)[0].t).toBe(1);
  });

  it("sendet keine Karten, die nicht ungesendet sind", () => {
    const sync: SyncState = { stamps: { a: 5 }, dirty: [], since: 0 };
    expect(outgoing({ a: card(1) }, sync)).toEqual([]);
  });
});

describe("applyResponse", () => {
  const inc = (id: string, t: number, box = 4): SyncCard => ({ id, box, due: 20, seen: true, t });

  it("übernimmt eine neuere eingehende Karte", () => {
    const cards: Progress = { a: card(1) };
    const sync: SyncState = { stamps: { a: 100 }, dirty: [], since: 0 };
    const res = applyResponse(cards, sync, [], [inc("a", 200)], 300);
    expect(res.cards.a).toEqual({ box: 4, due: 20, seen: true });
    expect(res.sync.stamps.a).toBe(200);
  });

  it("behält die lokale Karte, wenn die eingehende älter ist", () => {
    const cards: Progress = { a: card(1) };
    const sync: SyncState = { stamps: { a: 300 }, dirty: ["a"], since: 0 };
    const res = applyResponse(cards, sync, [], [inc("a", 200)], 400);
    expect(res.cards.a).toEqual(card(1));
    expect(res.sync.stamps.a).toBe(300);
    expect(res.sync.dirty).toEqual(["a"]);
  });

  it("nimmt bei gleichem t die eingehende Karte", () => {
    const cards: Progress = { a: card(1) };
    const sync: SyncState = { stamps: { a: 200 }, dirty: [], since: 0 };
    const res = applyResponse(cards, sync, [], [inc("a", 200, 5)], 400);
    expect(res.cards.a.box).toBe(5);
  });

  it("nimmt eine unbekannte Karte auf", () => {
    const res = applyResponse({}, emptySync(), [], [inc("neu", 50)], 60);
    expect(res.cards.neu).toEqual({ box: 4, due: 20, seen: true });
    expect(res.sync.stamps.neu).toBe(50);
    expect(res.sync.dirty).toEqual([]);
  });

  it("lokale Karte ohne Stempel gilt als t = 1 und verliert gegen jede echte Zeit", () => {
    const cards: Progress = { a: card(1) };
    const res = applyResponse(cards, emptySync(), [], [inc("a", 2)], 9);
    expect(res.cards.a.box).toBe(4);
  });

  it("entfernt eine gesendete Karte aus dirty", () => {
    const cards: Progress = { a: card(2) };
    const sync = touch(emptySync(), "a", 100);
    const pushed = outgoing(cards, sync);
    const res = applyResponse(cards, sync, pushed, [], 500);
    expect(res.sync.dirty).toEqual([]);
  });

  it("gesendete Karte ohne Stempel (t = 1) verlässt dirty ebenfalls", () => {
    const cards: Progress = { a: card(2) };
    const sync = markAllDirty(cards, emptySync());
    const pushed = outgoing(cards, sync);
    const res = applyResponse(cards, sync, pushed, [], 500);
    expect(res.sync.dirty).toEqual([]);
  });

  it("lässt eine Karte dirty, die während der Anfrage erneut geändert wurde", () => {
    const cards: Progress = { a: card(2) };
    const before = touch(emptySync(), "a", 100);
    const pushed = outgoing(cards, before);
    const during = touch(before, "a", 150);
    const res = applyResponse(cards, during, pushed, [], 500);
    expect(res.sync.dirty).toEqual(["a"]);
    expect(res.sync.stamps.a).toBe(150);
  });

  it("lässt nicht gesendete dirty-Karten dirty", () => {
    const cards: Progress = { a: card(1), b: card(2) };
    let sync = touch(emptySync(), "a", 100);
    const pushed = outgoing(cards, sync);
    sync = touch(sync, "b", 120);
    const res = applyResponse(cards, sync, pushed, [], 500);
    expect(res.sync.dirty).toEqual(["b"]);
  });

  it("entfernt eine dirty-Karte, die durch einen strikt neueren Stand ersetzt wurde", () => {
    const cards: Progress = { a: card(1) };
    const sync = touch(emptySync(), "a", 100);
    const res = applyResponse(cards, sync, [], [inc("a", 200)], 300);
    expect(res.cards.a.box).toBe(4);
    expect(res.sync.dirty).toEqual([]);
  });

  it("setzt since auf die Serverzeit", () => {
    const res = applyResponse({}, emptySync(), [], [], 777);
    expect(res.sync.since).toBe(777);
  });

  it("verändert die Eingaben nicht", () => {
    const cards: Progress = { a: card(1) };
    const sync = touch(emptySync(), "a", 100);
    const pushed = outgoing(cards, sync);
    const incoming = [inc("a", 200), inc("b", 50)];
    const snap = structuredClone({ cards, sync, pushed, incoming });
    const res = applyResponse(cards, sync, pushed, incoming, 300);
    expect({ cards, sync, pushed, incoming }).toEqual(snap);
    expect(res.cards).not.toBe(cards);
    expect(res.sync.stamps).not.toBe(sync.stamps);
  });
});

/** Ein winziger Server nach der Regel: speichern bei neu oder incoming.t >= row.t. */
function makeServer() {
  const rows = new Map<string, SyncCard & { updatedAt: number }>();
  let clock = 1000;
  return {
    sync(since: number, cards: SyncCard[]) {
      clock += 10;
      for (const c of cards) {
        const row = rows.get(c.id);
        if (!row || c.t >= row.t) rows.set(c.id, { ...c, updatedAt: clock });
      }
      const out = [...rows.values()]
        .filter((r) => r.updatedAt >= since)
        .map(({ updatedAt: _u, ...c }) => c);
      return { now: clock, cards: out };
    },
  };
}

function makeDevice(server: ReturnType<typeof makeServer>) {
  const device = { cards: {} as Progress, sync: emptySync() };
  return {
    device,
    learn(id: string, box: number, at: number) {
      device.cards = { ...device.cards, [id]: card(box) };
      device.sync = touch(device.sync, id, at);
    },
    run() {
      const pushed = outgoing(device.cards, device.sync);
      const res = server.sync(device.sync.since, pushed);
      const applied = applyResponse(device.cards, device.sync, pushed, res.cards, res.now);
      device.cards = applied.cards;
      device.sync = applied.sync;
    },
  };
}

describe("Abgleich zweier Geräte", () => {
  it("die neuere Änderung von B erreicht A", () => {
    const server = makeServer();
    const a = makeDevice(server);
    const b = makeDevice(server);

    a.learn("x", 2, 100);
    a.run();
    expect(a.device.sync.dirty).toEqual([]);

    b.run();
    expect(b.device.cards.x.box).toBe(2);

    b.learn("x", 4, 200);
    b.run();

    a.run();
    expect(a.device.cards.x.box).toBe(4);
    expect(a.device.sync.stamps.x).toBe(200);
    expect(a.device.sync.dirty).toEqual([]);
  });

  it("eine ältere Änderung überschreibt den Server nicht", () => {
    const server = makeServer();
    const a = makeDevice(server);
    const b = makeDevice(server);

    b.learn("x", 5, 300);
    b.run();

    a.learn("x", 1, 100);
    a.run();
    expect(a.device.cards.x.box).toBe(5);
    expect(a.device.sync.dirty).toEqual([]);
  });
});
