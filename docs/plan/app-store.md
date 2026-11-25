# App Store with subscription and cost control

Status: idea. There is no decision and no code.

## Goal

The owner wants to bring the trainer into the App Store. It would be his first paid app with a subscription.
The main concern is cost control.

## Reasons

- Apple does not allow a home screen web app on the "Always Allowed" list of Screen Time. This is the reason for a native app.
- The owner already has a developer account. His other app is native in Swift and has no in-app purchases so far.

## What exists already

These parts help with cost control (see `docs/architecture/08-cost-and-safety.md`).

- Daily counters per account and for all accounts in `usage_log`.
- A photo, a check, a verdict and a recording are each limited.
- Recordings apply to all accounts. A word is paid for once.
- The verdict cache saves requests.

## Open

- The content of the proposal from the chat is not recorded here. It must be written down again before anyone builds.
- How the native app is built: an own UI in Swift or a shell around the web app.
- What login looks like there. Passkeys are bound to the domain `vok.cards`.
- How billing fits the costs: how many photos and recordings a subscription includes.
- What the limits per account look like. Today's numbers are chosen for a small circle.
- Deletion and export of accounts. This is also in `docs/plan/open-security-work.md`.
- Whether cost control needs a budget per account and not only counters per day.

## Preconditions

- The open security work before a public start (`docs/plan/open-security-work.md`).
- A way back for a lost passkey (`docs/plan/lost-passkey.md`).
