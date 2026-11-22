import { useCallback, useEffect, useState } from "react";
import { Trainer } from "./Trainer";
import { type AuthState, fetchAuthState } from "./lib/account";
import { Welcome } from "./screens/Welcome";

/**
 * Einstieg. Fragt den Server, wer angemeldet ist.
 * Ohne Anmeldung gibt es den Anmeldebildschirm, sonst den Trainer.
 */
export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(() => {
    setFailed(false);
    fetchAuthState()
      .then(setAuth)
      .catch(() => setFailed(true));
  }, []);

  useEffect(refresh, [refresh]);

  const signedOut = useCallback(() => {
    setAuth((prev) => (prev ? { ...prev, user: null } : prev));
    refresh();
  }, [refresh]);

  if (failed) {
    return (
      <div className="app">
        <main className="screen center">
          <h1>Keine Verbindung</h1>
          <p className="lead">Der Server ist gerade nicht erreichbar. Prüfe dein Internet.</p>
          <button className="btn primary" onClick={refresh}>
            Nochmal versuchen
          </button>
        </main>
      </div>
    );
  }

  if (!auth) {
    return (
      <div className="app">
        <main className="screen center" aria-busy="true">
          <p className="lead">Einen Moment …</p>
        </main>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div className="app">
        <Welcome auth={auth} onSignedIn={(user) => setAuth({ ...auth, user, registrationOpen: false })} />
      </div>
    );
  }

  return <Trainer key={auth.user.id} user={auth.user} onSignedOut={signedOut} />;
}
