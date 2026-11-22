import { useCallback, useEffect, useState } from "react";
import { Trainer } from "./Trainer";
import { type AuthState, type User, fetchAuthState } from "./lib/account";
import { ApiError } from "./lib/api";
import { Welcome } from "./screens/Welcome";

/** Wer zuletzt auf diesem Gerät angemeldet war. Damit startet die App auch ohne Netz. */
const USER_KEY = "travok_user";

function rememberedUser(): User | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(USER_KEY) ?? "null");
    if (value && typeof value === "object" && "id" in value && "displayName" in value) return value as User;
  } catch {
    // Kaputter Eintrag: dann eben ohne.
  }
  return null;
}

function rememberUser(user: User | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Ohne Speicher braucht die App beim Start immer das Netz.
  }
}

/**
 * Einstieg. Fragt den Server, wer angemeldet ist.
 * Ohne Anmeldung gibt es den Anmeldebildschirm, sonst den Trainer.
 * Ohne Netz startet der Trainer mit dem zuletzt angemeldeten Konto.
 */
export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(() => {
    setFailed(false);
    fetchAuthState()
      .then((state) => {
        rememberUser(state.user);
        setAuth(state);
      })
      .catch((error: unknown) => {
        // Antwortet der Server mit einem Fehler, stimmt etwas nicht. Kein Netz ist etwas anderes.
        const user = error instanceof ApiError ? null : rememberedUser();
        if (user) setAuth({ user, registrationOpen: false, signupCodeRequired: true });
        else setFailed(true);
      });
  }, []);

  useEffect(() => {
    refresh();
    // Sobald das Netz zurück ist, prüft die App die Anmeldung noch einmal.
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
  }, [refresh]);

  const signedOut = useCallback(() => {
    rememberUser(null);
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
        <Welcome
          auth={auth}
          onSignedIn={(user) => {
            rememberUser(user);
            setAuth({ ...auth, user, registrationOpen: false });
          }}
        />
      </div>
    );
  }

  return <Trainer key={auth.user.id} user={auth.user} onSignedOut={signedOut} />;
}
