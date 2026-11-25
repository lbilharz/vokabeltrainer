# Cleanup after a code review

Date: 25 November 2026.

## Result

The code does the same as before with fewer copies. The rule for a typed answer has tests now. Two old database tables are gone.

## Trigger

The app grew feature by feature in four days. Four reviewers read the whole branch, each with one question: what is duplicated, what is too complicated, what wastes work, and what is solved at the wrong depth.

## Steps

1. **One guard for the session** (`requireSession` in `worker/session.ts`). Ten routes had their own copy of "read the session or answer 401".
2. **One way to Gemini** (`worker/gemini.ts`). Address, headers, the retry list and "drop the thoughts, join the text" existed three times. The three copies of the answer schema had already drifted apart.
3. **One counter for paid calls** (`spend` in `worker/usage.ts`). Photo reading and recordings had their own counter tables and their own copy of the counting statement. They now use `usage_log` like the check and the referee. Migration `0007_drop_old_counters.sql` removes `extract_log` and `audio_log`.
4. **Invalid requests are handled in one place.** The routes call `schema.parse(await request.json())`. `worker/index.ts` already turns both errors into status 400.
5. **Dead branches removed.**
   - The photo route checked the content type again. `worker/index.ts` rejects every non-JSON write before the route runs.
   - The photo route still had an answer without streaming. No client asks for it.
   - `markAllDirty` in `shared/sync.ts` had no caller outside the tests.
6. **The answer rule moved out of the screen** (`ruleTyped` in `shared/answer.ts`). The order "right, almost right, article hint, form hint, wrong" was a nested `if` inside a React component. It could not be tested. Now it is a pure function with nine tests, and the screen only applies the result.
7. **The lesson merge moved next to the card merge** (`mergeSets` in `shared/sync.ts`), with tests.
8. **Shared helpers instead of copies.** Base64url is in `shared/base64.ts` for Worker and app (four copies before). The day length `DAY_MS` is in `shared/dates.ts` (seven copies before). `oneLine` is in `shared/text.ts`. The limits for answers and recordings are in `shared/limits.ts`. The kinds of the check and the type of a read entry are declared once in `shared/extract.ts`.
9. **Fewer round trips.**
   - Sync reads cards, meta and lessons in one batch instead of three queries.
   - `/api/auth/me` skips the "is there any account" query for a signed in user.
   - The recordings route asks the storage for all texts at once.
   - A page that goes to the background syncs only if something is unsent.
10. **Small things in the app.** The push calls use the API wrapper. The photo upload reports the server version like every other call. A row of the review list is marked exactly when it has a reason. The delayed sync after a change has one name (`syncSoon`).

## Compromises and decisions

- **The counters start at zero once.** On the day of the release the counts for photos and recordings begin again in `usage_log`. For a handful of accounts this does not matter.
- **Order of the release:** first the code, then the migration. The new code does not touch the old tables. The old code would fail without them.
- **`usage_log` has no foreign key.** The old tables deleted their rows with the account. The rows in `usage_log` stay. They hold a number per day and no content.
- **Model names stay per route.** Photo reading and the check use the same model today. These are two decisions that happen to match, so each route keeps its own constant.
- **Shims for stored data stayed.** The reset of `since` in `src/lib/store.ts`, the heading fix in `renameActive` and the speed rounding in the settings protect data on real devices. Only the owner knows whether every device has moved on.
- **The passkey routes were not touched.** `worker/auth.ts` repeats some blocks. A change there cannot be tested without a real passkey.

## Checked

Type check, 286 tests and the build pass. The changed routes were called locally with good and bad input. One photo reading, one check, two referee calls and one recording ran locally against the real services, six paid requests in total. A practice round in the browser showed the same results as before for a missing accent, a missing article, another word of the lesson and a synonym.

## Learned

- Three copies of one parser drift apart within days. Two of them were strict and one was lenient, and nobody had decided that.
- A comment "must match the server" is a missing shared constant.
- A rule that sits in a component gets a new branch with every feature and never a test.

## Left open

See `docs/plan/code-structure.md`.
