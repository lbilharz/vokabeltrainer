# Login and sessions

There is no password. A child signs in with a passkey.

## Flow

The code is in `worker/auth.ts` and `worker/session.ts`. The library is `@simplewebauthn/server`.

1. Registration: `POST /api/auth/register/options`, then `POST /api/auth/register/verify`.
2. Login: `POST /api/auth/login/options`, then `POST /api/auth/login/verify`.
3. Another device for the same account: `/api/auth/credentials/options` and `/api/auth/credentials/verify`.
4. Device list and removal: `GET /api/auth/credentials`, `DELETE /api/auth/credentials/:id`.
5. State and logout: `GET /api/auth/me`, `POST /api/auth/logout`.

The server stores only the public key. Challenges live in the table `challenges`. They are valid for five minutes and exactly once.

## Session

- After a successful login the server inserts a row into `sessions`.
- The cookie is `travok_session`. It is `httpOnly` and `SameSite=Lax`. On `https` it is `Secure`.
- A session is valid for 30 days.
- Every data query filters on the account id of the session.

## Decisions

**Passkey, no password.**
Reason: Children do not need to remember anything. Face ID or a fingerprint is enough. There is no password to guess.

**Discoverable passkeys (`residentKey: required`), no `allowCredentials`.**
Reason: The device offers the matching passkey by itself. The server does not need to know in advance who is coming.

**RP ID and origin come from the request.**
Reason: `localhost` and tunnels work without changes.
Trade-off: The passkey is bound to the address. A domain change makes all passkeys useless. This is why the `workers.dev` address is off and the children create accounts only on `vok.cards`. There is no way back yet (see `docs/plan/lost-passkey.md`).

**Accounts need an invite word.**
The value is the secret `SIGNUP_CODE`. There is also an upper limit on the number of accounts (`MAX_USERS` in `worker/auth.ts`). The check runs when the challenge is issued and when it is redeemed, because a Face ID prompt sits in between.
Without `SIGNUP_CODE` a simple rule applies: the first account is free, then it is closed. A fresh deployment starts without setup.

**The last passkey cannot be deleted.**
Reason: That would lock the child out. Nobody should do it by accident.

**The device name comes from the user agent and is only for display.**
The client remembers locally which passkey it used last. The server does not store this.

## Origin of the idea

The server part comes from the own project `oh-snap`. End-to-end encryption and PRF were left out. The server must read the photos to recognise the vocabulary.

## Open work

See `docs/plan/open-security-work.md` and `docs/plan/lost-passkey.md`.

## First steps for a new person

- The welcome screen says what the app does and has a block for parents (`src/screens/Welcome.tsx`).
- The link `/start` opens the account form directly. This is the link to hand to an invited family, together with the invite word. The invite word is never part of a link.
- An empty account sees three steps and can add a sample lesson of ten self-written words (`src/components/FirstSteps.tsx`, `src/data/sample.ts`).
- After the first lesson a tip card explains the home screen once (`src/components/TipCard.tsx`). Its "closed" state is kept on the device only.
