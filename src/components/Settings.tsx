import type { Settings as SettingsData } from "../lib/store";
import { Icon } from "./Icon";

interface Props {
  settings: SettingsData;
  setLabel: string;
  onChange: (settings: SettingsData) => void;
  onReset: () => void;
  onClose: () => void;
}

const RATES: { label: string; value: number }[] = [
  { label: "Langsam", value: 0.65 },
  { label: "Normal", value: 0.8 },
  { label: "Schnell", value: 1 },
];

export function Settings({ settings, setLabel, onChange, onReset, onClose }: Props) {
  // Ein Tempo aus der alten App liegt vielleicht zwischen den drei Stufen.
  const nearest = RATES.reduce((best, r) =>
    Math.abs(r.value - settings.rate) < Math.abs(best.value - settings.rate) ? r : best,
  );

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <h2 id="settings-title">Einstellungen</h2>
          <button className="icon-btn" aria-label="Einstellungen schließen" onClick={onClose} autoFocus>
            <Icon name="x" size={24} stroke={2.6} />
          </button>
        </header>

        <label className="switch-row">
          <span>
            <strong>Hör-Aufgaben</strong>
            <small>Du hörst das Wort und siehst es nicht.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.listen}
            onChange={(event) => onChange({ ...settings, listen: event.target.checked })}
          />
        </label>

        <div className="field">
          <strong id="rate-label">Sprechtempo</strong>
          <div className="segments" role="group" aria-labelledby="rate-label">
            {RATES.map((r) => (
              <button
                key={r.value}
                className={r.value === nearest.value ? "on" : ""}
                aria-pressed={r.value === nearest.value}
                onClick={() => onChange({ ...settings, rate: r.value })}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn danger"
          onClick={() => {
            if (confirm(`Fortschritt für „${setLabel}“ wirklich löschen?`)) {
              onReset();
              onClose();
            }
          }}
        >
          Fortschritt für „{setLabel}“ löschen
        </button>
      </div>
    </div>
  );
}
