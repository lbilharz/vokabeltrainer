import { apiGet, apiPost } from "./api";
import { APP_VERSION, VERSION_HEADER } from "./version";

/**
 * Die tägliche Erinnerung per Mitteilung.
 *
 * Das Gerät meldet sich beim Mitteilungsdienst seines Herstellers an und bekommt
 * eine Adresse. Diese Adresse und die gewünschte Uhrzeit gehen an den Server.
 * Der schickt zur vollen Stunde ein leeres Signal. Den Text zeigt die App selbst.
 */

/** Voreinstellung: 17 Uhr, als Minuten seit Mitternacht. */
export const DEFAULT_TIME = 17 * 60;

export interface PushState {
  /** false, solange der Server keine Mitteilungen verschicken kann. Dann bleibt nur der Kalender. */
  configured: boolean;
  /** false, wenn der Browser keine Mitteilungen kann oder die App nicht installiert ist. */
  supported: boolean;
  /** true, wenn Mitteilungen in den Einstellungen des Geräts verboten sind. */
  blocked: boolean;
  enabled: boolean;
  /** Uhrzeit der Erinnerung als Minuten seit Mitternacht, in Schritten von 15. */
  time: number;
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  // Beim Entwickeln gibt es keinen Service Worker. Dann nicht ewig warten.
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

function toBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function readPushState(): Promise<PushState> {
  const configured = await apiGet<{ key: string }>("/api/push/key").then(
    () => true,
    () => false,
  );
  const off: PushState = { configured, supported: false, blocked: false, enabled: false, time: DEFAULT_TIME };
  const reg = await registration();
  if (!reg) return off;
  const blocked = Notification.permission === "denied";
  try {
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return { ...off, supported: true, blocked };
    const state = await apiPost<{ enabled: boolean; hour: number | null; minute?: number | null }>(
      "/api/push/state",
      { endpoint: subscription.endpoint },
    );
    const time = state.hour === null ? DEFAULT_TIME : state.hour * 60 + (state.minute ?? 0);
    return { configured, supported: true, blocked, enabled: state.enabled, time };
  } catch {
    return { ...off, supported: true, blocked };
  }
}

/** Muss direkt aus einem Klick aufgerufen werden. Sonst fragt das Gerät nicht nach der Erlaubnis. */
export async function enablePush(time: number): Promise<void> {
  const reg = await registration();
  if (!reg) throw new Error("Auf diesem Gerät gibt es keine Mitteilungen.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Mitteilungen sind für diese App nicht erlaubt. Das stellst du in den Einstellungen des Geräts um.");
  }
  const { key } = await apiGet<{ key: string }>("/api/push/key");
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) }));
  await fetch("/api/push", {
    method: "PUT",
    headers: { "content-type": "application/json", [VERSION_HEADER]: APP_VERSION },
    body: JSON.stringify({ endpoint: subscription.endpoint, hour: Math.floor(time / 60), minute: time % 60 }),
  }).then((response) => {
    if (!response.ok) throw new Error("Die Erinnerung konnte nicht gespeichert werden.");
  });
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "content-type": "application/json", [VERSION_HEADER]: APP_VERSION },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {
    // Ohne Netz bleibt der Eintrag beim Server. Das Gerät meldet sich trotzdem ab.
  });
  await subscription.unsubscribe();
}
