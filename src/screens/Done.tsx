import { Icon } from "../components/Icon";

export interface SessionStats {
  /** Verschiedene Karten in dieser Runde. */
  total: number;
  /** Karten, die mindestens einmal falsch waren. */
  again: number;
  /** Karten, die zum ersten Mal gezeigt wurden. */
  introduced: number;
}

interface Props {
  stats: SessionStats;
  unit: [string, string];
  dueTomorrow: number;
  onHome: () => void;
}

export function Done({ stats, unit, dueTomorrow, onHome }: Props) {
  return (
    <main className="screen done">
      <div className="done-body">
        <div className="done-mark">
          <Icon name="check" size={64} stroke={2.8} />
        </div>
        <div className="done-title">
          <h1>Geschafft</h1>
          <p>{stats.total === 1 ? "1 Karte ist durch." : `${stats.total} Karten sind durch.`}</p>
        </div>
        <div className="tiles">
          <div className="tile good">
            <strong>{stats.total - stats.again}</strong>
            <span>gleich richtig</span>
          </div>
          <div className="tile bad">
            <strong>{stats.again}</strong>
            <span>nochmal geübt</span>
          </div>
          <div className="tile">
            <strong>{stats.introduced}</strong>
            <span>{stats.introduced === 1 ? `neues ${unit[0]}` : `neue ${unit[1]}`}</span>
          </div>
        </div>
        {dueTomorrow > 0 && (
          <p className="done-next">
            Morgen {dueTomorrow === 1 ? "wartet 1 Karte" : `warten ${dueTomorrow} Karten`} auf dich.
          </p>
        )}
      </div>
      <button className="btn primary" onClick={onHome} autoFocus>
        Zum Lernpfad
      </button>
    </main>
  );
}
