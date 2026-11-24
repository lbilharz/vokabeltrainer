import { photoLine } from "@shared/dates";
import { type Focus, testChip } from "@shared/focus";
import { type Counts, countWords, listLine } from "@shared/lessons";
import type { Progress } from "@shared/types";
import { Icon } from "../components/Icon";
import type { SetView } from "../data/sets";

interface Props {
  /** Alle Lektionen, die neueste zuerst. */
  sets: SetView[];
  activeId: string | undefined;
  progress: Progress;
  today: number;
  /** Der gültige Test-Fokus. Seine Lektion trägt ein Schild. */
  focus: Focus | undefined;
  onPick: (id: string) => void;
  onAddSet: () => void;
  onBack: () => void;
}

/** Der Fortschritt vor dem Namen: ein Ring, bei lauter geübten Wörtern ein grüner Haken. */
function Completion({ counts }: { counts: Counts }) {
  const { total, practised } = counts;
  if (total > 0 && practised === total) {
    return (
      <span className="lesson-mark done">
        <Icon name="check" size={18} stroke={3} />
      </span>
    );
  }
  const percent = total ? Math.floor((practised / total) * 100) : 0;
  return (
    <span
      className="lesson-mark ring"
      role="img"
      aria-label={`${percent} Prozent geübt`}
      style={{ background: `conic-gradient(var(--green) ${percent}%, var(--track) 0)` }}
    >
      <span className="ring-hole" />
    </span>
  );
}

/** Alle Lektionen. Ein Tipp macht eine Lektion zur aktuellen. */
export function Lessons({ sets, activeId, progress, today, focus, onPick, onAddSet, onBack }: Props) {
  const now = Date.now();
  const words = sets.reduce((n, set) => n + set.items.length, 0);

  return (
    <main className="screen lessons">
      <header className="topbar sticky back">
        <div className="topbar-start">
          <button className="icon-btn" aria-label="Zurück zur Startseite" onClick={onBack}>
            <Icon name="chevronLeft" size={26} stroke={2.6} />
          </button>
          <h1>Alle Lektionen</h1>
        </div>
        <button className="icon-btn camera" aria-label="Neue Vokabeln fotografieren" onClick={onAddSet}>
          <Icon name="camera" size={22} stroke={2.2} />
        </button>
      </header>

      <p className="lead small">Tippe auf eine Lektion. Sie wird dann deine aktuelle Lektion.</p>

      <ul className="lesson-list">
        {sets.map((set) => {
          const counts = countWords(set.items, progress, today);
          const current = set.id === activeId;
          const date = photoLine(set.createdAt, now);
          return (
            <li key={set.id}>
              <button
                className={`lesson-row${current ? " current" : ""}`}
                aria-current={current ? "true" : undefined}
                onClick={() => onPick(set.id)}
              >
                <Completion counts={counts} />
                <span className="lesson-text">
                  <span className="lesson-name">
                    {set.label}
                    {focus?.setId === set.id && <span className="test-chip">{testChip(focus.day, today)}</span>}
                  </span>
                  {date && <span className="lesson-date">{date}</span>}
                  <span className="lesson-progress">{listLine(counts)}</span>
                </span>
                {current ? (
                  <span className="lesson-chip">aktuell</span>
                ) : (
                  <span className="lesson-go">
                    <Icon name="chevronRight" size={18} stroke={2.6} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="lessons-total">
        {sets.length === 1 ? "1 Lektion" : `${sets.length} Lektionen`}, {words === 1 ? "1 Wort" : `${words} Wörter`}. Die
        neueste steht oben.
      </p>
    </main>
  );
}
