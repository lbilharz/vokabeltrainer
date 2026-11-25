import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WeakReason } from "@shared/focus";
import { type Step, makeStep, targetsFor } from "@shared/session";
import { closestOf, copySlots, copyTarget, gapSlots, markDiff, rateGaps } from "@shared/copy";
import { getCard, introduce, rate } from "@shared/srs";
import { justMastered, streakAfter, streakLine } from "@shared/cheer";
import { type Near, ruleTyped } from "@shared/answer";
import { LIMITS } from "@shared/limits";
import { norm } from "@shared/text";
import type { CardState, Item, Progress } from "@shared/types";
import { CopyWord } from "../components/CopyWord";
import { Icon } from "../components/Icon";
import { judgeAnswer } from "../lib/account";
import { speak } from "../lib/audio";
import type { Settings } from "../lib/store";
import type { SessionStats } from "./Done";
import "../celebrate.css";

interface Props {
  steps: Step[];
  itemsById: Map<string, Item>;
  poolFor: (item: Item) => Item[];
  progress: Progress;
  today: number;
  settings: Settings;
  onProgress: (itemId: string, card: CardState, introduced: boolean) => void;
  /** Meldet jede geschriebene Antwort (Schreib-Aufgaben, kein Kennenlernen, keine Wahl). Für den Test-Fokus. */
  onWritten: (itemId: string, kind: Step["kind"], correct: boolean) => void;
  /** true: Gesehene Wörter werden nur frei geschrieben, auch nach einem Fehler (Generalprobe). */
  freeWriting?: boolean;
  onDone: (stats: SessionStats) => void;
  onClose: () => void;
}

/**
 * Was bei einer fast richtigen Antwort in der Rückmeldung steht.
 * Akzente und Tippfehler zählen als richtig. Die Karte geht weiter.
 */
const NEAR_NOTES: Record<Near, string> = {
  accents: "Achte beim nächsten Mal auf die Akzente. So schreibt man es:",
  typo: "Achte beim nächsten Mal auf die Schreibweise. So schreibt man es:",
};

/** Der Hinweis auf eine andere Form, wenn es keinen genaueren gibt. */
const FORM_HINT = "Fast. Das Wort stimmt, aber die Form nicht. Schau noch einmal genau auf das Deutsche.";

const PROMPTS: Record<Step["kind"], string> = {
  intro: "Was heißt das auf Deutsch?",
  gap: "Wie heißt das auf Französisch? Fülle die Lücken.",
  type: "Wie heißt das auf Französisch?",
  listenChoice: "Hör zu. Was heißt das auf Deutsch?",
  listenType: "Hör zu. Schreibe, was du hörst.",
};

function closeKeyboard(): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

export function Session(props: Props) {
  const { itemsById, today, settings } = props;
  const [queue, setQueue] = useState(props.steps);
  const [pos, setPos] = useState(0);
  const [typed, setTyped] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  /**
   * near: richtig bis auf Akzente oder einen Tippfehler. Zählt als richtig, mit Hinweis.
   * also: der Schiedsrichter lässt die Antwort gelten ("Auch richtig"). Sieht aus wie near.
   * note: ein Satz des Schiedsrichters für die Rückmeldung.
   */
  const [result, setResult] = useState<{
    correct: boolean;
    near?: Near;
    also?: boolean;
    note?: string;
    /** Kurze Zeile bei einer Serie (3, 5, 10 ...). */
    streak?: string;
    /** Diese Antwort hat das Wort auf "sitzt" gebracht. */
    mastered?: boolean;
  } | null>(null);
  /** true, sobald der Hinweis auf den fehlenden Artikel gezeigt wurde. Danach zählt der Versuch. */
  const [articleHint, setArticleHint] = useState(false);
  /** Der Hinweis "richtiges Wort, andere Form". Er kommt aus den Regeln oder vom Schiedsrichter. Nur einmal je Karte. */
  const [formHint, setFormHint] = useState<string | null>(null);
  /** true, solange der Schiedsrichter gefragt wird. Die Knöpfe sind dann aus. */
  const [judging, setJudging] = useState(false);
  /** Wird beim Weitergehen und Schließen erhöht. So landet eine späte Antwort nicht auf der falschen Karte. */
  const judgeRound = useRef(0);
  useEffect(() => {
    return () => {
      judgeRound.current++;
    };
  }, []);
  /**
   * true, solange das Kind das Wort abschreibt. Das kommt nach dem Kennenlernen und nach einem Fehler.
   * Erst danach erscheint die Rückmeldung mit "Weiter". So lässt sich die Lösung nicht überklicken.
   */
  const [copying, setCopying] = useState(false);
  const stats = useRef({
    items: new Set<string>(),
    again: new Set<string>(),
    introduced: 0,
    /** Das erste Problem je Wort. Die Reihenfolge der Einträge bleibt erhalten. */
    weak: new Map<string, WeakReason>(),
    /** Serie richtiger Antworten im ersten Versuch, aktuell und beste der Runde. */
    streak: 0,
    bestStreak: 0,
    /** Wörter, die in dieser Runde auf "sitzt" gekommen sind. */
    mastered: new Set<string>(),
  });
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
    setSheetHeight(result && !copying ? (sheetRef.current?.offsetHeight ?? 0) : 0);
  }, [result, copying, pos]);

  // Nach dem Prüfen liegt der Fokus auf "Weiter". So geht es mit Enter weiter.
  useEffect(() => {
    if (result && !copying) nextRef.current?.focus();
  }, [result, copying]);

  const say = () => speak(item.fr, "fr", settings.rate);
  const copyText = copyTarget(item.fr);
  const sheetOpen = result !== null && !copying;
  const hint = formHint ?? (articleHint ? "Fast richtig. Es fehlt der Artikel." : null);
  // Bei "Fast richtig" zeigt die Lösung die Stellen, die nicht stimmten.
  const nearMarks =
    result?.near && step.kind !== "gap" ? markDiff(typed, closestOf(typed, targetsFor(item, pool))) : null;

  const check = (giveUp = false) => {
    if (result || judging) return;
    if (hasChoices) {
      if (!giveUp && choice === null) return;
      // Nach dem Kennenlernen schreibt das Kind das Wort einmal ab.
      finish(!giveUp && choice === item.de, undefined, step.kind === "intro");
      return;
    }
    if (giveUp) {
      finish(false, undefined, true);
      return;
    }

    const ruling = ruleTyped(typed, item, pool, {
      kind: step.kind,
      articleHinted: articleHint,
      formHinted: formHint !== null,
    });
    if (ruling.type === "empty") {
      inputRef.current?.focus();
    } else if (ruling.type === "correct") {
      finish(true, ruling.near, false);
    } else if (ruling.type === "articleHint") {
      setArticleHint(true);
      inputRef.current?.focus();
    } else if (ruling.type === "formHint") {
      setFormHint(ruling.other ? `Das ist „${ruling.other.de}“. Hier ist eine andere Form gefragt.` : FORM_HINT);
      inputRef.current?.focus();
    } else if (ruling.askJudge && canJudge()) {
      askJudge();
    } else {
      // Nach einer falschen geschriebenen Antwort schreibt das Kind das Wort ab.
      finish(false, undefined, true);
    }
  };

  /** Der Schiedsrichter ist ein Netzaufruf. Ohne Netz und für lange Texte bleibt es bei den Regeln. */
  const canJudge = () =>
    navigator.onLine !== false &&
    item.fr.trim().length <= LIMITS.MAX_WORD_CHARS &&
    item.de.length <= LIMITS.MAX_WORD_CHARS &&
    typed.trim().length <= LIMITS.MAX_ANSWER_CHARS;

  const askJudge = () => {
    const round = ++judgeRound.current;
    setJudging(true);
    void judgeAnswer(item.de, item.fr.trim(), typed.trim()).then((judgement) => {
      if (round !== judgeRound.current) return;
      setJudging(false);
      if (judgement.verdict === "correct") {
        finish(true, undefined, false, { also: true, note: judgement.note });
      } else if (judgement.verdict === "form" && formHint === null) {
        setFormHint(judgement.note || FORM_HINT);
        inputRef.current?.focus();
      } else {
        finish(false, undefined, true, { note: judgement.note });
      }
    });
  };

  /** Das Lückenwort ist gefüllt. missed zählt die Lücken mit einem Fehlversuch. */
  const gapDone = (missed: number) => {
    if (result) return;
    const rated = rateGaps(gapSlots(copyText), missed);
    // Das Wort ist schon Buchstabe für Buchstabe geschrieben. Abschreiben kommt hier nicht noch einmal.
    finish(rated.correct, rated.near ? "typo" : undefined, false);
  };

  /** Trägt das Ergebnis ein und zeigt die Rückmeldung. copyAfter: vorher das Wort abschreiben lassen. */
  const finish = (
    correct: boolean,
    near: Near | undefined,
    copyAfter: boolean,
    judged?: { also?: boolean; note?: string },
  ) => {
    const card = getCard(props.progress, item.id, today);
    const isIntro = step.kind === "intro";
    // Eine neue Karte wird nur vorgestellt. Bewertet wird sie erst beim zweiten Mal.
    const next = isIntro ? introduce(card, today) : rate(card, correct, today);
    props.onProgress(item.id, next, isIntro && !card.seen);

    stats.current.items.add(item.id);
    if (isIntro && !card.seen) stats.current.introduced++;
    if (!isIntro && !correct) stats.current.again.add(item.id);
    if (!isIntro) {
      // Warum das Wort wackelt: nicht gewusst, Artikel vergessen, Akzent oder Schreibweise.
      const reason: WeakReason | null = !correct ? "unknown" : articleHint ? "article" : (near ?? null);
      if (reason && !stats.current.weak.has(item.id)) stats.current.weak.set(item.id, reason);
      props.onWritten(item.id, step.kind, correct);
    }
    if (isIntro || !correct) {
      setQueue((q) => [...q, makeStep(item, next, pool, settings.listen, Math.random, props.freeWriting)]);
    }

    // Abschreiben: nach dem Kennenlernen immer, sonst nach einer falschen geschriebenen Antwort.
    const needsCopy = copyAfter && copySlots(copyText).some((slot) => !slot.given);
    // Ohne Abschreiben die Tastatur schliessen, sonst verdeckt sie die Rückmeldung.
    if (!needsCopy) closeKeyboard();
    if (step.kind === "type" || step.kind === "gap") say();

    // Kleine Freuden: Serie und "sitzt jetzt". Die Bewertung selbst bleibt unberührt.
    // Mit Hinweis (Artikel, andere Form) war es nicht der erste Versuch.
    const firstTry = correct && !articleHint && formHint === null;
    const st = stats.current;
    st.streak = streakAfter(st.streak, firstTry, !isIntro);
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    const streak = firstTry && !isIntro ? (streakLine(st.streak) ?? undefined) : undefined;
    const mastered = !isIntro && justMastered(card, next);
    if (mastered) st.mastered.add(item.id);

    setCopying(needsCopy);
    setResult({ correct, near, also: judged?.also, note: judged?.note, streak, mastered });
  };

  const copied = () => {
    closeKeyboard();
    setCopying(false);
  };

  const advance = () => {
    const nextStep = queue[pos + 1];
    if (!nextStep) {
      const s = stats.current;
      props.onDone({
        total: s.items.size,
        again: s.again.size,
        introduced: s.introduced,
        weak: [...s.weak].map(([itemId, reason]) => ({ itemId, reason })),
        bestStreak: s.bestStreak,
        mastered: s.mastered.size,
      });
      return;
    }
    // Der Ton muss noch im Klick starten, nicht erst nach dem Neuzeichnen.
    if (nextStep.kind !== "type") speak(itemsById.get(nextStep.itemId)!.fr, "fr", settings.rate);
    setPos(pos + 1);
    setTyped("");
    setChoice(null);
    setResult(null);
    setArticleHint(false);
    setFormHint(null);
    judgeRound.current++;
    setJudging(false);
    setCopying(false);
  };

  /** Farbe der Rückmeldung. Fast richtig und "Auch richtig" sehen gleich aus. */
  const tone = !result ? "" : result.near || result.also ? "near" : result.correct ? "good" : "bad";
  /** Die Überschrift ohne die zwei Sonderfälle "Auch richtig" und "Fast richtig". */
  const plainTitle = result?.correct ? "Richtig" : step.kind === "intro" ? "Merk dir" : "Noch nicht";

  const done = pos + (result ? 1 : 0);
  // Jede neue Karte kommt nach dem Vorstellen noch einmal. Das zählt der Balken gleich mit.
  const total = queue.length + queue.slice(done).filter((s) => s.kind === "intro").length;

  return (
    <main
      className={`screen session ${sheetOpen ? "answered" : ""}`}
      style={sheetOpen ? { paddingBottom: sheetHeight + 16 } : undefined}
    >
      <header className="session-top">
        <button className="icon-btn" aria-label="Üben beenden" onClick={props.onClose}>
          <Icon name="x" size={26} stroke={2.6} />
        </button>
        <div className="bar tall" role="img" aria-label={`Aufgabe ${pos + 1} von ${total}`}>
          <div className="bar-fill" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      </header>

      {result && copying && (
        <div className="question">
          <span className={`chip ${result.correct ? "good" : ""}`}>
            {plainTitle}
          </span>
          <p className="prompt">Schreib es einmal ab.</p>
          <CopyWord key={pos} target={copyText} onDone={copied} />
          <p className="copy-de">{item.de}</p>
          {!hasChoices && norm(typed) && (
            <p className="copy-yours">
              Du hast geschrieben: <s lang="fr">{typed}</s>
            </p>
          )}
        </div>
      )}

      {!copying && (
      <div className="question">
        {step.kind === "intro" && <span className="chip">Neu</span>}
        <p className="prompt">{PROMPTS[step.kind]}</p>

        {(step.kind === "type" || step.kind === "gap") && <h1 className="word">{item.de}</h1>}

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
      )}

      {copying ? null : step.kind === "gap" ? (
        <div className="answer">
          {result ? (
            // Nach der Aufgabe steht das ganze Wort da. Das Feld nimmt nichts mehr an.
            <div className={`copy-field solved ${result.near ? "near" : result.correct ? "right" : "wrong"}`}>
              <div className="copy-word" lang="fr">
                {copyText}
              </div>
            </div>
          ) : (
            <CopyWord key={pos} mode="gap" target={copyText} onDone={gapDone} />
          )}
        </div>
      ) : hasChoices ? (
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
            className={result ? (result.near || result.also ? "near" : result.correct ? "right" : "wrong") : ""}
            type="text"
            lang="fr"
            value={typed}
            readOnly={result !== null || judging}
            onChange={(event) => setTyped(event.target.value)}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            aria-describedby={hint && !result ? "answer-hint" : undefined}
          />
          {hint && !result && (
            <p id="answer-hint" className="answer-hint" role="status">
              {hint}
            </p>
          )}
        </form>
      )}

      {!result && (
        <footer className={`actions ${hasChoices ? "pinned" : ""}`}>
          {step.kind !== "gap" && (
            <button
              className={`btn primary ${(hasChoices && choice === null) || judging ? "waiting" : ""}`}
              disabled={judging}
              onClick={() => check()}
            >
              {judging ? "Ich schaue genauer hin …" : "Prüfen"}
            </button>
          )}
          <button className="text-btn center" disabled={judging} onClick={() => check(true)}>
            Weiß ich nicht
          </button>
        </footer>
      )}

      {sheetOpen && result && (
        <footer
          ref={sheetRef}
          className={`sheet ${tone}`}
          aria-live="polite"
        >
          <div className="sheet-body">
          <div className="sheet-title">
            <span className={`sheet-mark ${result.correct ? "cheer-pop" : ""}`}>
              <Icon name={result.correct ? "check" : "x"} size={20} stroke={3.2} />
            </span>
            <h2>{result.also ? "Auch richtig" : result.near ? "Fast richtig" : plainTitle}</h2>
            {result.streak && <span className="cheer-chip">{result.streak}</span>}
          </div>
          {result.mastered && (
            <p className="cheer-line">
              <Icon name="check" size={16} stroke={3} />
              Das sitzt jetzt.
            </p>
          )}
          {result.note && <p className="sheet-note">{result.note}</p>}
          {result.near &&
            (step.kind === "gap" ? (
              <p className="sheet-note">Eine Stelle hat nicht gleich gepasst. So schreibt man es:</p>
            ) : (
              <p className="sheet-note">
                Deine Antwort: <span lang="fr">{typed.trim()}</span>. {NEAR_NOTES[result.near]}
              </p>
            ))}
          <div className="solution">
            <div className="solution-text">
              <div className={`solution-fr ${result.mastered ? "cheer-set" : ""}`} lang="fr">
                {nearMarks
                  ? nearMarks.map((mark, index) => (mark.miss ? <mark key={index}>{mark.ch}</mark> : mark.ch))
                  : item.fr}
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
