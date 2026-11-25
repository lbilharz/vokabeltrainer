import { type FormEvent, useState } from "react";
import { photoLine } from "@shared/dates";
import {
  type Focus,
  leftWord,
  practiceItems,
  roundKind,
  sureCount,
  sureLine,
  testChip,
  testTitle,
} from "@shared/focus";
import { addCounts, countWords, lessonLine, openHint, openLessons, vocabularyLine } from "@shared/lessons";
import { type Station, buildStations, stationStatuses } from "@shared/path";
import type { TodayPlan } from "@shared/session";
import { getCard, isMastered } from "@shared/srs";
import type { Progress } from "@shared/types";
import { FirstSteps } from "../components/FirstSteps";
import { Icon } from "../components/Icon";
import { TipCard } from "../components/TipCard";
import type { SetView } from "../data/sets";

interface Props {
  sets: SetView[];
  /** Die aktuelle Lektion. Fehlt, solange das Konto noch keine hat. */
  active: SetView | undefined;
  /** true, solange der erste Abgleich läuft und noch nichts zu zeigen ist. */
  loading: boolean;
  onAddSet: () => void;
  /** Legt die Probe-Lektion an. */
  onAddSample: () => void;
  userId: string;
  onRenameSet: (label: string) => void;
  progress: Progress;
  today: number;
  plan: TodayPlan;
  dueTomorrow: number;
  /** Der gültige Test-Fokus. Fehlt er, gibt es keine Test-Karte. */
  focus: Focus | undefined;
  onOpenTest: () => void;
  onStartTest: () => void;
  onStartToday: () => void;
  onStartStation: (station: Station) => void;
  onOpenLessons: () => void;
  onOpenList: () => void;
  onOpenSettings: () => void;
}

/** Einzug der Stationen. So entsteht der geschwungene Pfad. */
const OFFSETS = [0, 1, 2, 1];

function count(n: number, unit: [string, string]): string {
  return `${n} ${n === 1 ? unit[0] : unit[1]}`;
}

/** Anteil in Prozent für die Breite eines Balkens. */
function percent(part: number, total: number): number {
  return total ? (part / total) * 100 : 0;
}

/** Was die Test-Karte zeigt. */
function testCardFor(focus: Focus, focusSet: SetView, today: number) {
  const round = roundKind(focus, today);
  return {
    focusSet,
    total: focusSet.items.length,
    sure: sureCount(focus, focusSet.items),
    round,
    canPractice: round === "rehearsal" || practiceItems(focusSet.items, focus).length > 0,
  };
}

export function Home(props: Props) {
  const { sets, active, progress, today, plan } = props;
  /** null: der Name wird nur angezeigt. Sonst der Text im Eingabefeld. */
  const [renaming, setRenaming] = useState<string | null>(null);

  const rename = (event: FormEvent) => {
    event.preventDefault();
    const label = (renaming ?? "").trim();
    if (label) props.onRenameSet(label);
    setRenaming(null);
  };

  if (!active) {
    return (
      <main className="screen home">
        <header className="topbar sticky">
          <h1 className="greeting">Bonjour</h1>
          <button className="icon-btn outlined" aria-label="Einstellungen" onClick={props.onOpenSettings}>
            <Icon name="sliders" size={22} stroke={2.2} />
          </button>
        </header>
        {props.loading ? (
          <p className="lead empty" aria-busy="true">
            Einen Moment …
          </p>
        ) : (
          <FirstSteps onAddSet={props.onAddSet} onAddSample={props.onAddSample} />
        )}
      </main>
    );
  }

  const now = Date.now();
  const stations = buildStations(active.items);
  const statuses = stationStatuses(stations, progress);
  const lesson = countWords(active.items, progress, today);
  const vocabulary = sets.reduce((sum, set) => addCounts(sum, countWords(set.items, progress, today)), {
    total: 0,
    practised: 0,
    mastered: 0,
  });
  const hint = openHint(openLessons(sets, active.id, progress, today), now);
  const dateLine = photoLine(active.createdAt, now);

  const todayCount = plan.dueIds.length + plan.newIds.length;
  const parts: string[] = [];
  if (plan.dueIds.length) parts.push(`${plan.dueIds.length} zum Wiederholen`);
  if (plan.newIds.length) {
    const n = plan.newIds.length;
    if (plan.forTest) parts.push(n === 1 ? "1 neues Wort für den Test" : `${n} neue Wörter für den Test`);
    else parts.push(n === 1 ? "1 neue Karte" : `${n} neue Karten`);
  }
  // Nur wenn der Rückstand dabei ist, sagt eine zweite Zeile, woher die neuen Karten kommen.
  const origin: string[] = [];
  if (plan.newFromActive > 0) origin.push(`${plan.newFromActive} aus ${active.label}`);
  if (plan.newFromBacklog > 0) origin.push(`${plan.newFromBacklog} aus dem Rückstand`);

  // Die Test-Karte gehört zur Fokus-Lektion, auch wenn eine andere gerade aktuell ist.
  const { focus } = props;
  const focusSet = focus ? sets.find((set) => set.id === focus.setId) : undefined;
  const testCard = focus && focusSet ? testCardFor(focus, focusSet, today) : null;
  const activeChip = focus && focus.setId === active.id ? testChip(focus.day, today) : null;

  return (
    <main className="screen home">
      <header className="topbar sticky">
        <h1 className="greeting">Bonjour</h1>
        <div className="topbar-actions">
          <button className="pill-btn" onClick={props.onAddSet}>
            <Icon name="camera" size={22} stroke={2.2} />
            Neue Vokabeln
          </button>
          <button className="icon-btn outlined" aria-label="Einstellungen" onClick={props.onOpenSettings}>
            <Icon name="sliders" size={22} stroke={2.2} />
          </button>
        </div>
      </header>

      <section className="today">
        {todayCount > 0 ? (
          <>
            <h2>{todayCount === 1 ? "1 Karte für heute" : `${todayCount} Karten für heute`}</h2>
            <p>{parts.join(", ")}</p>
            {plan.newFromBacklog > 0 && <p>{origin.join(", ")}</p>}
            <button className="btn primary" onClick={props.onStartToday}>
              Los geht's
            </button>
          </>
        ) : (
          <>
            <h2>Für heute geschafft</h2>
            <p>
              {props.dueTomorrow > 0
                ? `Morgen ${props.dueTomorrow === 1 ? "wartet 1 Karte" : `warten ${props.dueTomorrow} Karten`} auf dich.`
                : "Tippe auf eine Station, wenn du mehr üben willst."}
            </p>
          </>
        )}
      </section>

      {focus && testCard && (
        <section className="test-card" aria-label="Test">
          <div className="test-card-head">
            <span className="test-card-icon">
              <Icon name="calendar" size={22} stroke={2.2} />
            </span>
            <div>
              <h2>{testTitle(focus.day, today)}</h2>
              <p>
                {testCard.focusSet.label}. {leftWord(focus.day, today)}
              </p>
            </div>
          </div>
          <div
            className="bar"
            role="img"
            aria-label={`${sureLine(testCard.sure, testCard.total)} für den Test`}
          >
            <div className="bar-fill" style={{ width: `${percent(testCard.sure, testCard.total)}%` }} />
          </div>
          <div className="test-card-foot">
            <span>{sureLine(testCard.sure, testCard.total)}</span>
            {testCard.canPractice ? (
              <button className="test-btn" onClick={props.onStartTest}>
                {testCard.round === "rehearsal" ? "Generalprobe" : "Für den Test üben"}
              </button>
            ) : (
              <span className="test-all-sure">Alle sicher</span>
            )}
          </div>
        </section>
      )}

      <section className="vocab">
        <div className="section-head">
          <h2>Mein Wortschatz</h2>
          <span className="vocab-count">{vocabulary.total === 1 ? "1 Wort" : `${vocabulary.total} Wörter`}</span>
        </div>
        {/* Hell: schon geübt. Dunkel: sitzt. */}
        <div
          className="bar stacked"
          role="img"
          aria-label={`${vocabulary.practised} von ${vocabulary.total} geübt, ${vocabulary.mastered} sitzen`}
        >
          <div className="bar-fill soft" style={{ width: `${percent(vocabulary.practised, vocabulary.total)}%` }} />
          <div className="bar-fill" style={{ width: `${percent(vocabulary.mastered, vocabulary.total)}%` }} />
        </div>
        <p className="set-progress">{vocabularyLine(vocabulary)}</p>
      </section>

      <TipCard userId={props.userId} onOpenSettings={props.onOpenSettings} />

      <div className="section-head">
        <h2>Aktuelle Lektion</h2>
        {sets.length > 1 && (
          <button className="chip-btn" onClick={props.onOpenLessons}>
            <Icon name="list" size={20} stroke={2.4} />
            Alle Lektionen
          </button>
        )}
      </div>

      <section className="lesson-card">
        <div className="lesson-top">
        <div className="set-head">
          {renaming === null ? (
            <div className="set-title">
              <h2>
                {active.label}
                {activeChip && <span className="test-chip">{activeChip}</span>}
                <button
                  className="icon-btn inline"
                  aria-label="Lektion umbenennen"
                  onClick={() => setRenaming(active.label)}
                >
                  <Icon name="pencil" size={18} stroke={2.2} />
                </button>
              </h2>
            </div>
          ) : (
            <form className="rename" onSubmit={rename}>
              <label htmlFor="set-label" className="sr-only">
                Name der Lektion
              </label>
              <input
                id="set-label"
                type="text"
                value={renaming}
                maxLength={60}
                autoFocus
                onChange={(event) => setRenaming(event.target.value)}
              />
              <button className="btn quiet" type="submit">
                Fertig
              </button>
            </form>
          )}
          {dateLine && <p className="lesson-date">{dateLine}</p>}
          <p className="lesson-progress">{lessonLine(lesson)}</p>
        </div>
        {renaming === null && (
          <button className="chip-btn test-ask" onClick={props.onOpenTest}>
            <Icon name="calendar" size={22} stroke={2.2} />
            Test?
          </button>
        )}
        </div>

        <ol className="path">
          {stations.map((station, index) => {
            const status = statuses[index]!;
            const cards = station.itemIds.map((id) => getCard(progress, id, today));
            const n = cards.length;
            const sitting = cards.filter(isMastered).length;
            const unseen = cards.filter((card) => !card.seen).length;
            const sub =
              status === "done"
                ? sitting === n
                  ? `${count(n, active.unit)}, sitzt`
                  : sitting === 0
                    ? `${count(n, active.unit)} geübt`
                    : `${sitting} von ${n} sitzen`
                : status === "current"
                  ? `${count(n, active.unit)}, ${unseen} neu`
                  : count(n, active.unit);
            const offset = OFFSETS[index % OFFSETS.length]!;
            const label = (
              <span className="station-text">
                <span className="station-label">{station.label}</span>
                <span className="station-sub">{sub}</span>
              </span>
            );
            return (
              <li key={station.id} className={`station ${status} offset-${offset}`}>
                {status === "locked" ? (
                  <div className="station-row">
                    <span className="station-dot">
                      <Icon name="lock" size={26} />
                    </span>
                    {label}
                  </div>
                ) : (
                  <button className="station-row" onClick={() => props.onStartStation(station)}>
                    <span className="station-dot">
                      <Icon name={status === "done" ? "check" : "star"} size={status === "done" ? 30 : 34} stroke={status === "done" ? 3 : 2.4} />
                    </span>
                    {label}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {hint && (
        <button className="hint-link" onClick={props.onOpenLessons}>
          <span>{hint}</span>
          <Icon name="chevronRight" size={18} stroke={2.6} />
        </button>
      )}

      <button className="text-btn" onClick={props.onOpenList}>
        <Icon name="list" size={20} />
        Alle {active.unit[1]} ansehen
      </button>
    </main>
  );
}
