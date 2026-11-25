/**
 * Base64url für App und Worker.
 *
 * WebAuthn und Web Push sprechen durchgehend base64url, und der öffentliche Schlüssel
 * liegt so in D1. Ein einziger Ort dafür, damit das Padding nicht streitet.
 */

export function toBase64Url(input: Uint8Array<ArrayBufferLike> | ArrayBuffer): string {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
