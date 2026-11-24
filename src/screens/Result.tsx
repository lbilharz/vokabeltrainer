import { PRAISE, reasonLabel, retryLabel, verdictLine, weakTitle } from "@shared/focus";
import type { Item } from "@shared/types";
import { Icon } from "../components/Icon";
import type { SessionStats } from "./Done";

interface Props {
  stats: SessionStats;
  itemsById: Map<string, Item>;
  lessonLabel: string;
  /** Tagesnummer des Tests und von heute. Daraus wird "morgen" oder "heute". */
  testDay: number;
  today: number;
  onRetry: (items: Item[]) => void;
  onHome: () => void;
}

/** Das Ergebnis der Generalprobe. */
export function Result({ stats, itemsById, lessonLabel, testDay, today, onRetry, onHome }: Props) {
  const weak = stats.weak.flatMap((w) => {
    const item = itemsById.get(w.itemId);
    return item ? [{ item, reason: w.reason }] : [];
  });
  const sure = Math.max(0, stats.total - weak.length);

  return (
    <main className="screen result">
      <header className="topbar left">
        <button className="icon-btn" aria-label="Zurück zur Startseite" onClick={onHome}>
          <Icon name="chevronLeft" size={26} stroke={2.6} />
        </button>
        <h1>Generalprobe</h1>
      </header>

      <section className="score">
        <div className="score-number">
          {sure} von {stats.total}
        </div>
        <p className="score-verdict">{verdictLine(testDay, today)}</p>
        <p className="score-lesson">{lessonLabel}. Alle Wörter frei geschrieben.</p>
      </section>

      {weak.length > 0 ? (
        <section className="weak">
          <h2>{weakTitle(weak.length)}</h2>
          <ul>
            {weak.map(({ item, reason }) => (
              <li key={item.id}>
                <div>
                  <div className="weak-fr" lang="fr">
                    {item.fr}
                  </div>
                  <div className="weak-de">{item.de}</div>
                </div>
                <span className="reason-chip">{reasonLabel(reason)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="praise">{PRAISE}</p>
      )}

      <div className="result-actions">
        {weak.length > 0 && (
          <button className="btn primary" onClick={() => onRetry(weak.map((w) => w.item))}>
            {retryLabel(weak.length)}
          </button>
        )}
        <button className="text-btn center" onClick={onHome} autoFocus={weak.length === 0}>
          Fertig für heute
        </button>
      </div>
    </main>
  );
}
