import { type FormEvent, useEffect, useState } from "react";
import "../onboarding.css";
import { Icon } from "../components/Icon";
import { type AuthState, type User, login, register } from "../lib/account";
import { ApiError } from "../lib/api";
import { readCapabilities } from "../lib/passkey";

interface Props {
  auth: AuthState;
  onSignedIn: (user: User) => void;
}

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Das hat nicht geklappt. Versuch es noch einmal.";
}

export function Welcome({ auth, onSignedIn }: Props) {
  // Solange es noch kein Konto gibt, ist "Konto anlegen" der einzige sinnvolle Weg.
  // Der Link vok.cards/start führt Eingeladene direkt dorthin.
  const [creating, setCreating] = useState(auth.registrationOpen || location.pathname === "/start");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    void readCapabilities().then((caps) => setSupported(caps.webauthn));
  }, []);

  const run = async (action: () => Promise<User>) => {
    setBusy(true);
    setError(null);
    setCodeError(null);
    try {
      onSignedIn(await action());
    } catch (err) {
      // Ein falsches Einladungswort gehört ans Feld, nicht in einen Kasten weiter oben.
      if (err instanceof ApiError && err.status === 403) setCodeError("Das Einladungswort stimmt nicht.");
      else setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Schreib bitte deinen Namen.");
      return;
    }
    void run(() => register(name.trim(), code));
  };

  return (
    <main className="screen welcome">
      <div className="welcome-head">
        <h1>Bonjour</h1>
        <p className="lead">Hier übst du deine Vokabeln. Dein Fortschritt ist auf jedem Gerät dabei.</p>
      </div>

      <ul className="points">
        <li>
          <span className="point-icon">
            <Icon name="camera" size={24} stroke={2.2} />
          </span>
          Fotografiere die Vokabelseite aus deinem Schulbuch.
        </li>
        <li>
          <span className="point-icon">
            <Icon name="list" size={24} stroke={2.2} />
          </span>
          Die App liest die Wörter für dich.
        </li>
        <li>
          <span className="point-icon">
            <Icon name="calendar" size={24} stroke={2.2} />
          </span>
          Übe jeden Tag ein paar Minuten. Die App merkt sich, was du schon kannst.
        </li>
      </ul>

      {!supported && (
        <p className="notice" role="alert">
          Dieser Browser kann keine Passkeys. Nimm Safari oder Chrome auf einem aktuellen Gerät.
        </p>
      )}

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {creating ? (
        <form className="form" onSubmit={submit} noValidate>
          <div className="form-field">
            <label htmlFor="name">Dein Name</label>
            <input
              id="name"
              type="text"
              value={name}
              maxLength={40}
              autoComplete="given-name"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {auth.signupCodeRequired && (
            <div className="form-field">
              <label htmlFor="code">Einladungswort</label>
              <input
                id="code"
                type="text"
                className={codeError ? "invalid" : ""}
                value={code}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={codeError ? "code-error" : undefined}
                onChange={(event) => setCode(event.target.value)}
              />
              {codeError && (
                <p id="code-error" className="field-error" role="alert">
                  {codeError}
                </p>
              )}
              <p className="field-hint">Dieses Wort hat dir die Person gegeben, die dich eingeladen hat.</p>
            </div>
          )}
          <button className="btn primary" type="submit" aria-busy={busy}>
            Konto anlegen
          </button>
          {!auth.registrationOpen && (
            <button className="text-btn center" type="button" onClick={() => setCreating(false)}>
              Ich habe schon ein Konto
            </button>
          )}
        </form>
      ) : (
        <div className="form">
          <button className="btn primary" aria-busy={busy} onClick={() => void run(login)}>
            Anmelden
          </button>
          <button className="text-btn center" onClick={() => setCreating(true)}>
            Neu hier? Konto anlegen
          </button>
        </div>
      )}

      <details className="parents">
        <summary>Für Eltern</summary>
        <ul>
          <li>Die App kostet nichts. Jedes Kind legt ein eigenes Konto mit eigenem Namen an.</li>
          <li>Die Anmeldung geht mit Face ID, Touch ID oder dem Code des Geräts. Es gibt kein Passwort.</li>
          <li>Der Server speichert den Namen, die Vokabeln und den Lernfortschritt.</li>
          <li>Fotos werden nur gelesen und nicht gespeichert.</li>
          <li>
            Zum Lesen der Fotos und für die Aussprache nutzt die App Dienste von Google und ElevenLabs. Dorthin gehen
            nur die Fotos und die Wörter, kein Name.
          </li>
          <li>Jedes Kind legt das Konto am besten auf dem Gerät an, das es danach benutzt.</li>
        </ul>
      </details>

      <p className="hint">
        Du meldest dich mit Face ID, Touch ID oder dem Code deines Geräts an. Ein Passwort brauchst du nicht.
      </p>
    </main>
  );
}
