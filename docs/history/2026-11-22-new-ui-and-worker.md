# New UI, Worker and passkeys

Date: 22 November 2026. Branch `neue-oberflaeche`. Commits `5f0a805`, `1b9a2b2`, `289893a`, `b25d815`.

## Result

The app is a Vite project with React and TypeScript. It has a learning path and one card per page.
A Cloudflare Worker with D1 handles passkey login and the sync of progress. The site runs at `https://vok.cards`.

## Starting point and goal

The owner wanted to turn the trainer into a personalised app. The children upload a photo of the current vocabulary page. The app trains these words together with all earlier ones. First it should run only for the owner's two children. So cost was no selection criterion. Reading accuracy was.

The work was built in steps. The owner approved the UI and the order.

## Steps

1. **New UI, still without an account** (`5f0a805`).
   - A start page with the task for today and a learning path.
   - The app chooses the exercise kind from the learning state.
   - Listening tasks do not show the word.
   - "Heute" mixes due cards from all sets.
   - The box intervals grow up to 90 days.
   - The vocabulary lives in `src/data/*.json`, the recordings in `public/audio`.
   - The learning logic lives in `shared/` and has tests.
   - Each card has a fixed id. The state of the old app is taken over at the first start.
2. **Test script for photo reading** (`1b9a2b2`). `tools/test_erkennung.py` sends photos to Gemini and compares the result with the template. The photos live in `tools/testfotos/` and are excluded by `.gitignore`, because they show publisher content.
3. **Worker with passkey login and sync** (`289893a`).
   - The server part comes from the own project `oh-snap`, without encryption.
   - An account needs the invite word.
   - Per card the newer change wins.
   - The local state is separate per account in the browser.
   - Settings show account, devices and logout.
4. **Database entered** (`b25d815`). The D1 database was created with EU jurisdiction. `289893a` still had a placeholder.
5. **Domain.** The owner bought `vok.cards` at Vercel. The DNS zone moved to Cloudflare. Then the domain became a custom domain of the Worker. The `workers.dev` address was switched off (`7ee6aa6`).

## Decisions and their reasons

- **Hosting moves from Vercel to Cloudflare.** `vercel.json` is removed. Reason: the Worker needs D1, R2 and a cron. Everything is in one place then.
- **Domain instead of `workers.dev`.** Passkeys are bound to the address. So the children create their account only on `vok.cards`.
- **No end-to-end encryption.** The server must read the photo to recognise the vocabulary.
- **Listening tasks do not show the word.** Decision of the owner.
- **Speaking with speech recognition** was wanted by the owner, but as "version 2". See `docs/plan/speaking.md`.
- **Left out on purpose:** a streak of days, a key row for accents, a form for own sentences. Old own entries were migrated.

## Compromises and temporary decisions

- At the time of the commit, login with a real passkey was not tested.
- `main` still holds the old app. See `docs/plan/merge-to-main.md`.
- Recovery from a lost passkey is missing. See `docs/plan/lost-passkey.md`.
- A way to take progress over from the old app is missing. The old app is on another address, and `localStorage` applies only per address.

## Learned

- Locally you can test without a passkey: insert a user and a session into the local D1 and set the cookie `travok_session`. Remove the rows afterwards.
- If `database_id` in `wrangler.jsonc` changes, the local D1 is empty. Then `npm run db:local` helps.
- `wrangler login` expires. If Wrangler says "Not logged in", the owner must run `npx wrangler login` himself.
- D1 with a location works only by hand. Automatic creation at deploy takes no location. D1 cannot be moved later.
