# Overview

The vocabulary trainer is an installable web app for children. It runs at `https://vok.cards`.
Each child creates an account with a passkey. The child photographs a vocabulary page from the school book. The app reads the words and trains them.

## Building blocks

| Block | Location | Job |
| --- | --- | --- |
| UI | `src/` | React and TypeScript, built with Vite. |
| Shared logic | `shared/` | Pure functions for learning, answer checking, sync and planning. Client and Worker both use them. |
| Worker | `worker/` | Hono on Cloudflare Workers. All paths under `/api`. |
| Database | D1, binding `DB`, schema in `worker/db/schema.ts`, migrations in `migrations/` | Accounts, passkeys, sessions, cards, lessons, settings, counters. |
| Recordings | R2, binding `AUDIO` | French voice recordings for photographed words. |
| Service worker | `public/sw.js` | Offline start, recording cache, push signal. |
| Tools | `tools/` | Scripts for recordings, keys and photo reading tests. |

## Hosting

One Worker named `travok` serves the app and the API. The configuration is in `wrangler.jsonc`.

- The built files are assets of the Worker. Unknown paths return the start page (`single-page-application`).
- Only `/api/*` runs through the Worker first (`run_worker_first`). Routing does not depend on the `Sec-Fetch-Mode` header.
- The address is the custom domain `vok.cards`. The `workers.dev` address is switched off.
- The domain was bought at Vercel. The DNS zone is at Cloudflare.
- D1 and R2 are in the EU jurisdiction. Both were created by hand. The deployment does not create them.
- A cron trigger runs every 15 minutes and sends reminders (see `09-reminder.md`).
- Deploy with `npm run deploy`. Run migrations with `npm run db:remote`.

**Decision:** Everything runs in one Worker.
**Reason:** One place for code, secrets, domain and logs.
**Trade-off:** The free Cloudflare plan limits CPU time per request. The code respects that (see `06-photos-and-recordings.md`).

**Decision:** D1 and R2 live in the EU.
**Reason:** The data should stay in the EU. D1 cannot be moved later. So the location is set at creation (`wrangler.jsonc`).

## Where data lives

- A child's learning state lives in the browser (`localStorage`, separate per account) and on the server. See `03-sync.md`.
- Photos are stored nowhere. The Worker passes them to Gemini and does not keep them.
- Recordings are shared by all accounts in R2. They contain only vocabulary.
- Secrets are Worker secrets. Locally they are in `.dev.vars`, which Git ignores. `.dev.vars.example` lists the names. The types are in `worker/env.d.ts`.

## External services

- Google Gemini reads photos, checks word pairs and judges answers.
- ElevenLabs creates the voice recordings.
- The push services of the device makers deliver the reminder.

Every call to Gemini and ElevenLabs costs money. They run only through the Worker, and each one is limited (see `08-cost-and-safety.md`).

## Tests

`npm test` runs Vitest. The logic in `shared/` has tests next to the code (`*.test.ts`).
The Worker has no tests of its own. `npm run typecheck` checks types.

## Special cases

- The templates in `src/data/*.json` belong to no account. Only the test link `/prefill` adds them to a signed-in account. New accounts start empty.
- The card id is `${setId}:${fnv1a(fr)}` (`itemId()` in `shared/text.ts`). It depends on the lesson and on the French text.
- The code still says `set` where the UI says "Lektion" (lesson).
