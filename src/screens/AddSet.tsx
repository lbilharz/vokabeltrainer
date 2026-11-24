import { type ChangeEvent, useRef, useState } from "react";
import { defaultLessonName } from "@shared/dates";
import type { RawItem } from "@shared/types";
import { Icon } from "../components/Icon";
import { type CheckKind, type ExtractedItem, checkItems, extractPhoto } from "../lib/account";
import { shrinkPhoto } from "../lib/image";
import { LIMITS } from "@shared/limits";

interface Props {
  onSave: (label: string, items: RawItem[]) => void;
  onClose: () => void;
}

interface Row extends ExtractedItem {
  key: number;
  /** Warum die Zeile gelb ist. Steht über dem Wort. */
  reason?: string;
}

const DIFFERENT_READINGS = "Die zwei Lesungen waren verschieden";

const CHECK_TEXT: Record<CheckKind, string> = {
  schreibweise: "Stimmt die Schreibweise?",
  passt_nicht: "Passt die Übersetzung zum Wort?",
  verschmolzen: "Sind das zwei Einträge?",
};

type Phase = "start" | "reading" | "review";

/** Was die App während des Lesens gerade weiss. */
interface Live {
  stage: "sending" | "looking" | "reading" | "comparing";
  /** Anteil des Fotos, der schon gesendet ist. 0 bis 1. */
  sent: number;
  words: string[];
}

const STAGE_TEXT: Record<Live["stage"], string> = {
  sending: "Das Foto wird gesendet …",
  looking: "Das Foto ist angekommen. Ich schaue mir die Seite an …",
  reading: "Ich lese die Wörter …",
  comparing: "Ich lese zur Sicherheit ein zweites Mal und vergleiche …",
};

const MAX_AT_ONCE = 6;

/** Neue Vokabeln: Foto aufnehmen, lesen lassen, prüfen, übernehmen. */
export function AddSet({ onSave, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("start");
  const [rows, setRows] = useState<Row[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [single, setSingle] = useState(false);
  /** Bei mehreren Bildern auf einmal: welches gerade gelesen wird. */
  const [progress, setProgress] = useState({ current: 1, total: 1 });
  const [live, setLive] = useState<Live>({ stage: "sending", sent: 0, words: [] });
  /** Wie viele Gegenproben gerade laufen. */
  const [checking, setChecking] = useState(0);

  /**
   * Gegenprobe im Hintergrund: ein zweites Modell prüft, ob die Wortpaare zusammenpassen.
   * Sie markiert nur. Schlägt sie fehl, bleibt die Liste, wie sie ist.
   */
  const runCheck = (page: Row[]) => {
    setChecking((n) => n + 1);
    checkItems(page.map((row) => ({ fr: row.fr, de: row.de })))
      .then((flags) => {
        const byKey = new Map(flags.map((flag) => [page[flag.i]?.key, flag.kind]));
        setRows((prev) =>
          prev.map((row) => {
            const kind = byKey.get(row.key);
            const sent = page.find((p) => p.key === row.key);
            // Hat das Kind die Zeile inzwischen geändert, gilt die Gegenprobe nicht mehr.
            if (!kind || !sent || sent.fr !== row.fr || sent.de !== row.de) return row;
            return { ...row, check: true, reason: row.reason ?? CHECK_TEXT[kind] };
          }),
        );
      })
      .catch(() => {
        // Ohne Gegenprobe bleibt die doppelte Lesung als Sicherung.
      })
      .finally(() => setChecking((n) => n - 1));
  };
  const nextKey = useRef(0);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const read = async (event: ChangeEvent<HTMLInputElement>) => {
    // Mehr als sechs Seiten auf einmal dauern zu lange. Der Rest geht im nächsten Durchgang.
    const files = [...(event.target.files ?? [])].slice(0, MAX_AT_ONCE);
    // Leeren, damit dieselben Bilder noch einmal gewählt werden können.
    event.target.value = "";
    if (files.length === 0) return;
    setError(null);
    setPhase("reading");
    let added = 0;
    let failure: string | null = null;
    // Eine Seite nach der anderen. So bleibt die Reihenfolge der Bilder erhalten.
    for (const [index, file] of files.entries()) {
      setProgress({ current: index + 1, total: files.length });
      setLive({ stage: "sending", sent: 0, words: [] });
      try {
        const result = await extractPhoto(await shrinkPhoto(file), (event) => {
          setLive((prev) => {
            if (event.type === "sending") {
              // Ist alles gesendet, wartet die App auf die Bestätigung des Servers.
              return prev.stage === "sending" ? { ...prev, sent: event.fraction } : prev;
            }
            if (event.type === "start") return { ...prev, stage: "looking", sent: 1 };
            if (event.type === "word") return { ...prev, stage: "reading", words: [...prev.words, event.fr] };
            if (event.type === "compare") return { ...prev, stage: "comparing" };
            return prev;
          });
        });
        if (result.items.length === 0) {
          throw new Error("Auf dem Foto habe ich keine Vokabeln gefunden. Versuch es mit einem anderen Bild.");
        }
        if (result.readings === 1) setSingle(true);
        const rowsOfPage: Row[] = result.items.map((item) => ({
          ...item,
          key: nextKey.current++,
          reason: item.check ? DIFFERENT_READINGS : undefined,
        }));
        setRows((prev) => [...prev, ...rowsOfPage]);
        runCheck(rowsOfPage);
        added += rowsOfPage.length;
        // Vorschlag für den Namen: die Überschrift von der Seite, wenn es eine gab.
        setLabel((prev) => prev || result.items.find((item) => item.c)?.c || "");
      } catch (err) {
        const reason = err instanceof Error && err.message ? err.message : "Das hat nicht geklappt. Versuch es noch einmal.";
        failure = files.length > 1 ? `Bild ${index + 1} von ${files.length}: ${reason}` : reason;
      }
    }
    if (failure) setError(failure);
    setPhase(added > 0 || rows.length > 0 ? "review" : "start");
  };

  const change = (key: number, field: "fr" | "de", value: string) =>
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: value, check: false, reason: undefined } : row)),
    );
  const remove = (key: number) => setRows((prev) => prev.filter((row) => row.key !== key));

  const valid = rows.filter((row) => row.fr.trim() && row.de.trim());
  const toCheck = rows.filter((row) => row.check).length;

  // Der Abgleich nimmt keine größere Lektion an. Was darüber liegt, wird nicht übernommen.
  const kept = valid.slice(0, LIMITS.MAX_ITEMS_PER_SET);

  const save = () => {
    const name = label.trim().slice(0, LIMITS.MAX_LABEL_CHARS).trim() || defaultLessonName(Date.now());
    if (kept.length === 0) return;
    const cut = (text: string | null | undefined, max: number) => (text ?? "").trim().slice(0, max).trim();
    onSave(
      name,
      kept.map((row) => {
        const note = cut(row.n, LIMITS.MAX_NOTE_CHARS);
        return {
          // Ohne Überschrift bleibt der Abschnitt leer. Der Name der Lektion steht nur am Set.
          c: cut(row.c, LIMITS.MAX_HEADING_CHARS),
          fr: cut(row.fr, LIMITS.MAX_WORD_CHARS),
          de: cut(row.de, LIMITS.MAX_WORD_CHARS),
          ...(note ? { n: note } : {}),
        };
      }),
    );
  };

  const inputs = (
    <>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={read} />
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={read} />
    </>
  );

  if (phase === "reading") {
    const found = live.words.length;
    return (
      <main className="screen reading" aria-busy="true">
        <div className="reading-mark" aria-hidden="true">
          <Icon name="list" size={40} stroke={2} />
        </div>
        <h1>{progress.total > 1 ? `Ich lese Seite ${progress.current} von ${progress.total}` : "Ich lese die Seite"}</h1>
        <p className="lead" role="status">
          {STAGE_TEXT[live.stage]}
        </p>
        {live.stage === "sending" && (
          <div
            className="bar tall upload"
            role="progressbar"
            aria-label="Foto wird gesendet"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(live.sent * 100)}
          >
            <div className="bar-fill" style={{ width: `${Math.round(live.sent * 100)}%` }} />
          </div>
        )}
        {found > 0 && (
          <>
            <p className="reading-count">{found === 1 ? "1 Wort gefunden" : `${found} Wörter gefunden`}</p>
            {/* Die letzten Wörter, das neueste unten. Reine Zier, der Zähler sagt dasselbe. */}
            <ul className="reading-words" aria-hidden="true">
              {live.words.slice(-5).map((word, index, shown) => (
                <li key={`${found - shown.length + index}`} lang="fr">
                  {word}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    );
  }

  if (phase === "review") {
    return (
      <main className="screen addset">
        {inputs}
        <header className="topbar left">
          <button className="icon-btn" aria-label="Abbrechen" onClick={onClose}>
            <Icon name="x" size={26} stroke={2.6} />
          </button>
          <h1>Stimmt alles?</h1>
        </header>

        <p className="lead small">
          {rows.length === 1 ? "1 Vokabel gelesen." : `${rows.length} Vokabeln gelesen.`} Vergleiche sie mit deinem Buch.
          Du kannst jedes Wort ändern.
        </p>

        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {toCheck > 0 && (
          <p className="answer-hint" role="status">
            {toCheck === 1 ? "1 Zeile ist gelb markiert." : `${toCheck} Zeilen sind gelb markiert.`} Dort war ich mir
            nicht sicher.
          </p>
        )}
        {checking > 0 && (
          <p className="checking" role="status">
            Ich prüfe noch, ob alle Wörter zusammenpassen …
          </p>
        )}
        {single && toCheck === 0 && (
          <p className="answer-hint" role="status">
            Diesmal fehlt die zweite Lesung. Schau bitte besonders genau hin.
          </p>
        )}

        <div className="form-field">
          <label htmlFor="setname">Name der Lektion</label>
          <input
            id="setname"
            type="text"
            value={label}
            maxLength={60}
            placeholder="Unité 2, Volet 3"
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>

        <ul className="rows">
          {rows.map((row, index) => (
            <li key={row.key} className={row.check ? "row check" : "row"}>
              <div className="row-fields">
                {row.check && <span className="row-flag">{row.reason ?? "Bitte prüfen"}</span>}
                <input
                  className="row-fr"
                  type="text"
                  lang="fr"
                  value={row.fr}
                  aria-label={`Französisch, Zeile ${index + 1}`}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => change(row.key, "fr", event.target.value)}
                />
                <input
                  className="row-de"
                  type="text"
                  value={row.de}
                  aria-label={`Deutsch, Zeile ${index + 1}`}
                  onChange={(event) => change(row.key, "de", event.target.value)}
                />
                {row.n && <span className="row-note">{row.n}</span>}
              </div>
              <button className="icon-btn" aria-label={`Zeile ${index + 1} entfernen`} onClick={() => remove(row.key)}>
                <Icon name="x" size={20} />
              </button>
            </li>
          ))}
        </ul>

        <div className="addset-actions">
          <div className="account-actions">
            <button className="btn quiet" onClick={() => cameraInput.current?.click()}>
              Noch ein Foto
            </button>
            <button className="btn quiet" onClick={() => fileInput.current?.click()}>
              Bilder wählen
            </button>
          </div>
          {valid.length > kept.length && (
            <p className="answer-hint" role="status">
              Eine Lektion fasst höchstens {LIMITS.MAX_ITEMS_PER_SET} Vokabeln. Die übrigen {valid.length - kept.length} werden
              nicht übernommen. Lege dafür eine zweite Lektion an.
            </p>
          )}
          <button className={`btn primary ${kept.length === 0 ? "waiting" : ""}`} onClick={save}>
            {kept.length === 1 ? "1 Vokabel übernehmen" : `${kept.length} Vokabeln übernehmen`}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen addset">
      {inputs}
      <header className="topbar left">
        <button className="icon-btn" aria-label="Zurück zum Lernpfad" onClick={onClose}>
          <Icon name="x" size={26} stroke={2.6} />
        </button>
        <h1>Neue Vokabeln</h1>
      </header>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      <div className="photo-frame">
        <div className="photo-page" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className={i % 2 === 0 ? "dark" : ""} />
          ))}
        </div>
        <p>Fotografiere die Vokabelseite aus deinem Buch</p>
      </div>

      <ul className="tips">
        <li>
          <Icon name="check" size={20} stroke={3} />
          Die ganze Seite ist im Bild
        </li>
        <li>
          <Icon name="check" size={20} stroke={3} />
          Gerade von oben, nicht schräg
        </li>
        <li>
          <Icon name="check" size={20} stroke={3} />
          Helles Licht, kein Schatten
        </li>
      </ul>

      <div className="addset-actions">
        <button className="btn primary" onClick={() => cameraInput.current?.click()}>
          <Icon name="camera" size={24} stroke={2.2} />
          Foto aufnehmen
        </button>
        <button className="btn quiet tall" onClick={() => fileInput.current?.click()}>
          <Icon name="image" size={24} stroke={2.2} />
          Scans oder Bilder auswählen
        </button>
      </div>
    </main>
  );
}
