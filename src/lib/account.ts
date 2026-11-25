/** Konto, Passkey-Geräte und Abgleich. Spricht mit dem Worker. */

import type { SyncCard } from "@shared/sync";
import type { SetDoc } from "@shared/types";
import { ApiError, apiDelete, apiGet, apiPost } from "./api";
import { APP_VERSION, VERSION_HEADER } from "./version";
import {
  createPasskey,
  usePasskey,
  type CredentialResponseJson,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "./passkey";

export interface User {
  id: string;
  displayName: string;
}

export interface AuthState {
  user: User | null;
  registrationOpen: boolean;
  signupCodeRequired: boolean;
}

export interface Device {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  current: boolean;
}

export interface SyncMeta {
  data: unknown;
  t: number;
}

export interface SyncResponse {
  /** Fehlt bei einem älteren Server. */
  sets?: SetDoc[];
  now: number;
  cards: SyncCard[];
  meta: SyncMeta | null;
}

const AUTH = "/api/auth";

interface CreationChallenge {
  challengeId: string;
  options: PublicKeyCredentialCreationOptionsJSON;
}

interface RequestChallenge {
  challengeId: string;
  options: PublicKeyCredentialRequestOptionsJSON;
}

/** Gerätename aus dem User-Agent. Nur zur Anzeige in der Geräteliste. */
export function deviceLabel(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Android/i.test(ua)) return "Android-Gerät";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows-PC";
  return "Gerät";
}

/**
 * Die Kennung des Passkeys, mit dem dieses Gerät zuletzt angemeldet wurde.
 * Der Server merkt sich das nicht. Die Kennung ist kein Geheimnis.
 */
const CREDENTIAL_KEY = "travok_credential";

function rememberCredential(credential: CredentialResponseJson): void {
  try {
    localStorage.setItem(CREDENTIAL_KEY, credential.id);
  } catch {
    // Ohne Speicher fehlt nur der Hinweis "dieses Gerät" in der Liste.
  }
}

function rememberedCredential(): string | null {
  try {
    return localStorage.getItem(CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

export function fetchAuthState(): Promise<AuthState> {
  return apiGet<AuthState>(`${AUTH}/me`);
}

export async function register(displayName: string, signupCode: string): Promise<User> {
  const code = signupCode.trim();
  const { challengeId, options } = await apiPost<CreationChallenge>(`${AUTH}/register/options`, {
    displayName,
    ...(code ? { signupCode: code } : {}),
  });
  const credential: CredentialResponseJson = await createPasskey(options);
  const { user } = await apiPost<{ user: User }>(`${AUTH}/register/verify`, {
    challengeId,
    credential,
    label: deviceLabel(),
  });
  rememberCredential(credential);
  return user;
}

export async function login(): Promise<User> {
  const { challengeId, options } = await apiPost<RequestChallenge>(`${AUTH}/login/options`);
  const credential = await usePasskey(options);
  const { user } = await apiPost<{ user: User }>(`${AUTH}/login/verify`, {
    challengeId,
    credential,
  });
  rememberCredential(credential);
  return user;
}

export async function logout(): Promise<void> {
  await apiPost<{ ok: boolean }>(`${AUTH}/logout`);
}

export async function listDevices(): Promise<Device[]> {
  const { credentials } = await apiGet<{
    credentials: (Omit<Device, "current"> & { credentialId: string })[];
  }>(`${AUTH}/credentials`);
  const mine = rememberedCredential();
  return credentials.map(({ credentialId, ...device }) => ({ ...device, current: credentialId === mine }));
}

export async function addThisDevice(): Promise<void> {
  const { challengeId, options } = await apiPost<CreationChallenge>(`${AUTH}/credentials/options`);
  const credential = await createPasskey(options);
  await apiPost<{ ok: boolean; label: string }>(`${AUTH}/credentials/verify`, {
    challengeId,
    credential,
    label: deviceLabel(),
  });
  rememberCredential(credential);
}

export async function removeDevice(id: string): Promise<void> {
  await apiDelete<{ ok: boolean }>(`${AUTH}/credentials/${encodeURIComponent(id)}`);
}

/** Liegt bewusst nicht unter /auth. */
export function postSync(
  since: number,
  cards: SyncCard[],
  meta?: SyncMeta,
  sets: SetDoc[] = [],
): Promise<SyncResponse> {
  return apiPost<SyncResponse>("/api/sync", { since, cards, ...(meta ? { meta } : {}), sets });
}

/** Ein gelesener Eintrag. `check` heisst: die zwei Lesungen waren sich nicht einig. */
export interface ExtractedItem {
  c: string | null;
  fr: string;
  de: string;
  n: string | null;
  check: boolean;
}

export interface ExtractResponse {
  items: ExtractedItem[];
  /** 2 ist der Normalfall. Bei 1 fehlt die Gegenprobe. */
  readings: 1 | 2;
}

/** Warum die Gegenprobe eine Zeile verdächtig findet. */
export type CheckKind = "schreibweise" | "passt_nicht" | "verschmolzen";

/**
 * Gegenprobe: ein zweites Modell prüft, ob die Wortpaare zusammenpassen.
 * `i` ist die Position in der geschickten Liste.
 */
export async function checkItems(items: { fr: string; de: string }[]): Promise<{ i: number; kind: CheckKind }[]> {
  const { flags } = await apiPost<{ flags: { i: number; kind: CheckKind }[] }>("/api/check", { items });
  return flags;
}

/** Das Urteil des Schiedsrichters. unknown heisst: keine Antwort, die App wertet wie ohne ihn. */
export interface Judgement {
  verdict: "correct" | "form" | "wrong" | "unknown";
  /** Ein kurzer deutscher Satz. Fehlt bei unknown. */
  note?: string;
}

/** So lange wartet das Kind höchstens auf den Schiedsrichter. */
const JUDGE_TIMEOUT_MS = 4000;

/**
 * Fragt den Schiedsrichter, ob eine falsch bewertete Antwort doch gelten kann.
 * Wirft nie. Bei jedem Fehler und nach 4 Sekunden kommt unknown.
 */
export async function judgeAnswer(de: string, fr: string, answer: string): Promise<Judgement> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  try {
    const result = await apiPost<Partial<Judgement>>("/api/judge", { de, fr, answer }, { signal: controller.signal });
    const verdict = result?.verdict;
    if (verdict !== "correct" && verdict !== "form" && verdict !== "wrong") return { verdict: "unknown" };
    const note = typeof result.note === "string" ? result.note.trim() : "";
    return note ? { verdict, note } : { verdict };
  } catch {
    return { verdict: "unknown" };
  } finally {
    clearTimeout(timer);
  }
}

/** Was während des Lesens passiert. Damit zeigt die App echten Fortschritt. */
export type ExtractProgress =
  /** Das Foto wird gesendet. `fraction` läuft von 0 bis 1. */
  | { type: "sending"; fraction: number }
  /** Der Server hat das Foto und fragt Gemini. */
  | { type: "start" }
  /** Ein weiteres Wort der ersten Lesung ist da. */
  | { type: "word"; fr: string; count: number }
  /** Die erste Lesung ist fertig, die zweite läuft noch. */
  | { type: "compare" };

type ExtractLine =
  | Exclude<ExtractProgress, { type: "sending" }>
  | ({ type: "done" } & ExtractResponse)
  | { type: "error"; error: string };

/**
 * Schickt ein Foto zum Lesen. Der Server speichert das Bild nicht.
 *
 * Die Antwort kommt Zeile für Zeile. So erscheinen die Wörter, während Gemini noch liest.
 * Hier arbeitet XMLHttpRequest statt fetch: nur damit meldet der Browser,
 * wie viel vom Foto schon gesendet ist.
 */
export async function extractPhoto(
  photo: Blob,
  onProgress: (event: ExtractProgress) => void = () => {},
): Promise<ExtractResponse> {
  // Das Bild geht als Base64 zum Server. Der Browser wandelt es um, das spart dem Server Rechenzeit.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Das Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(photo);
  });
  const body = JSON.stringify({ mimeType: photo.type || "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) });
  const fallback = "Die Seite konnte nicht gelesen werden.";

  return new Promise<ExtractResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/extract");
    xhr.setRequestHeader("content-type", "application/json");
    xhr.setRequestHeader("accept", "application/x-ndjson");
    xhr.setRequestHeader(VERSION_HEADER, APP_VERSION);

    onProgress({ type: "sending", fraction: 0 });
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress({ type: "sending", fraction: event.loaded / event.total });
    };
    xhr.upload.onload = () => onProgress({ type: "sending", fraction: 1 });

    let read = 0;
    let settled = false;
    const finish = (result: ExtractResponse | Error) => {
      if (settled) return;
      settled = true;
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    /** Verarbeitet alle Zeilen, die seit dem letzten Mal vollständig angekommen sind. */
    const drain = () => {
      const text = xhr.responseText;
      for (;;) {
        const end = text.indexOf("\n", read);
        if (end === -1) break;
        const line = text.slice(read, end).trim();
        read = end + 1;
        if (!line) continue;
        let event: ExtractLine;
        try {
          event = JSON.parse(line) as ExtractLine;
        } catch {
          continue;
        }
        if (event.type === "done") finish({ items: event.items, readings: event.readings });
        else if (event.type === "error") finish(new ApiError(event.error || fallback, 502));
        else onProgress(event);
      }
    };

    const streamed = () => (xhr.getResponseHeader("content-type") ?? "").includes("ndjson");
    xhr.onprogress = () => {
      if (xhr.status === 200 && streamed()) drain();
    };
    xhr.onload = () => {
      if (xhr.status === 200 && streamed()) {
        drain();
        // Die Verbindung ist zu Ende, aber das Ergebnis kam nie.
        finish(new ApiError(`${fallback} Versuch es noch einmal.`, 502));
        return;
      }
      // Fehler vor dem Lesen und Antworten eines älteren Servers kommen als ein JSON-Block.
      let payload: (ExtractResponse & { error?: string }) | null = null;
      try {
        payload = JSON.parse(xhr.responseText) as ExtractResponse & { error?: string };
      } catch {
        // Keine lesbare Antwort.
      }
      if (xhr.status < 200 || xhr.status >= 300 || !payload) {
        finish(new ApiError(payload?.error ?? fallback, xhr.status));
      } else {
        finish(payload);
      }
    };
    xhr.onerror = () => finish(new Error("Keine Verbindung. Versuch es noch einmal."));
    xhr.ontimeout = () => finish(new ApiError(`${fallback} Versuch es noch einmal.`, 504));
    xhr.timeout = 150_000;
    xhr.send(body);
  });
}
