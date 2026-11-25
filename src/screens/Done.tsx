import type { WeakReason } from "@shared/focus";
import { doneHeadline } from "@shared/cheer";
import { Confetti } from "../components/Confetti";
import { Icon } from "../components/Icon";
import "../celebrate.css";

/** Ein Wort, an dem in dieser Runde etwas nicht stimmte. */
export interface WeakWord {
  itemId: string;
  /** Das erste Problem in der Runde. */
  reason: WeakReason;
}

export interface SessionStats {
  /** Verschiedene Karten in dieser Runde. */
  total: number;
  /** Karten, die mindestens einmal falsch waren. */
  again: number;
  /** Karten, die zum ersten Mal gezeigt wurden. */
  introduced: number;
  /** Wörter mit Schwäche, in der Reihenfolge des ersten Problems. Die Generalprobe zeigt sie an. */
  weak: WeakWord[];
  /** Längste Serie richtiger Antworten im ersten Versuch. */
  bestStreak: number;
  /** Wörter, die in dieser Runde Box "sitzt" erreicht haben. */
  mastered: number;
}

interface Props {
  stats: SessionStats;
  unit: [string, string];
  dueTomorrow: number;
  onHome: () => void;
}

export function Done({ stats, unit, dueTomorrow, onHome }: Props) {
  const head = doneHeadline(stats);
  const flawless = head.title === "Fehlerfrei";
  return (
    <main className="screen done">
      <div className="done-body">
        <div className="cheer-mark">
          {flawless && <Confetti />}
          <div className="done-mark cheer-pop">
            <Icon name="check" size={64} stroke={2.8} />
          </div>
        </div>
        <div className="done-title">
          <h1>{head.title}</h1>
          <p>{head.line}</p>
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
        {(stats.mastered > 0 || stats.bestStreak >= 3) && (
          <div className="cheer-extras">
            {stats.mastered > 0 && (
              <p>{stats.mastered === 1 ? "1 Wort sitzt jetzt." : `${stats.mastered} Wörter sitzen jetzt.`}</p>
            )}
            {stats.bestStreak >= 3 && <p>Längste Serie: {stats.bestStreak}</p>}
          </div>
        )}
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
