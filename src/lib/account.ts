/** Konto, Passkey-Geräte und Abgleich. Spricht mit dem Worker. */

import type { SyncCard } from "@shared/sync";
import type { SetDoc } from "@shared/types";
import { ApiError, apiDelete, apiGet, apiPost } from "./api";
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

/** Schickt ein Foto zum Lesen. Der Server speichert das Bild nicht. */
export async function extractPhoto(photo: Blob): Promise<ExtractResponse> {
  // Das Bild geht als Base64 zum Server. Der Browser wandelt es um, das spart dem Server Rechenzeit.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Das Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(photo);
  });
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mimeType: photo.type || "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) }),
  });
  const payload = (await response.json().catch(() => null)) as (ExtractResponse & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new ApiError(payload?.error ?? "Die Seite konnte nicht gelesen werden.", response.status);
  }
  return payload;
}
