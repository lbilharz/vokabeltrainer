/**
 * Base64url für den Worker.
 *
 * WebAuthn spricht durchgehend base64url, und der öffentliche Schlüssel
 * liegt so in D1. Ein einziger Ort dafür, damit das Padding nicht streitet.
 */

export function toBase64Url(input: Uint8Array<ArrayBufferLike>): string {
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
