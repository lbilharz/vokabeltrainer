/** Dünner Wrapper um fetch. Alle Antworten sind JSON. */

import { APP_VERSION, VERSION_HEADER, noteServerVersion } from "./version";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", [VERSION_HEADER]: APP_VERSION, ...init?.headers },
  });
  noteServerVersion(response.headers.get(VERSION_HEADER));

  // Fehler kommen als { error }. Eine kaputte Antwort wird zu null.
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new ApiError(payload?.error ?? response.statusText, response.status);
  }
  return payload as T;
}

export const apiGet = <T,>(path: string): Promise<T> => request<T>(path);

export const apiPost = <T,>(path: string, body?: unknown, init?: RequestInit): Promise<T> =>
  request<T>(path, { ...init, method: "POST", body: JSON.stringify(body ?? {}) });

export const apiPut = <T,>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) });

export const apiDelete = <T,>(path: string): Promise<T> => request<T>(path, { method: "DELETE" });
