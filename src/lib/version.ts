/**
 * Merkt, wenn der Server eine neuere Version der App kennt, und lädt sie.
 *
 * Jede Anfrage nennt dem Server die eigene Version. Jede Antwort nennt die des Servers.
 * Ohne das zeigt die App nach einem Update manchmal noch einen Start lang die alte Fassung.
 */
import { APP_VERSION, VERSION_HEADER, isNewer, versionDate } from "@shared/version";

export { APP_VERSION, VERSION_HEADER, versionDate };

let newer: string | null = null;
const listeners = new Set<() => void>();

/** Bekommt die Version aus jeder Antwort des Servers. */
export function noteServerVersion(version: string | null): void {
  if (!isNewer(version) || version === newer) return;
  newer = version;
  for (const listener of listeners) listener();
}

/** Die neuere Version, falls der Server eine genannt hat. */
export function newerVersion(): string | null {
  return newer;
}

export function onNewerVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const TRIED_KEY = "travok_update_tried";

/**
 * Lädt die neuere Version. Von selbst gibt es pro Version nur einen Versuch.
 * So entsteht keine Schleife, falls das Neuladen wieder die alte Fassung bringt.
 * force: der Mensch hat selbst darum gebeten. Dann zählt der frühere Versuch nicht.
 */
export async function loadNewerVersion(force = false): Promise<void> {
  if (!newer) return;
  try {
    if (!force && sessionStorage.getItem(TRIED_KEY) === newer) return;
    sessionStorage.setItem(TRIED_KEY, newer);
  } catch {
    // Ohne Speicher lässt sich die Schleife nicht verhindern. Dann lieber nicht von selbst neu laden.
    if (!force) return;
  }
  try {
    // Holt die neue Seite in den Speicher des Service Workers. Das Neuladen findet sie dort auch bei lahmem Netz.
    await fetch("/", { cache: "no-store" });
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
  } catch {
    // Ohne Netz bleibt die alte Fassung. Der nächste Start versucht es wieder.
    return;
  }
  location.reload();
}

/**
 * Fragt den Server nach seiner Version, auf Wunsch aus den Einstellungen.
 * Gibt es eine neuere, lädt die App sie. Die Seite lädt dann neu, und die Antwort kommt nie an.
 *
 * current: das ist die neueste Version. offline: der Server war nicht erreichbar.
 */
export async function checkForUpdate(): Promise<"current" | "offline"> {
  let server: string | null;
  try {
    const response = await fetch("/api/auth/me", { headers: { [VERSION_HEADER]: APP_VERSION }, cache: "no-store" });
    server = response.headers.get(VERSION_HEADER);
  } catch {
    return "offline";
  }
  if (!isNewer(server)) return "current";
  noteServerVersion(server);
  await loadNewerVersion(true);
  // Hier kommt die App nur an, wenn das Neuladen nicht geklappt hat.
  return "offline";
}
