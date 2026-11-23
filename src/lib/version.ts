/**
 * Merkt, wenn der Server eine neuere Version der App kennt, und lädt sie.
 *
 * Jede Anfrage nennt dem Server die eigene Version. Jede Antwort nennt die des Servers.
 * Ohne das zeigt die App nach einem Update manchmal noch einen Start lang die alte Fassung.
 */
import { APP_VERSION, VERSION_HEADER, isNewer } from "@shared/version";

export { APP_VERSION, VERSION_HEADER };

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
 * Lädt die neuere Version. Pro Version nur ein Versuch.
 * So entsteht keine Schleife, falls das Neuladen wieder die alte Fassung bringt.
 */
export async function loadNewerVersion(): Promise<void> {
  if (!newer) return;
  try {
    if (sessionStorage.getItem(TRIED_KEY) === newer) return;
    sessionStorage.setItem(TRIED_KEY, newer);
  } catch {
    // Ohne Speicher lässt sich die Schleife nicht verhindern. Dann lieber nicht neu laden.
    return;
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
