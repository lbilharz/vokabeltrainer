import { type FormEvent, useState } from "react";
import { type Station, buildStations, stationStatuses } from "@shared/path";
import type { TodayPlan } from "@shared/session";
import { getCard, isDue, isMastered } from "@shared/srs";
import type { Progress } from "@shared/types";
import { Icon } from "../components/Icon";
import type { SetView } from "../data/sets";

interface Props {
  sets: SetView[];
  /** Fehlt, solange das Konto noch kein Set hat. */
  active: SetView | undefined;
  /** true, solange der erste Abgleich läuft und noch nichts zu zeigen ist. */
  loading: boolean;
  onAddSet: () => void;
  onRenameSet: (label: string) => void;
  progress: Progress;
  today: number;
  plan: TodayPlan;
  dueTomorrow: number;
  onStartToday: () => void;
  onStartStation: (station: Station) => void;
  onSwitchSet: (id: string) => void;
  onOpenList: () => void;
  onOpenSettings: () => void;
}

/** Einzug der Stationen. So entsteht der geschwungene Pfad. */
const OFFSETS = [0, 1, 2, 1];

function count(n: number, unit: [string, string]): string {
  return `${n} ${n === 1 ? unit[0] : unit[1]}`;
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
        <header className="topbar">
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
          <section className="empty">
            <h2>Noch keine Vokabeln</h2>
            <p className="lead">Fotografiere die Vokabelseite aus deinem Buch. Dann geht es los.</p>
            <button className="btn primary" onClick={props.onAddSet}>
              <Icon name="camera" size={24} stroke={2.2} />
              Vokabeln fotografieren
            </button>
          </section>
        )}
      </main>
    );
  }

  const stations = buildStations(active.items);
  const statuses = stationStatuses(stations, progress);
  const mastered = active.items.filter((item) => isMastered(getCard(progress, item.id, today))).length;
  const total = active.items.length;

  const todayCount = plan.dueIds.length + plan.newIds.length;
  const parts: string[] = [];
  if (plan.dueIds.length) parts.push(`${plan.dueIds.length} zum Wiederholen`);
  if (plan.newIds.length) parts.push(plan.newIds.length === 1 ? "1 neue Karte" : `${plan.newIds.length} neue Karten`);

  return (
    <main className="screen home">
      <header className="topbar">
        <h1 className="greeting">Bonjour</h1>
        <button className="icon-btn outlined" aria-label="Einstellungen" onClick={props.onOpenSettings}>
          <Icon name="sliders" size={22} stroke={2.2} />
        </button>
      </header>

      <section className="today">
        {todayCount > 0 ? (
          <>
            <h2>{todayCount === 1 ? "1 Karte für heute" : `${todayCount} Karten für heute`}</h2>
            <p>{parts.join(", ")}</p>
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

      <section className="set-head">
        {renaming === null ? (
          <div className="set-title">
            <h2>
              {active.label}
              <button
                className="icon-btn inline"
                aria-label="Set umbenennen"
                onClick={() => setRenaming(active.label)}
              >
                <Icon name="pencil" size={18} stroke={2.2} />
              </button>
            </h2>
            <span>
              {mastered} von {total} sitzen
            </span>
          </div>
        ) : (
          <form className="rename" onSubmit={rename}>
            <label htmlFor="set-label" className="sr-only">
              Name des Sets
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
        <div className="bar" role="img" aria-label={`${mastered} von ${total} sitzen`}>
          <div className="bar-fill" style={{ width: `${total ? (mastered / total) * 100 : 0}%` }} />
        </div>
      </section>

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

      <button className="text-btn" onClick={props.onOpenList}>
        <Icon name="list" size={20} />
        Alle {active.unit[1]} ansehen
      </button>

      <button className="btn quiet tall add-set" onClick={props.onAddSet}>
        <Icon name="camera" size={24} stroke={2.2} />
        Neue Vokabeln fotografieren
      </button>

      {sets.length > 1 && (
        <section className="others">
          <h2>Andere Sets</h2>
          {sets
            .filter((set) => set.id !== active.id)
            .map((set) => {
              const cards = set.items.map((item) => getCard(progress, item.id, today));
              const due = cards.filter((card) => isDue(card, today)).length;
              const started = cards.some((card) => card.seen);
              return (
                <button key={set.id} className="row-btn" onClick={() => props.onSwitchSet(set.id)}>
                  <span>{set.label}</span>
                  <span className="row-meta">
                    {due > 0 ? `${due} fällig` : started ? "nichts fällig" : "noch neu"}
                    <Icon name="chevronRight" size={18} stroke={2.6} />
                  </span>
                </button>
              );
            })}
        </section>
      )}
    </main>
  );
}
