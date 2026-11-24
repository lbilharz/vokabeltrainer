import { useState } from "react";
import {
  type Focus,
  FOCUS_MAX_AHEAD,
  dayToIso,
  isTestDayAllowed,
  isoToDay,
  learnLabel,
  openLine,
  planLines,
  planTitle,
  schoolDays,
  shortDate,
  testTitle,
  weekdayShort,
} from "@shared/focus";
import { countWords } from "@shared/lessons";
import type { Progress } from "@shared/types";
import { Icon } from "../components/Icon";
import type { SetView } from "../data/sets";

interface Props {
  /** Die aktuelle Lektion. Für sie wird der Test-Tag gewählt. */
  set: SetView;
  progress: Progress;
  today: number;
  /** Der Test-Fokus, falls es schon einen gibt. */
  focus: Focus | undefined;
  /** Name der Lektion, die schon den Fokus hat. Er geht dann auf diese Lektion über. */
  otherLabel: string | undefined;
  onStart: (day: number) => void;
  onEnd: () => void;
  onOpenList: () => void;
  onBack: () => void;
}

/** Hier sagt das Kind, wann der Test ist. Danach gibt es den Plan. */
export function TestDay({ set, progress, today, focus, otherLabel, onStart, onEnd, onOpenList, onBack }: Props) {
  const own = focus?.setId === set.id ? focus : undefined;
  const [chosen, setChosen] = useState<number | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);

  const counts = countWords(set.items, progress, today);
  const unseen = counts.total - counts.practised;
  const percent = counts.total ? (counts.practised / counts.total) * 100 : 0;
  const days = schoolDays(today, 4);
  const min = today + 1;
  const max = today + FOCUS_MAX_AHEAD;

  const pickOther = (value: string) => {
    const day = isoToDay(value);
    if (day !== null && isTestDayAllowed(day, today)) setChosen(day);
  };

  return (
    <main className="screen testday">
      <header className="topbar left">
        <button className="icon-btn" aria-label="Zurück zur Startseite" onClick={onBack}>
          <Icon name="chevronLeft" size={26} stroke={2.6} />
        </button>
        <h1>{set.label}</h1>
      </header>

      <div className="testday-progress">
        <div className="bar" role="img" aria-label={`${counts.practised} von ${counts.total} geübt`}>
          <div className="bar-fill soft" style={{ width: `${percent}%` }} />
        </div>
        <p className="set-progress">{openLine(counts, set.unit)}</p>
      </div>

      {own ? (
        <section className="test-panel">
          <div className="test-panel-head">
            <Icon name="calendar" size={22} stroke={2.2} />
            <h2>{testTitle(own.day, today)}</h2>
          </div>
          <p className="test-panel-ask">Bis dahin kommen neue Wörter nur aus dieser Lektion.</p>
        </section>
      ) : (
        <>
          <section className="test-panel">
            <div className="test-panel-head">
              <Icon name="calendar" size={22} stroke={2.2} />
              <h2>Für einen Test lernen</h2>
            </div>
            <p className="test-panel-ask">Wann ist der Test?</p>
            <div className="day-picker" role="group" aria-label="Tag des Tests">
              {days.map((day) => (
                <button key={day} className="day-btn" aria-pressed={chosen === day} onClick={() => setChosen(day)}>
                  <span>{weekdayShort(day)}</span>
                  <span className="day-date">{shortDate(day)}</span>
                </button>
              ))}
            </div>
            <button className="link-btn" aria-expanded={otherOpen} onClick={() => setOtherOpen(!otherOpen)}>
              Anderer Tag
            </button>
            {otherOpen && (
              <div className="other-day">
                <label htmlFor="test-day">Tag des Tests</label>
                <input
                  id="test-day"
                  type="date"
                  min={dayToIso(min)}
                  max={dayToIso(max)}
                  value={chosen !== null && !days.includes(chosen) ? dayToIso(chosen) : ""}
                  onChange={(event) => pickOther(event.target.value)}
                />
              </div>
            )}
          </section>

          {chosen !== null && (
            <section className="plan-box">
              <p className="plan-title">{planTitle(chosen, today)}</p>
              {planLines(unseen, counts.total, chosen, today).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </section>
          )}

          <p className="test-note">
            Bis zum Test kommen neue Wörter nur aus dieser Lektion. Wiederholt wird weiter aus allen Lektionen.
            {otherLabel ? ` Der Test-Fokus für „${otherLabel}“ endet dann.` : ""}
          </p>
        </>
      )}

      <div className="testday-actions">
        {own ? (
          <button className="btn danger" onClick={onEnd}>
            Test-Fokus beenden
          </button>
        ) : (
          <button
            className={`btn primary ${chosen === null ? "waiting" : ""}`}
            disabled={chosen === null}
            onClick={() => chosen !== null && onStart(chosen)}
          >
            {chosen === null ? "Tag wählen" : learnLabel(chosen, today)}
          </button>
        )}
        <button className="text-btn center" onClick={onOpenList}>
          Alle {set.unit[1]} ansehen
        </button>
      </div>
    </main>
  );
}
