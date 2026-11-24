import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isExpired, isFocusValid, practiceItems, roundKind, updateSure } from "@shared/focus";
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
import type { CardState, Item, RawItem, SetDoc } from "@shared/types";
import { Settings } from "./components/Settings";
import { TEMPLATES, buildSets } from "./data/sets";
import { type User, postSync } from "./lib/account";
import { ApiError } from "./lib/api";
import { ensureAudio, loadAudioIndex, speak, stop } from "./lib/audio";
import {
  type Persisted,
  type Settings as SettingsData,
  loadFor,
  metaOf,
  saveFor,
  withMeta,
} from "./lib/store";
import { AddSet } from "./screens/AddSet";
import { Done, type SessionStats } from "./screens/Done";
import { Home } from "./screens/Home";
import { Lessons } from "./screens/Lessons";
import { Result } from "./screens/Result";
import { Session } from "./screens/Session";
import { TestDay } from "./screens/TestDay";
import { WordList } from "./screens/WordList";
import { loadNewerVersion, newerVersion, onNewerVersion } from "./lib/version";

type View =
  | { name: "home" }
  | { name: "session"; steps: Step[]; run: number; options: RoundOptions }
  | { name: "done"; stats: SessionStats }
  | { name: "result"; stats: SessionStats; testDay: number }
  | { name: "test" }
  | { name: "list" }
  | { name: "lessons" }
  | { name: "add" };

/** Besonderheiten einer Runde. */
interface RoundOptions {
  /** Gesehene Wörter nur frei schreiben (Generalprobe und das Nachüben danach). */
  freeWriting?: boolean;
  /** Nach der Runde das Ergebnis der Generalprobe zeigen. Gilt für diesen Testtag. */
  resultFor?: number;
}

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
  /** true, wenn während eines laufenden Abgleichs ein weiterer gewünscht wurde. */
  const syncAgain = useRef(false);
  const [view, setView] = useState<View>({ name: "home" });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const today = dayNumber(new Date());
  const sets = useMemo(() => buildSets(data.sets), [data.sets]);
  // Ohne Auswahl gilt die neueste Lektion. Ein leeres Konto hat keine.
  const active = sets.find((set) => set.id === data.activeSet) ?? sets[0];
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

  // Der Test-Fokus gilt nur, solange der Test nicht vorbei ist und die Lektion da ist.
  const focus = isFocusValid(
    data.focus,
    today,
    sets.map((set) => set.id),
  )
    ? data.focus
    : undefined;
  // Ob die Lektionen schon geladen sind. Ein neues Gerät hat sie vor dem ersten Abgleich noch nicht.
  const setsLoaded = sets.length > 0 || data.sync.since > 0;

  /**
   * Gleicht den Stand mit dem Server ab. Je Karte gewinnt die jüngere Änderung.
   * Ohne Netz bleibt alles lokal und geht beim nächsten Mal mit.
   */
  const syncNow = useCallback(async () => {
    if (syncing.current) {
      // Nicht verwerfen. Was inzwischen dazukam, geht direkt im Anschluss mit.
      syncAgain.current = true;
      return;
    }
    syncing.current = true;
    setSyncStatus("running");
    const before = dataRef.current;
    const pushed = outgoing(before.cards, before.sync);
    const pushedMetaT = before.metaT;
    const pushedSets = before.setsDirty.map((id) => before.sets[id]).filter((doc): doc is SetDoc => Boolean(doc));
    try {
      const response = await postSync(
        before.sync.since,
        pushed,
        before.metaDirty ? { data: metaOf(before), t: pushedMetaT } : undefined,
        pushedSets,
      );
      setData((prev) => {
        const merged = applyResponse(prev.cards, prev.sync, pushed, response.cards, response.now);
        // Sets: je Set gewinnt die jüngere Änderung, wie bei den Karten.
        // Ohne Änderung bleibt dasselbe Objekt. Sonst rechnet die App bei jedem Abgleich alles neu.
        let mergedSets = prev.sets;
        for (const doc of response.sets ?? []) {
          const local = mergedSets[doc.id];
          if (local && (doc.t < local.t || (doc.t === local.t && doc.deleted === local.deleted))) continue;
          if (mergedSets === prev.sets) mergedSets = { ...prev.sets };
          mergedSets[doc.id] = doc;
        }
        const sent = new Map(pushedSets.map((doc) => [doc.id, doc.t]));
        const setsDirty = prev.setsDirty.filter((id) => sent.get(id) !== prev.sets[id]?.t);
        let next: Persisted = { ...prev, cards: merged.cards, sync: merged.sync, sets: mergedSets, setsDirty };
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
      if (syncAgain.current) {
        syncAgain.current = false;
        window.setTimeout(() => void syncNow(), 0);
      }
    }
  }, [onSignedOut]);

  useEffect(() => {
    void syncNow();
    const onVisibility = () => void syncNow();
    document.addEventListener("visibilitychange", onVisibility);
    // Was ohne Netz geübt wurde, geht mit, sobald das Netz zurück ist.
    window.addEventListener("online", onVisibility);
    // Offene Änderungen gehen spätestens nach einer Minute mit.
    const timer = window.setInterval(() => {
      const current = dataRef.current;
      if (current.sync.dirty.length > 0 || current.metaDirty || current.setsDirty.length > 0) void syncNow();
    }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onVisibility);
      window.clearInterval(timer);
    };
  }, [syncNow]);

  /** Ändert Einstellungen, aktuelle Lektion oder Tageszähler und merkt das für den Abgleich vor. */
  const setMeta = (change: (prev: Persisted) => Partial<Persisted>) =>
    setData((prev) => ({ ...prev, ...change(prev), metaT: Date.now(), metaDirty: true }));

  // Für jedes französische Wort soll es eine Aufnahme geben. Das läuft im Hintergrund.
  // Kennt der Server eine neuere Version, lädt die App sie. Aber nur auf der Startseite, nie mitten in einer Runde.
  const [updateWaiting, setUpdateWaiting] = useState(() => newerVersion() !== null);
  useEffect(() => onNewerVersion(() => setUpdateWaiting(true)), []);
  useEffect(() => {
    if (updateWaiting && view.name === "home" && !settingsOpen && syncStatus !== "running") void loadNewerVersion();
  }, [updateWaiting, view.name, settingsOpen, syncStatus]);

  useEffect(() => {
    const texts = sets.flatMap((set) => set.items.map((item) => item.fr));
    if (texts.length > 0) void ensureAudio(texts);
  }, [sets]);

  useEffect(() => {
    void loadAudioIndex();
    // Testlink /prefill: legt die Vorlagen in diesem Konto an. Normale Konten starten leer.
    if (location.pathname === "/prefill") {
      const now = Date.now();
      setData((prev) => {
        const sets = { ...prev.sets };
        const dirty = new Set(prev.setsDirty);
        TEMPLATES.forEach((template, index) => {
          const existing = sets[template.id];
          if (existing && !existing.deleted) return;
          sets[template.id] = {
            id: template.id,
            t: now,
            deleted: false,
            data: { ...template.data, createdAt: now - index },
          };
          dirty.add(template.id);
        });
        return { ...prev, sets, setsDirty: [...dirty] };
      });
      // Der Abgleich beim Start kennt die neuen Sets noch nicht. Deshalb gleich noch einer.
      window.setTimeout(() => void syncNow(), 0);
    }
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

  // Ein abgelaufener Fokus oder einer ohne Lektion wird entfernt. Das Null wandert zu den anderen Geräten.
  const focusGone = Boolean(data.focus) && (isExpired(data.focus!, today) || (setsLoaded && !focus));
  useEffect(() => {
    if (focusGone) setMeta(() => ({ focus: null }));
  }, [focusGone]);

  const open = (next: View, path: string) => {
    history.pushState({}, "", path);
    setView(next);
  };
  const goHome = () => history.back();

  const newToday = data.newLog.day === today ? data.newLog.count : 0;
  const newLeft = NEW_PER_DAY - newToday;
  const plan = planToday(
    sets,
    active?.id ?? "",
    data.cards,
    today,
    newLeft,
    focus ? { setId: focus.setId, day: focus.day, newToday } : undefined,
  );

  const startSession = (items: Item[], options: RoundOptions = {}) => {
    if (items.length === 0) return;
    const steps = items.map((item) =>
      makeStep(
        item,
        getCard(data.cards, item.id, today),
        poolFor(item),
        data.settings.listen,
        Math.random,
        options.freeWriting,
      ),
    );
    // Der Ton für die erste Aufgabe muss noch im Klick starten.
    const first = steps[0]!;
    if (first.kind !== "type") speak(itemsById.get(first.itemId)!.fr, "fr", data.settings.rate);
    open({ name: "session", steps, run: Date.now(), options }, "/ueben");
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

  /** Die Test-Karte: Übungsrunde mit den unsicheren Wörtern, am Tag vor dem Test die Generalprobe. */
  const startTest = () => {
    const set = focus && sets.find((s) => s.id === focus.setId);
    if (!focus || !set) return;
    if (roundKind(focus, today) === "practice") {
      startSession(practiceItems(set.items, focus));
      return;
    }
    // Generalprobe: alle Wörter. Neue zuerst zum Kennenlernen, dann die gesehenen gemischt.
    const isNew = (item: Item) => !getCard(data.cards, item.id, today).seen;
    startSession([...set.items.filter(isNew), ...shuffle(set.items.filter((i) => !isNew(i)), Math.random)], {
      freeWriting: true,
      resultFor: focus.day,
    });
  };

  /** Merkt, ob das Kind ein Wort schreiben konnte. Ändert sich nichts, bleibt der Stand unberührt. */
  const onWritten = (itemId: string, kind: Step["kind"], correct: boolean) => {
    setData((prev) => {
      const current = prev.focus;
      if (!current || itemsById.get(itemId)?.setId !== current.setId) return prev;
      const updated = updateSure(current, itemId, kind, correct);
      if (updated === current) return prev;
      return { ...prev, focus: updated, metaT: Date.now(), metaDirty: true };
    });
  };

  /** Legt den Test-Fokus fest. Die Lektion wird zur aktuellen. Ein früherer Fokus fällt weg. */
  const startFocus = (day: number) => {
    if (!active) return;
    const keep = data.focus?.setId === active.id && data.focus.day === day ? data.focus.sure : [];
    setMeta(() => ({ focus: { setId: active.id, day, sure: keep }, activeSet: active.id }));
    goHome();
  };

  const endFocus = () => {
    setMeta(() => ({ focus: null }));
    goHome();
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

  /** Legt eine neue Lektion an und zeigt gleich deren Lernpfad. */
  const addSet = (label: string, items: RawItem[]) => {
    const now = Date.now();
    const id = `s${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    setData((prev) => ({
      ...prev,
      sets: {
        ...prev.sets,
        [id]: { id, t: now, deleted: false, data: { label, unit: ["Wort", "Wörter"], items, createdAt: now } },
      },
      setsDirty: [...prev.setsDirty, id],
      activeSet: id,
      metaT: now,
      metaDirty: true,
    }));
    goHome();
    // Erst nach dem Speichern abgleichen. Der neue Stand liegt beim nächsten Zeichnen vor.
    window.setTimeout(() => void syncNow(), 0);
  };

  /** Benennt die aktuelle Lektion um. Der Lernstand bleibt, er hängt an den Wörtern. */
  const renameActive = (label: string) => {
    if (!active) return;
    const now = Date.now();
    setData((prev) => {
      const doc = prev.sets[active.id];
      if (!doc?.data || doc.data.label === label) return prev;
      const old = doc.data.label;
      // Ältere Sets trugen den Set-Namen als Abschnitt an jedem Eintrag ohne Überschrift.
      // Der fällt hier weg, sonst hiessen die Stationen weiter wie der alte Name.
      const items = doc.data.items.map((item) => (item.c === old ? { ...item, c: "" } : item));
      return {
        ...prev,
        sets: { ...prev.sets, [active.id]: { ...doc, t: now, data: { ...doc.data, label, items } } },
        setsDirty: [...new Set([...prev.setsDirty, active.id])],
      };
    });
    window.setTimeout(() => void syncNow(), 0);
  };

  /** Entfernt die aktuelle Lektion. Der leere Eintrag bleibt, damit die Löschung mitwandert. */
  const deleteActive = () => {
    if (!active) return;
    const now = Date.now();
    setData((prev) => ({
      ...prev,
      sets: { ...prev.sets, [active.id]: { id: active.id, t: now, deleted: true, data: null } },
      setsDirty: [...new Set([...prev.setsDirty, active.id])],
      activeSet: "",
      metaT: now,
      metaDirty: true,
    }));
    window.setTimeout(() => void syncNow(), 0);
  };

  const resetActive = () => {
    if (!active) return;
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
          focus={focus}
          onOpenTest={() => open({ name: "test" }, "/test")}
          onStartTest={startTest}
          loading={sets.length === 0 && data.sync.since === 0 && syncStatus === "running"}
          onAddSet={() => open({ name: "add" }, "/neu")}
          onRenameSet={renameActive}
          onStartToday={startToday}
          onStartStation={startStation}
          onOpenLessons={() => open({ name: "lessons" }, "/lektionen")}
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
          onWritten={onWritten}
          freeWriting={view.options.freeWriting}
          onDone={(stats) => {
            const testDay = view.options.resultFor;
            setView(testDay === undefined ? { name: "done", stats } : { name: "result", stats, testDay });
            void syncNow();
          }}
          onClose={goHome}
        />
      )}
      {view.name === "done" && (
        <Done
          stats={view.stats}
          unit={active?.unit ?? ["Wort", "Wörter"]}
          dueTomorrow={countDueBy(sets, data.cards, today + 1)}
          onHome={goHome}
        />
      )}
      {view.name === "result" && (
        <Result
          stats={view.stats}
          itemsById={itemsById}
          lessonLabel={(focus && sets.find((s) => s.id === focus.setId)?.label) ?? active?.label ?? ""}
          testDay={view.testDay}
          today={today}
          onRetry={(items) => startSession(items, { freeWriting: true })}
          onHome={goHome}
        />
      )}
      {view.name === "test" && active && (
        <TestDay
          set={active}
          progress={data.cards}
          today={today}
          focus={focus}
          otherLabel={focus && focus.setId !== active.id ? sets.find((s) => s.id === focus.setId)?.label : undefined}
          onStart={startFocus}
          onEnd={endFocus}
          onOpenList={() => open({ name: "list" }, "/liste")}
          onBack={goHome}
        />
      )}
      {view.name === "list" && active && (
        <WordList set={active} progress={data.cards} rate={data.settings.rate} onBack={goHome} />
      )}
      {view.name === "lessons" && (
        <Lessons
          sets={sets}
          activeId={active?.id}
          progress={data.cards}
          today={today}
          focus={focus}
          onPick={(id) => {
            setMeta(() => ({ activeSet: id }));
            goHome();
          }}
          onAddSet={() => open({ name: "add" }, "/neu")}
          onBack={goHome}
        />
      )}
      {view.name === "add" && <AddSet onSave={addSet} onClose={goHome} />}
      {settingsOpen && (
        <Settings
          user={user}
          syncStatus={syncStatus}
          onSignedOut={onSignedOut}
          settings={data.settings}
          setLabel={active?.label ?? null}
          onDeleteSet={deleteActive}
          onChange={changeSettings}
          onReset={resetActive}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
