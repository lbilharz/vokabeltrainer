import { useEffect, useState } from "react";
import type { SyncStatus } from "../Trainer";
import { type Device, type User, addThisDevice, listDevices, logout, removeDevice } from "../lib/account";
import { DEFAULT_TIME, type PushState, disablePush, enablePush, readPushState } from "../lib/push";
import type { Settings as SettingsData } from "../lib/store";
import { checkForUpdate, versionDate } from "../lib/version";
import { isInstalled } from "../lib/install";
import { Icon } from "./Icon";

interface Props {
  user: User;
  syncStatus: SyncStatus;
  settings: SettingsData;
  /** Name der aktuellen Lektion. null, wenn das Konto noch keine hat. */
  setLabel: string | null;
  onDeleteSet: () => void;
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
  /** Was die Suche nach einer neuen Version ergeben hat. */
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const built = versionDate();

  const searchUpdate = async () => {
    setSearching(true);
    setUpdateNote(null);
    const outcome = await checkForUpdate();
    // Bei einer neuen Version lädt die Seite neu. Dann kommt die App hier nicht mehr an.
    setSearching(false);
    setUpdateNote(
      outcome === "current"
        ? "Du hast die neueste Version."
        : "Gerade keine Verbindung. Versuch es später noch einmal.",
    );
  };
  const [push, setPush] = useState<PushState | null>(null);
  const [pushNote, setPushNote] = useState<string | null>(null);
  /** Uhrzeit der Erinnerung als Minuten seit Mitternacht. */
  const [time, setTime] = useState(DEFAULT_TIME);

  useEffect(() => {
    void readPushState().then((state) => {
      setPush(state);
      setTime(state.time);
    });
  }, []);

  /** Schaltet die Erinnerung ein, aus oder auf eine andere Stunde. */
  const changePush = async (enabled: boolean, at: number) => {
    setPushNote(null);
    try {
      if (enabled) await enablePush(at);
      else await disablePush();
      setPush(await readPushState());
    } catch (error) {
      setPushNote(error instanceof Error && error.message ? error.message : "Das hat nicht geklappt.");
      setPush(await readPushState());
    }
  };
  const installed = isInstalled();

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

        <div className="field">
          <strong>Tägliche Erinnerung</strong>
          <label className="select-row">
            <span>Uhrzeit</span>
            <select
              value={time}
              onChange={(event) => {
                const next = Number(event.target.value);
                setTime(next);
                // Läuft die Mitteilung schon, gilt die neue Uhrzeit sofort.
                if (push?.enabled) void changePush(true, next);
              }}
            >
              {/* Von 7:00 bis 21:45 in Viertelstunden. */}
              {Array.from({ length: 60 }, (_, i) => 7 * 60 + i * 15).map((t) => (
                <option key={t} value={t}>
                  {Math.floor(t / 60)}:{String(t % 60).padStart(2, "0")} Uhr
                </option>
              ))}
            </select>
          </label>
          {push?.configured && (
            <label className="switch-row">
              <span>
                <strong>Mitteilung von der App</strong>
                <small>
                  {push.supported
                    ? "Sie kommt nur, wenn noch Karten warten."
                    : "Das geht erst, wenn die App auf dem Home-Bildschirm liegt."}
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={push.enabled}
                disabled={!push.supported}
                onChange={(event) => void changePush(event.target.checked, time)}
              />
            </label>
          )}
          {pushNote && (
            <p className="field-error" role="alert">
              {pushNote}
            </p>
          )}
          <a className="btn quiet" href={`/api/reminder.ics?hour=${Math.floor(time / 60)}&minute=${time % 60}`}>
            In den Kalender eintragen
          </a>
          <small className="help">
            Der Kalender erinnert jeden Tag, auch wenn du schon geübt hast. Dafür bleibt alles auf deinem Gerät.
          </small>
        </div>

        {!installed && (
          <p className="install-hint">
            <strong>Wie eine App benutzen:</strong> Tippe im Browser auf „Teilen“ und dann auf „Zum Home-Bildschirm“.
          </p>
        )}

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

        {setLabel !== null && (
          <div className="account-actions">
            <button
              className="btn danger"
              onClick={() => {
                if (confirm(`Fortschritt für „${setLabel}“ wirklich löschen? Die Vokabeln bleiben.`)) {
                  props.onReset();
                  onClose();
                }
              }}
            >
              Fortschritt löschen
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (confirm(`Die Lektion „${setLabel}“ wirklich löschen? Die Vokabeln sind dann weg.`)) {
                  props.onDeleteSet();
                  onClose();
                }
              }}
            >
              Lektion löschen
            </button>
          </div>
        )}

        <section className="field version">
          <strong>Version</strong>
          <small>{built ? `Stand vom ${built}` : "Entwicklungsfassung"}</small>
          {updateNote && (
            <p className="note" role="status">
              {updateNote}
            </p>
          )}
          <div className="account-actions">
            <button className="btn quiet" disabled={searching} onClick={() => void searchUpdate()}>
              {searching ? "Suche …" : "Nach neuer Version suchen"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
