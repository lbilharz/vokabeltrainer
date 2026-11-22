import { useEffect, useState } from "react";
import type { SyncStatus } from "../Trainer";
import { type Device, type User, addThisDevice, listDevices, logout, removeDevice } from "../lib/account";
import type { Settings as SettingsData } from "../lib/store";
import { Icon } from "./Icon";

interface Props {
  user: User;
  syncStatus: SyncStatus;
  settings: SettingsData;
  setLabel: string;
  onChange: (settings: SettingsData) => void;
  onReset: () => void;
  onSignedOut: () => void;
  onClose: () => void;
}

const RATES: { label: string; value: number }[] = [
  { label: "Langsam", value: 0.65 },
  { label: "Normal", value: 0.8 },
  { label: "Schnell", value: 1 },
];

const SYNC_TEXT: Record<SyncStatus, string> = {
  idle: "Dein Fortschritt ist gesichert.",
  running: "Dein Fortschritt wird gesichert …",
  failed: "Gerade keine Verbindung. Dein Fortschritt wird später gesichert.",
};

export function Settings(props: Props) {
  const { user, settings, setLabel, onChange, onClose } = props;
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = () => {
    listDevices()
      .then(setDevices)
      .catch(() => setDevices(null));
  };
  useEffect(reload, []);

  // Ein Tempo aus der alten App liegt vielleicht zwischen den drei Stufen.
  const nearest = RATES.reduce((best, r) =>
    Math.abs(r.value - settings.rate) < Math.abs(best.value - settings.rate) ? r : best,
  );

  const act = async (action: () => Promise<void>, done: string) => {
    setNote(null);
    try {
      await action();
      setNote(done);
      reload();
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : "Das hat nicht geklappt.");
    }
  };

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

        <section className="field account">
          <strong>Konto: {user.displayName}</strong>
          <small>{SYNC_TEXT[props.syncStatus]}</small>
          {devices && devices.length > 0 && (
            <ul className="devices">
              {devices.map((device) => (
                <li key={device.id}>
                  <span>
                    {device.label}
                    {device.current ? " (dieses Gerät)" : ""}
                  </span>
                  {devices.length > 1 && !device.current && (
                    <button
                      className="icon-btn"
                      aria-label={`${device.label} entfernen`}
                      onClick={() => {
                        if (confirm(`„${device.label}“ wirklich entfernen? Dort ist dann keine Anmeldung mehr möglich.`)) {
                          void act(() => removeDevice(device.id), "Das Gerät ist entfernt.");
                        }
                      }}
                    >
                      <Icon name="x" size={20} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {note && (
            <p className="note" role="status">
              {note}
            </p>
          )}
          <div className="account-actions">
            <button className="btn quiet" onClick={() => void act(addThisDevice, "Dieses Gerät ist jetzt gemerkt.")}>
              Dieses Gerät merken
            </button>
            <button
              className="btn quiet"
              onClick={() => {
                void logout().finally(() => {
                  onClose();
                  props.onSignedOut();
                });
              }}
            >
              Abmelden
            </button>
          </div>
        </section>

        <button
          className="btn danger"
          onClick={() => {
            if (confirm(`Fortschritt für „${setLabel}“ wirklich löschen?`)) {
              props.onReset();
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
