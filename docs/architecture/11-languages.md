# Languages

A child can learn French and English. Each lesson has exactly one language.

## Where the language lives

- A lesson stores `lang` in its data (`SetData` in `shared/types.ts`). The values are `fr` and `en`.
- A lesson without `lang` is French. All lessons from before English stay valid without a migration.
- `buildSets` (`src/data/sets.ts`) puts the language on every item. The rest of the code reads `item.lang`.
- The sync schema of the Worker knows the field (`worker/sync.ts`). Without that the Worker would drop it.

**Decision:** The foreign word is still stored in the field `fr`, for every language.
**Reason:** The name is in every stored lesson, in the photo reading answer and in every card id. A rename needs a data migration for all accounts and brings no change for the child.
**Trade-off:** The name is misleading. The types say so in a comment.

## What depends on the language

Everything is in one table, `RULES` in `shared/lang.ts`. French keeps exactly the behaviour it had before.

| Rule | French | English |
| --- | --- | --- |
| Article belongs to the word | yes: a missing article gives a hint and a second try | no |
| Optional start | none | `to`, `the`, `a`, `an`: "go" and "to go" are both right |
| Placeholders written out | none | "somebody", "someone", "something" count like `sb` and `sth` |
| Function words for the form rule | articles and pronouns | articles, `to` and pronouns |

- `stripPlaceholders` and `sayText` (`shared/text.ts`) know `sb` and `sth`. The voice says "somebody" and "something".
- A solution with several forms separated by commas, like "go, went, gone", needs all forms. If the child writes only the first one, the app asks for the rest once (`partial` in `shared/forms.ts`). This rule applies to every language.

**Decision:** English is lenient about `to` and about articles.
**Reason:** English school books print the same verb as "go", "to go" or "(to) go". The article shows no gender. Neither is what the child has to learn.

## The app detects the language of the page

The child does not pick a language before the photo. The Worker finds it out (`detectLang` in `worker/extract.ts`).

1. The app sends the photo with `lang: "auto"` and a `hint`. The hint is the language of the current lesson.
2. A small, fast model (`gemini-flash-lite-latest`) looks at the photo and answers `fr`, `en` or `unbekannt`.
3. The large model then reads the page with the prompt of that language.
4. The answer names the language. The review page shows it as "Sprache der Lektion". The child can change it there.

If the detection fails, takes longer than 6 seconds or answers `unbekannt`, the hint applies.
With several photos the last detected language wins, until the child picks one by hand. After that the choice stays.

**Decision:** Detect first with a small model, then read with the prompt of that language.
**Reason:** Each language has its own reading prompt. The French prompt was tuned on test photos and stays word for word the same. One shared prompt that also names the language would have put that at risk.
**Trade-off:** One more request to Gemini per photo, to the cheapest model. The photo limit counts the photo once, not the request.

## Requests to the Worker

`/api/extract`, `/api/check`, `/api/judge` and `/api/audio/ensure` take an optional `lang`. Without it they use French. Only `/api/extract` also accepts `auto`. So an older version of the app keeps working after a deployment.

- Photo reading and check have one prompt per language.
- The referee has one prompt with a short extra paragraph for English.
- The referee cache key contains the language, except for French. So the stored French verdicts stay valid.
- Recordings live in one R2 folder per language (see `06-photos-and-recordings.md`).

## In the UI

- The question above a task names the language: "Wie heißt das auf Englisch?". A round of reviews can mix both languages.
- The lesson list and the lesson card show the language before the date, for example "Englisch · heute fotografiert". They show it only when the account has lessons in more than one language (`withLang` in `shared/lang.ts`).
- Input fields and words carry the `lang` attribute of the lesson. Screen readers and the device voice then use the right language. The device voice for English is British (`LOCALE`).

## Limits

- An older app version that edits an English lesson sends it back without `lang`. The lesson then counts as French. The version check reloads the app soon after a deployment, so this window is short (see `10-version-and-offline.md`).
- British and American spellings are different words for the rules of the app. Only the referee accepts the other spelling.
- A third language needs an entry in `FOREIGN`, `RULES`, the prompts and the voices.
