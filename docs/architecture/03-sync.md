# Sync between devices

A child can use several devices. The learning state must be the same everywhere. It must also keep working offline.

## What is synced

There are three kinds of documents. Each has a change time `t` in milliseconds.

| Document | Table | Key |
| --- | --- | --- |
| Card (box, due day, seen) | `cards` | `user_id` and `item_id` |
| Lesson (a set, as one whole document) | `sets` | `user_id` and `set_id` |
| Meta (settings, current lesson, daily counter, test focus) | `user_meta` | `user_id` |

A lesson is one document. Its words are JSON in the column `data`. A deleted lesson stays as a row with `deleted = true`. This way the deletion reaches the other devices.

## Rule: the newer change wins

This is last write wins.

- `POST /api/sync` receives `since`, the changed cards and lessons, and optionally the meta.
- The server writes with `INSERT ... ON CONFLICT DO UPDATE`. The condition is `excluded.t >= t`. On a tie the incoming version wins.
- Then the server reads everything written since `since` and returns it.
- The client applies the answer (`applyResponse` in `shared/sync.ts`). It keeps its own version if that one is newer.

The pure logic is in `shared/sync.ts` and has tests. The client remembers the change time per card (`stamps`) and the unsent cards (`dirty`).

## When the client syncs

The client syncs at start, when the page becomes visible, when the network returns, after changes, and on an interval while something is unsent (`src/Trainer.tsx`).
Offline, everything stays local. When the network returns, the state goes to the server.

## Decisions

**Last write wins per card, not per account.**
Reason: Two devices mostly change different cards. Per card, the fewest changes are lost.
Trade-off: If someone changes the same card on two devices offline, the older change is lost. For children practising a card, this is small.

**Lessons as whole documents.**
Reason: A lesson is created once and rarely changed (rename, delete). One document is simple and enough.
Trade-off: Two simultaneous changes to the same lesson overwrite each other completely.

**Meta as one block.**
A device that does not know a field (for example the test focus) leaves it out. Then the local value stays. `null` ends the focus on all devices.

**An invalid set is skipped.**
Earlier the server rejected the whole request. The device then never synced again. Now cards, meta and the other lessons go through (`worker/sync.ts`). The skip appears in the log.

## Limits

The limits are in `worker/sync.ts` and `shared/limits.ts`.

- At most 3000 cards and 50 lessons per request.
- At most 400 words per lesson. Word and note at most 300 characters. Heading and name at most 60.
- The meta may have at most 100,000 characters.
- D1 allows at most 100 bound values per statement. So the server writes 12 cards or 12 lessons per statement and up to 40 statements per `db.batch`.

Photo reading and the app use the same numbers. A too long entry would otherwise block the sync later.

## Local state

The local state is separate per account in the browser under the key `vokabeltrainer_v2:<account>` (`src/lib/store.ts`). The state of the old app was taken over at the first start of the new UI.
