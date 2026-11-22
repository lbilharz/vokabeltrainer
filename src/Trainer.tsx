import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Station } from "@shared/path";
import {
  NEW_PER_DAY,
  type Step,
  countDueBy,
  makeStep,
  planToday,
  shuffle,
} from "@shared/session";
import { dayNumber, getCard } from "@shared/srs";
import { applyResponse, outgoing, touch } from "@shared/sync";
import type { CardState, Item } from "@shared/types";
import { Settings } from "./components/Settings";
import { buildSets } from "./data/sets";
import { type User, postSync } from "./lib/account";
import { ApiError } from "./lib/api";
import { loadAudioIndex, speak, stop } from "./lib/audio";
import {
  type Persisted,
  type Settings as SettingsData,
  loadFor,
  metaOf,
  saveFor,
  withMeta,
} from "./lib/store";
import { Done, type SessionStats } from "./screens/Done";
import { Home } from "./screens/Home";
import { Session } from "./screens/Session";
import { WordList } from "./screens/WordList";

type View =
  | { name: "home" }
  | { name: "session"; steps: Step[]; run: number }
  | { name: "done"; stats: SessionStats }
  | { name: "list" };

interface Props {
  user: User;
  /** Abmelden oder abgelaufene Sitzung: zurück zum Anmeldebildschirm. */
  onSignedOut: () => void;
}

export type SyncStatus = "idle" | "running" | "failed";

export function Trainer({ user, onSignedOut }: Props) {
  const [data, setData] = useState<Persisted>(() => loadFor(user.id));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const dataRef = useRef(data);
  dataRef.current = data;
  const syncing = useRef(false);
  const [view, setView] = useState<View>({ name: "home" });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const today = dayNumber(new Date());
  const sets = useMemo(() => buildSets(data.custom), [data.custom]);
  const active = sets.find((set) => set.id === data.activeSet) ?? sets[0]!;
  const itemsById = useMemo(() => {
    const map = new Map<string, Item>();
    for (const set of sets) for (const item of set.items) map.set(item.id, item);
    return map;
  }, [sets]);
  const poolFor = useCallback(
    (item: Item) => sets.find((set) => set.id === item.setId)?.items ?? [],
    [sets],
  );

  useEffect(() => saveFor(user.id, data), [user.id, data]);

  /**
   * Gleicht den Stand mit dem Server ab. Je Karte gewinnt die jüngere Änderung.
   * Ohne Netz bleibt alles lokal und geht beim nächsten Mal mit.
   */
  const syncNow = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setSyncStatus("running");
    const before = dataRef.current;
    const pushed = outgoing(before.cards, before.sync);
    const pushedMetaT = before.metaT;
    try {
      const response = await postSync(
        before.sync.since,
        pushed,
        before.metaDirty ? { data: metaOf(before), t: pushedMetaT } : undefined,
      );
      setData((prev) => {
        const merged = applyResponse(prev.cards, prev.sync, pushed, response.cards, response.now);
        let next: Persisted = { ...prev, cards: merged.cards, sync: merged.sync };
        // Der Meta-Block ist sauber, wenn er seit dem Senden nicht mehr geändert wurde.
        if (prev.metaDirty && prev.metaT === pushedMetaT) next.metaDirty = false;
        if (response.meta && response.meta.t > next.metaT) {
          next = { ...withMeta(next, response.meta.data), metaT: response.meta.t, metaDirty: false };
        }
        return next;
      });
      setSyncStatus("idle");
    } catch (error) {
      setSyncStatus("failed");
      if (error instanceof ApiError && error.status === 401) onSignedOut();
    } finally {
      syncing.current = false;
    }
  }, [onSignedOut]);

  useEffect(() => {
    void syncNow();
    const onVisibility = () => void syncNow();
    document.addEventListener("visibilitychange", onVisibility);
    // Offene Änderungen gehen spätestens nach einer Minute mit.
    const timer = window.setInterval(() => {
      const current = dataRef.current;
      if (current.sync.dirty.length > 0 || current.metaDirty) void syncNow();
    }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [syncNow]);

  /** Ändert Einstellungen, aktives Set oder Tageszähler und merkt das für den Abgleich vor. */
  const setMeta = (change: (prev: Persisted) => Partial<Persisted>) =>
    setData((prev) => ({ ...prev, ...change(prev), metaT: Date.now(), metaDirty: true }));

  useEffect(() => {
    loadAudioIndex();
    // Die App startet immer auf dem Lernpfad. "Zurück" im Browser führt dorthin.
    history.replaceState({}, "", "/");
    const onPop = () => {
      stop();
      if (location.pathname !== "/") history.replaceState({}, "", "/");
      setView({ name: "home" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = (next: View, path: string) => {
    history.pushState({}, "", path);
    setView(next);
  };
  const goHome = () => history.back();

  const newLeft = NEW_PER_DAY - (data.newLog.day === today ? data.newLog.count : 0);
  const plan = planToday(sets, active.id, data.cards, today, newLeft);

  const startSession = (items: Item[]) => {
    if (items.length === 0) return;
    const steps = items.map((item) =>
      makeStep(item, getCard(data.cards, item.id, today), poolFor(item), data.settings.listen, Math.random),
    );
    // Der Ton für die erste Aufgabe muss noch im Klick starten.
    const first = steps[0]!;
    if (first.kind !== "type") speak(itemsById.get(first.itemId)!.fr, "fr", data.settings.rate);
    open({ name: "session", steps, run: Date.now() }, "/ueben");
  };

  const startToday = () => {
    const pick = (ids: string[]) => ids.map((id) => itemsById.get(id)!).filter(Boolean);
    startSession([...pick(plan.newIds), ...shuffle(pick(plan.dueIds), Math.random)]);
  };

  const startStation = (station: Station) => {
    const items = station.itemIds.map((id) => itemsById.get(id)!).filter(Boolean);
    const isNew = (item: Item) => !getCard(data.cards, item.id, today).seen;
    startSession([...items.filter(isNew), ...shuffle(items.filter((i) => !isNew(i)), Math.random)]);
  };

  const onProgress = (itemId: string, card: CardState, introduced: boolean) => {
    const now = Date.now();
    setData((prev) => {
      const next: Persisted = {
        ...prev,
        cards: { ...prev.cards, [itemId]: card },
        sync: touch(prev.sync, itemId, now),
      };
      if (introduced) {
        const count = prev.newLog.day === today ? prev.newLog.count : 0;
        next.newLog = { day: today, count: count + 1 };
        next.metaT = now;
        next.metaDirty = true;
      }
      return next;
    });
  };

  const changeSettings = (settings: SettingsData) => setMeta(() => ({ settings }));

  const resetActive = () => {
    const now = Date.now();
    setData((prev) => {
      // Nicht löschen, sondern auf "neu" setzen. Sonst bringt der Abgleich die Karten zurück.
      const cards = { ...prev.cards };
      let sync = prev.sync;
      for (const item of active.items) {
        if (!cards[item.id]) continue;
        cards[item.id] = { box: 1, due: today, seen: false };
        sync = touch(sync, item.id, now);
      }
      return { ...prev, cards, sync };
    });
    void syncNow();
  };

  return (
    <div className="app">
      {view.name === "home" && (
        <Home
          sets={sets}
          active={active}
          progress={data.cards}
          today={today}
          plan={plan}
          dueTomorrow={countDueBy(sets, data.cards, today + 1)}
          onStartToday={startToday}
          onStartStation={startStation}
          onSwitchSet={(id) => setMeta(() => ({ activeSet: id }))}
          onOpenList={() => open({ name: "list" }, "/liste")}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      {view.name === "session" && (
        <Session
          key={view.run}
          steps={view.steps}
          itemsById={itemsById}
          poolFor={poolFor}
          progress={data.cards}
          today={today}
          settings={data.settings}
          onProgress={onProgress}
          onDone={(stats) => {
            setView({ name: "done", stats });
            void syncNow();
          }}
          onClose={goHome}
        />
      )}
      {view.name === "done" && (
        <Done
          stats={view.stats}
          unit={active.unit}
          dueTomorrow={countDueBy(sets, data.cards, today + 1)}
          onHome={goHome}
        />
      )}
      {view.name === "list" && (
        <WordList set={active} progress={data.cards} rate={data.settings.rate} onBack={goHome} />
      )}
      {settingsOpen && (
        <Settings
          user={user}
          syncStatus={syncStatus}
          onSignedOut={onSignedOut}
          settings={data.settings}
          setLabel={active.label}
          onChange={changeSettings}
          onReset={resetActive}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
