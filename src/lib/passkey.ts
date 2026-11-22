/**
 * WebAuthn-Ceremony von Hand, ohne Bibliothek.
 *
 * Der Passkey ist hier nur der Login. Es gibt keine Schlüsselableitung.
 */

type Bytes = Uint8Array<ArrayBuffer>;

function toBase64Url(input: Uint8Array<ArrayBufferLike> | ArrayBuffer): string {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Bytes {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export class PasskeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasskeyError";
  }
}

/** Die Antwort, die der Server zur Verifikation braucht. */
export interface CredentialResponseJson {
  id: string;
  rawId: string;
  type: "public-key";
  clientExtensionResults: Record<string, unknown>;
  authenticatorAttachment?: string;
  response: Record<string, unknown>;
}

/** Nur die Felder, die wir aus den Server-Optionen wirklich lesen. */
export interface PublicKeyCredentialCreationOptionsJSON {
  challenge: string;
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  attestation?: string;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  excludeCredentials?: { id: string }[];
}

export interface PublicKeyCredentialRequestOptionsJSON {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: string;
}

export async function readCapabilities(): Promise<{
  webauthn: boolean;
  platformAuthenticator: boolean;
}> {
  const webauthn =
    typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
  if (!webauthn) return { webauthn: false, platformAuthenticator: false };

  const platformAuthenticator = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(
    () => false,
  );
  return { webauthn, platformAuthenticator };
}

function describe(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "Abgebrochen oder abgelaufen.";
    if (error.name === "InvalidStateError") return "Für dieses Gerät gibt es schon einen Passkey.";
  }
  return error instanceof Error ? error.message : "Unbekannter Fehler.";
}

/** Registrierung. `options` kommt unverändert vom Worker. */
export async function createPasskey(
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<CredentialResponseJson> {
  try {
    const created = (await navigator.credentials.create({
      publicKey: {
        challenge: fromBase64Url(options.challenge),
        rp: options.rp,
        user: {
          id: fromBase64Url(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        attestation: options.attestation as AttestationConveyancePreference | undefined,
        authenticatorSelection: options.authenticatorSelection,
        excludeCredentials: options.excludeCredentials?.map((credential) => ({
          type: "public-key" as const,
          id: fromBase64Url(credential.id),
        })),
      },
    })) as PublicKeyCredential | null;

    if (!created) throw new PasskeyError("Es wurde kein Passkey angelegt.");

    const attestation = created.response as AuthenticatorAttestationResponse;

    return {
      id: created.id,
      rawId: toBase64Url(created.rawId),
      type: "public-key",
      clientExtensionResults: {},
      authenticatorAttachment: created.authenticatorAttachment ?? undefined,
      response: {
        clientDataJSON: toBase64Url(attestation.clientDataJSON),
        attestationObject: toBase64Url(attestation.attestationObject),
        transports: attestation.getTransports?.() ?? [],
      },
    };
  } catch (error) {
    if (error instanceof PasskeyError) throw error;
    throw new PasskeyError(describe(error));
  }
}

/** Anmeldung. Ohne allowCredentials, das Gerät bietet selbst an, was passt. */
export async function usePasskey(
  options: PublicKeyCredentialRequestOptionsJSON,
): Promise<CredentialResponseJson> {
  try {
    const asserted = (await navigator.credentials.get({
      publicKey: {
        challenge: fromBase64Url(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: options.userVerification as UserVerificationRequirement | undefined,
      },
    })) as PublicKeyCredential | null;

    if (!asserted) throw new PasskeyError("Es wurde kein Passkey ausgewählt.");

    const assertion = asserted.response as AuthenticatorAssertionResponse;

    return {
      id: asserted.id,
      rawId: toBase64Url(asserted.rawId),
      type: "public-key",
      clientExtensionResults: {},
      authenticatorAttachment: asserted.authenticatorAttachment ?? undefined,
      response: {
        clientDataJSON: toBase64Url(assertion.clientDataJSON),
        authenticatorData: toBase64Url(assertion.authenticatorData),
        signature: toBase64Url(assertion.signature),
        userHandle: assertion.userHandle ? toBase64Url(assertion.userHandle) : undefined,
      },
    };
  } catch (error) {
    if (error instanceof PasskeyError) throw error;
    throw new PasskeyError(describe(error));
  }
}
