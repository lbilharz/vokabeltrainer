import { type ChangeEvent, useRef, useState } from "react";
import type { RawItem } from "@shared/types";
import { Icon } from "../components/Icon";
import { type ExtractedItem, extractPhoto } from "../lib/account";
import { shrinkPhoto } from "../lib/image";

interface Props {
  onSave: (label: string, items: RawItem[]) => void;
  onClose: () => void;
}

interface Row extends ExtractedItem {
  key: number;
}

type Phase = "start" | "reading" | "review";

/** Neue Vokabeln: Foto aufnehmen, lesen lassen, prüfen, übernehmen. */
export function AddSet({ onSave, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("start");
  const [rows, setRows] = useState<Row[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [single, setSingle] = useState(false);
  const nextKey = useRef(0);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const read = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Leeren, damit dasselbe Bild noch einmal gewählt werden kann.
    event.target.value = "";
    if (!file) return;
    setError(null);
    setPhase("reading");
    try {
      const result = await extractPhoto(await shrinkPhoto(file));
      if (result.items.length === 0) {
        throw new Error("Auf dem Foto habe ich keine Vokabeln gefunden. Versuch es mit einem anderen Bild.");
      }
      if (result.readings === 1) setSingle(true);
      const added = result.items.map((item) => ({ ...item, key: nextKey.current++ }));
      setRows((prev) => [...prev, ...added]);
      // Vorschlag für den Namen: die Überschrift von der Seite, wenn es eine gab.
      setLabel((prev) => prev || result.items.find((item) => item.c)?.c || "");
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Das hat nicht geklappt. Versuch es noch einmal.");
      setPhase(rows.length > 0 ? "review" : "start");
    }
  };

  const change = (key: number, field: "fr" | "de", value: string) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value, check: false } : row)));
  const remove = (key: number) => setRows((prev) => prev.filter((row) => row.key !== key));

  const valid = rows.filter((row) => row.fr.trim() && row.de.trim());
  const toCheck = rows.filter((row) => row.check).length;

  const save = () => {
    const name = label.trim() || "Neue Vokabeln";
    if (valid.length === 0) return;
    onSave(
      name,
      valid.map((row) => ({
        c: row.c?.trim() || name,
        fr: row.fr.trim(),
        de: row.de.trim(),
        ...(row.n?.trim() ? { n: row.n.trim() } : {}),
      })),
    );
  };

  const inputs = (
    <>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={read} />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={read} />
    </>
  );

  if (phase === "reading") {
    return (
      <main className="screen center" aria-busy="true">
        <div className="reading-mark" aria-hidden="true">
          <Icon name="list" size={48} stroke={2} />
        </div>
        <h1>Ich lese die Seite</h1>
        <p className="lead">Das dauert etwa eine halbe Minute. Ich lese sie zur Sicherheit zweimal.</p>
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
        {single && toCheck === 0 && (
          <p className="answer-hint" role="status">
            Diesmal fehlt die zweite Lesung. Schau bitte besonders genau hin.
          </p>
        )}

        <div className="form-field">
          <label htmlFor="setname">Name des Sets</label>
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
                {row.check && <span className="row-flag">Bitte prüfen</span>}
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
          <button className="btn quiet" onClick={() => cameraInput.current?.click()}>
            Noch eine Seite fotografieren
          </button>
          <button className={`btn primary ${valid.length === 0 ? "waiting" : ""}`} onClick={save}>
            {valid.length === 1 ? "1 Vokabel übernehmen" : `${valid.length} Vokabeln übernehmen`}
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
          Scan oder Bild auswählen
        </button>
      </div>
    </main>
  );
}
