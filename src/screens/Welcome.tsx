import { type FormEvent, useEffect, useState } from "react";
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
  const [creating, setCreating] = useState(auth.registrationOpen);
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

      <p className="hint">
        Du meldest dich mit Face ID, Touch ID oder dem Code deines Geräts an. Ein Passwort brauchst du nicht.
      </p>
    </main>
  );
}
