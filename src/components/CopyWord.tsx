import { useMemo, useRef, useState } from "react";
import type { Foreign } from "@shared/types";
import { accentBase, advanceCopy, copySlots, gapSlots, skipGiven } from "@shared/copy";

interface Props {
  /** Der Text zum Schreiben. */
  target: string;
  /** Die Sprache des Textes. Daran richten sich Tastatur und Vorlesen aus. */
  lang: Foreign;
  /**
   * copy: das ganze Wort steht da und wird abgeschrieben.
   * gap: nur die Anfangsbuchstaben stehen da, das Kind füllt die Lücken.
   */
  mode?: "copy" | "gap";
  /** missed: an so vielen Stellen kam zuerst ein falscher Buchstabe. */
  onDone: (missed: number) => void;
}

/**
 * Schreiben, Buchstabe für Buchstabe.
 *
 * Beim Abschreiben steht das Wort grau da. Jeder richtig getippte Buchstabe wird dunkel.
 * Beim Lückenwort stehen nur die Anfangsbuchstaben da.
 * Ein falscher Buchstabe wird nicht angenommen. Die Stelle wackelt, und ein Hinweis erscheint.
 * Das Eingabefeld liegt unsichtbar über dem Wort. Es ist nur für die Tastatur da.
 */
export function CopyWord({ target, lang, mode = "copy", onDone }: Props) {
  const gap = mode === "gap";
  const slots = useMemo(() => (gap ? gapSlots(target) : copySlots(target)), [target, gap]);
  const missed = useRef(new Set<number>());
  const [done, setDone] = useState(() => skipGiven(slots, 0));
  const doneRef = useRef(done);
  /** Der letzte falsche Buchstabe. count zählt die Fehlversuche an derselben Stelle. */
  const [miss, setMiss] = useState<{ at: number; ch: string; count: number } | null>(null);
  const [raw, setRaw] = useState("");
  const composing = useRef(false);
  const justComposed = useRef({ text: "", time: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const take = (input: string) => {
    if (!input || doneRef.current >= slots.length) return;
    const step = advanceCopy(slots, doneRef.current, input);
    doneRef.current = step.done;
    setDone(step.done);
    const wrong = step.wrong;
    if (wrong !== null) missed.current.add(step.done);
    setMiss((prev) =>
      wrong === null ? null : { at: step.done, ch: wrong, count: prev && prev.at === step.done ? prev.count + 1 : 1 },
    );
    if (step.done >= slots.length) onDone(missed.current.size);
  };

  const expected = slots[done]?.ch ?? "";
  const base = miss && expected ? accentBase(expected, miss.ch) : null;
  const special = /[^\x00-\x7f]/.test(expected);
  // Beim Lückenwort verrät der Hinweis den Buchstaben nicht.
  const hint = !miss
    ? null
    : gap
      ? base
        ? `Der Buchstabe stimmt, aber es fehlt ein Akzent. Halte die Taste ${base} gedrückt.`
        : "Das passt noch nicht. Probier einen anderen Buchstaben."
      : base
        ? `Hier steht ein ${expected}. Halte die Taste ${base} gedrückt.`
        : expected === " "
          ? "Schau genau hin. Hier kommt eine Lücke."
          : `Schau genau hin. Als Nächstes kommt ${expected}.`;
  // Nach zwei Fehlversuchen hilft ein Knopf weiter. So bleibt niemand hängen.
  const help = !miss || miss.count < 2 ? null : gap ? "Buchstabe zeigen" : special ? `${expected} einsetzen` : null;

  return (
    <div className="copy">
      <div className="copy-field">
        <div className="copy-word" lang={lang} aria-hidden="true">
          {slots.map((slot, index) => (
            <span
              // Der Schlüssel wechselt mit jedem Fehlversuch. So startet das Wackeln neu.
              key={index === done && miss ? `${index}-${miss.count}` : index}
              className={[
                index < done ? "done" : index === done ? (miss ? "next miss" : "next") : "todo",
                slot.hidden && index >= done ? "blank" : "",
                gap && slot.given ? "given" : "",
              ].join(" ")}
            >
              {/* Eine offene Lücke enthält den Buchstaben nicht, auch nicht unsichtbar. */}
              {slot.hidden && index >= done ? "\u00a0" : slot.ch}
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          className="copy-input"
          type="text"
          lang={lang}
          value={raw}
          aria-label={gap ? "Fülle die Lücken" : `Schreib ab: ${target}`}
          aria-describedby={hint ? "copy-hint" : undefined}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            // Akzente über eine Vortaste (^ dann e) kommen als ein Stück an.
            composing.current = false;
            const text = event.currentTarget.value;
            justComposed.current = { text, time: Date.now() };
            setRaw("");
            take(text);
          }}
          onChange={(event) => {
            const text = event.target.value;
            if (composing.current) {
              setRaw(text);
              return;
            }
            setRaw("");
            // Manche Browser melden denselben Text nach der Vortaste ein zweites Mal.
            const last = justComposed.current;
            if (text === last.text && Date.now() - last.time < 50) return;
            take(text);
          }}
        />
      </div>
      {hint && (
        <p id="copy-hint" className="answer-hint" role="status">
          {hint}
        </p>
      )}
      {help && (
        <button
          type="button"
          className="btn quiet copy-insert"
          onClick={() => {
            take(expected);
            inputRef.current?.focus();
          }}
        >
          {help}
        </button>
      )}
    </div>
  );
}
