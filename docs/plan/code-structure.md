# Code structure: larger steps from the review

Status: open. Found by the review of 25 November 2026 (`docs/history/2026-11-25-cleanup-after-review.md`). Each item changes more than a few lines or needs a decision. None is urgent.

## One table for the exercise kinds

About 15 places spell out facts such as "has choices", "hides the word" or "is typed" as `kind === ... || kind === ...`. A sixth kind (see `speaking.md`) would need an edit at each place.
Step: one table `KIND_INFO` in `shared/session.ts`. Everything else reads from it.

## The round builds its own next step

The practice screen calls `makeStep` again for a repeated card. So it must know the listen setting and the free writing flag of the rehearsal.
Step: `src/Trainer.tsx` passes one function `makeNext(item, card)`. The screen drops both props.

## One mechanism for everything that is synced

Cards have a tested merge. Lessons have one now. The meta block and the "unsent" bookkeeping for lessons are still written by hand at each place in `src/Trainer.tsx`. The server has three similar write statements.
Small step: helpers `putSet` and `touchMeta` in `src/lib/store.ts`.
Large step: one generic synced document. This is a redesign.

## A cap for one sync request

The server rejects a request with more than 3000 cards or 50 lessons. The client sends everything that is unsent. A device with more than that would never sync again.
Step: the client sends at most a fixed number per request. The rest goes with the next one. This needs a test with a large state first.

## Test focus and current lesson

The focus lesson and the current lesson can differ. Several screens decide for themselves which one they show.
Small step: one function `resolveFocus` in `shared/focus.ts` for "valid" and "expired".
Large step: while a focus is valid, its lesson is the current one. This changes what the child sees, so it is a product decision.

## Passkey routes

`worker/auth.ts` repeats the insert of a challenge three times and the insert of a passkey twice. The settings for the passkey check are written at several places.
Step: two helpers. This needs a test with a real passkey on vok.cards.

## Recordings for offline use

`keepForOffline` in `src/lib/audio.ts` asks the cache once per word and loads the files one after another. It runs at every start.
Step: one listing of the cache and a few downloads at a time.

## Plural forms

"1 Wort" and "n Wörter" are written out at about 20 places. A helper would fit, but the wording differs per place.
