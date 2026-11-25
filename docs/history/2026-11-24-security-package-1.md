# Security package 1

Date: 24 November 2026. Commit `0a13791`.

## Result

All paths that cost money at Gemini or ElevenLabs have limits. The pages and the API send protective headers. Writing requests are checked. The sync no longer gets stuck on an invalid set.

## Trigger

A security review by an agent on 23 November 2026. The full report is deliberately not in the repository, because the repository is public. The findings were split into packages. This is the first one. The second is in `docs/plan/open-security-work.md`.

## Steps

1. **Limits for paid calls.**
   - The check has a daily limit per account.
   - Photos, checks and recordings also have a cap for all accounts together. For this there is the new table `usage_log` (migration `0005_usage_log.sql`).
   - The counter works in one step (`INSERT ... ON CONFLICT ... WHERE count < limit`). Two simultaneous requests cannot skip the limit.
2. **Limits for entries.**
   - Photo reading cuts entries to the sync limits. The app takes at most 400 words into a lesson (`shared/limits.ts`).
3. **Robust sync.**
   - The sync skips an invalid set. Before, it rejected the whole request, and the device never synced again.
4. **Protective headers.**
   - For pages and files in `public/_headers`, for the API through Hono `secureHeaders`. With a content security policy and HSTS.
5. **Check of writing requests.**
   - They must come from the own page and send JSON.
   - Requests over 4 MB are rejected. Photo reading has its own limit.
6. **Clean log.**
   - The log no longer contains queries with values. Broken JSON gives 400 instead of 500.
7. **Service worker.** It stores only HTML as the app page.

## Decisions and compromises

- **Two levels of limits.** A single account and the sum of all accounts are limited separately.
- **The numbers are chosen for a small circle.** They must be reviewed before a larger start (see `docs/plan/app-store.md`).
- **`'unsafe-inline'` in `style-src`.** React writes styles directly onto elements. This is a conscious compromise as long as the UI is built this way.
- The old counters `extract_log` and `audio_log` stayed, because they work. New paths use `usage_log`.
- The package does not close everything. The rest is in `docs/plan/open-security-work.md`.

## Learned

- A counter must check and increase in one step. Reading first and writing afterwards lets simultaneous requests through.
- Drizzle attaches the SQL with values to a failed query. That can bring session ids and vocabulary into the log. The log now cuts it to one line.
- Cloudflare: "Always Use HTTPS" is on.
