import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { CardState, Item } from "@shared/types";
import { Settings } from "./components/Settings";
import { buildSets } from "./data/sets";
import { loadAudioIndex, speak, stop } from "./lib/audio";
import { type Persisted, type Settings as SettingsData, load, save } from "./lib/store";
import { Done, type SessionStats } from "./screens/Done";
import { Home } from "./screens/Home";
import { Session } from "./screens/Session";
import { WordList } from "./screens/WordList";

type View =
  | { name: "home" }
  | { name: "session"; steps: Step[]; run: number }
  | { name: "done"; stats: SessionStats }
  | { name: "list" };

export function App() {
  const [data, setData] = useState<Persisted>(load);
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

  useEffect(() => save(data), [data]);

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
    setData((prev) => {
      const count = prev.newLog.day === today ? prev.newLog.count : 0;
      return {
        ...prev,
        cards: { ...prev.cards, [itemId]: card },
        newLog: introduced ? { day: today, count: count + 1 } : prev.newLog,
      };
    });
  };

  const changeSettings = (settings: SettingsData) => setData((prev) => ({ ...prev, settings }));

  const resetActive = () => {
    setData((prev) => {
      const cards = { ...prev.cards };
      for (const item of active.items) delete cards[item.id];
      return { ...prev, cards };
    });
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
          onSwitchSet={(id) => setData((prev) => ({ ...prev, activeSet: id }))}
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
          onDone={(stats) => setView({ name: "done", stats })}
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
