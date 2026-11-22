import { type Station, buildStations, stationStatuses } from "@shared/path";
import type { TodayPlan } from "@shared/session";
import { getCard, isDue, isMastered } from "@shared/srs";
import type { Progress } from "@shared/types";
import { Icon } from "../components/Icon";
import type { SetView } from "../data/sets";

interface Props {
  sets: SetView[];
  active: SetView;
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
        <div className="set-title">
          <h2>{active.label}</h2>
          <span>
            {mastered} von {total} sitzen
          </span>
        </div>
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
