import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Step, makeStep, targetsFor } from "@shared/session";
import { getCard, introduce, rate } from "@shared/srs";
import { type Closeness, closeness, isCorrect, norm } from "@shared/text";
import type { CardState, Item, Progress } from "@shared/types";
import { Icon } from "../components/Icon";
import { speak } from "../lib/audio";
import type { Settings } from "../lib/store";
import type { SessionStats } from "./Done";

interface Props {
  steps: Step[];
  itemsById: Map<string, Item>;
  poolFor: (item: Item) => Item[];
  progress: Progress;
  today: number;
  settings: Settings;
  onProgress: (itemId: string, card: CardState, introduced: boolean) => void;
  onDone: (stats: SessionStats) => void;
  onClose: () => void;
}

/**
 * Was bei einer fast richtigen Antwort in der Rückmeldung steht.
 * Akzente und Tippfehler zählen als richtig. Die Karte geht weiter.
 */
const NEAR_NOTES: Record<"accents" | "typo", string> = {
  accents: "Achte beim nächsten Mal auf die Akzente. So schreibt man es:",
  typo: "Achte beim nächsten Mal auf die Schreibweise. So schreibt man es:",
};

const PROMPTS: Record<Step["kind"], string> = {
  intro: "Was heißt das auf Deutsch?",
  type: "Wie heißt das auf Französisch?",
  listenChoice: "Hör zu. Was heißt das auf Deutsch?",
  listenType: "Hör zu. Schreibe, was du hörst.",
};

export function Session(props: Props) {
  const { itemsById, today, settings } = props;
  const [queue, setQueue] = useState(props.steps);
  const [pos, setPos] = useState(0);
  const [typed, setTyped] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  /** near: richtig bis auf Akzente oder einen Tippfehler. Zählt als richtig, mit Hinweis. */
  const [result, setResult] = useState<{ correct: boolean; near?: "accents" | "typo" } | null>(null);
  /** true, sobald der Hinweis auf den fehlenden Artikel gezeigt wurde. Danach zählt der Versuch. */
  const [articleHint, setArticleHint] = useState(false);
  const stats = useRef({ items: new Set<string>(), again: new Set<string>(), introduced: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  /** Höhe der Rückmeldung. So viel Platz bleibt darunter frei, damit nichts verdeckt bleibt. */
  const [sheetHeight, setSheetHeight] = useState(0);

  const step = queue[pos]!;
  const item = itemsById.get(step.itemId)!;
  const pool = props.poolFor(item);
  const hasChoices = step.kind === "intro" || step.kind === "listenChoice";
  const hidesWord = step.kind === "listenChoice" || step.kind === "listenType";

  // Die Rückmeldung klebt am unteren Rand. Der Inhalt darüber bekommt so viel Luft, wie sie hoch ist.
  useLayoutEffect(() => {
    setSheetHeight(result ? (sheetRef.current?.offsetHeight ?? 0) : 0);
  }, [result, pos]);

  // Nach dem Prüfen liegt der Fokus auf "Weiter". So geht es mit Enter weiter.
  useEffect(() => {
    if (result) nextRef.current?.focus();
  }, [result]);

  const say = () => speak(item.fr, "fr", settings.rate);

  const check = (giveUp = false) => {
    if (result) return;
    let correct: boolean;
    let near: "accents" | "typo" | undefined;
    if (hasChoices) {
      if (!giveUp && choice === null) return;
      correct = !giveUp && choice === item.de;
    } else {
      if (!giveUp && !norm(typed)) {
        inputRef.current?.focus();
        return;
      }
      const targets = targetsFor(item, pool);
      correct = !giveUp && isCorrect(typed, targets);
      if (!giveUp && !correct) {
        // Wer genau ein anderes Wort aus dem Set schreibt, hat sich nicht vertippt.
        const otherWord = pool.some((other) => other.id !== item.id && isCorrect(typed, [other.fr]));
        const close: Closeness = otherWord ? null : closeness(typed, targets);
        if (close === "accents" || close === "typo") {
          correct = true;
          near = close;
        } else if (close === "article" && !articleHint) {
          // Der Artikel gehört zum Wort. Dafür gibt es einen zweiten Versuch.
          setArticleHint(true);
          inputRef.current?.focus();
          return;
        }
      }
    }

    const card = getCard(props.progress, item.id, today);
    const isIntro = step.kind === "intro";
    // Eine neue Karte wird nur vorgestellt. Bewertet wird sie erst beim zweiten Mal.
    const next = isIntro ? introduce(card, today) : rate(card, correct, today);
    props.onProgress(item.id, next, isIntro && !card.seen);

    stats.current.items.add(item.id);
    if (isIntro && !card.seen) stats.current.introduced++;
    if (!isIntro && !correct) stats.current.again.add(item.id);
    if (isIntro || !correct) {
      setQueue((q) => [...q, makeStep(item, next, pool, settings.listen, Math.random)]);
    }

    // Tastatur schliessen, sonst verdeckt sie die Rückmeldung.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (step.kind === "type") say();
    setResult({ correct, near });
  };

  const advance = () => {
    const nextStep = queue[pos + 1];
    if (!nextStep) {
      const s = stats.current;
      props.onDone({ total: s.items.size, again: s.again.size, introduced: s.introduced });
      return;
    }
    // Der Ton muss noch im Klick starten, nicht erst nach dem Neuzeichnen.
    if (nextStep.kind !== "type") speak(itemsById.get(nextStep.itemId)!.fr, "fr", settings.rate);
    setPos(pos + 1);
    setTyped("");
    setChoice(null);
    setResult(null);
    setArticleHint(false);
  };

  const done = pos + (result ? 1 : 0);
  // Jede neue Karte kommt nach dem Vorstellen noch einmal. Das zählt der Balken gleich mit.
  const total = queue.length + queue.slice(done).filter((s) => s.kind === "intro").length;

  return (
    <main
      className={`screen session ${result ? "answered" : ""}`}
      style={result ? { paddingBottom: sheetHeight + 16 } : undefined}
    >
      <header className="session-top">
        <button className="icon-btn" aria-label="Üben beenden" onClick={props.onClose}>
          <Icon name="x" size={26} stroke={2.6} />
        </button>
        <div className="bar tall" role="img" aria-label={`Aufgabe ${pos + 1} von ${total}`}>
          <div className="bar-fill" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      </header>

      <div className="question">
        {step.kind === "intro" && <span className="chip">Neu</span>}
        <p className="prompt">{PROMPTS[step.kind]}</p>

        {step.kind === "type" && <h1 className="word">{item.de}</h1>}

        {step.kind === "intro" && (
          <div className="word-row">
            <button className="speak-btn" aria-label={`${item.fr} anhören`} onClick={say}>
              <Icon name="speaker" size={26} stroke={2.2} />
            </button>
            <h1 className="word" lang="fr">
              {item.fr}
            </h1>
          </div>
        )}

        {hidesWord && (
          <button className="speak-btn big" aria-label="Noch einmal anhören" onClick={say}>
            <Icon name="speaker" size={44} stroke={2} />
          </button>
        )}
      </div>

      {hasChoices ? (
        <div className="options" role="group" aria-label="Antworten">
          {step.options!.map((option) => {
            const state = !result
              ? choice === option
                ? "selected"
                : ""
              : option === item.de
                ? "right"
                : choice === option
                  ? "wrong"
                  : "dim";
            return (
              <button
                key={option}
                className={`option ${state}`}
                aria-pressed={choice === option}
                onClick={() => !result && setChoice(option)}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          className="answer"
          onSubmit={(event) => {
            event.preventDefault();
            check();
          }}
        >
          <label htmlFor="answer">Deine Antwort auf Französisch</label>
          <input
            key={pos}
            id="answer"
            ref={inputRef}
            className={result ? (result.near ? "near" : result.correct ? "right" : "wrong") : ""}
            type="text"
            lang="fr"
            value={typed}
            readOnly={result !== null}
            onChange={(event) => setTyped(event.target.value)}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            aria-describedby={articleHint && !result ? "answer-hint" : undefined}
          />
          {articleHint && !result && (
            <p id="answer-hint" className="answer-hint" role="status">
              Fast richtig. Es fehlt der Artikel.
            </p>
          )}
        </form>
      )}

      {!result && (
        <footer className={`actions ${hasChoices ? "pinned" : ""}`}>
          <button className={`btn primary ${hasChoices && choice === null ? "waiting" : ""}`} onClick={() => check()}>
            Prüfen
          </button>
          <button className="text-btn center" onClick={() => check(true)}>
            Weiß ich nicht
          </button>
        </footer>
      )}

      {result && (
        <footer
          ref={sheetRef}
          className={`sheet ${result.near ? "near" : result.correct ? "good" : "bad"}`}
          aria-live="polite"
        >
          <div className="sheet-body">
          <div className="sheet-title">
            <span className="sheet-mark">
              <Icon name={result.correct ? "check" : "x"} size={20} stroke={3.2} />
            </span>
            <h2>
              {result.near
                ? "Fast richtig"
                : result.correct
                  ? "Richtig"
                  : step.kind === "intro"
                    ? "Merk dir"
                    : "Noch nicht"}
            </h2>
          </div>
          {result.near && <p className="sheet-note">{NEAR_NOTES[result.near]}</p>}
          <div className="solution">
            <div className="solution-text">
              <div className="solution-fr" lang="fr">
                {item.fr}
              </div>
              <div className="solution-de">{item.de}</div>
              {item.n && <div className="solution-note">{item.n}</div>}
            </div>
            <button className="speak-btn small" aria-label={`${item.fr} anhören`} onClick={say}>
              <Icon name="speaker" size={24} stroke={2.2} />
            </button>
          </div>
          </div>
          <button ref={nextRef} className="btn primary" onClick={advance}>
            Weiter
          </button>
        </footer>
      )}
    </main>
  );
}
