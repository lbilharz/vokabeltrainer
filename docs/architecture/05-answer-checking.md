# Answer checking

A typed answer goes through several stages. The first ones are rules in the app. Only at the end does the app ask a model.
The flow is in `check()` in `src/screens/Session.tsx`. The rules are in `shared/text.ts` and `shared/forms.ts`.

## Stage 1: Right

`isCorrect` compares the normalised answer with all accepted solutions (`acceptedAnswers`).

- Normalising means: lower case, no punctuation or ellipsis dots, the iPhone keyboard apostrophe treated the same.
- Placeholders such as `qn/qc`, `+ inf.` and `(à qn)` are optional.
- Each slash variant counts on its own. Both forms one after the other also count.

## Stage 2: Almost right (`closeness`)

There is a third state in orange. It counts as right.

| Case | Result |
| --- | --- |
| Only accents are missing or wrong | Right, orange. |
| One typo (two for words of 9 characters or more) | Right, orange. |
| The word is right, the article is missing | A second try with a hint. |
| Wrong article | Wrong. |

The feedback shows the right spelling and marks the place that was wrong (`markDiff`).

**Decision:** The article stays strict.
**Reason:** The article belongs to the word. "la roman" instead of "le roman" is not a typo. It is the wrong gender.

**Decision:** Words under four characters get no leniency.
**Reason:** "la" and "le" are too close.

**Decision:** If the child writes exactly the solution of another card in the lesson, it was not a typo.
The answer is wrong and the leniency does not apply.

**Background:** Until 22 November 2026 every deviation was wrong, even a missing accent. That was too hard on a phone.

## Stage 3: The right word in another form (`anotherForm`)

Example: "arriver à" instead of "il/elle arrive à + inf.".
The rules compare the content words (`contentWords`). Articles, pronouns and placeholders are dropped. Two words count as forms of the same word if they share the first four letters.

- If this applies, the child gets a hint and a second try.
- If the child wrote the solution of another card, the hint names that card's German meaning.
- This applies only to free writing (`type`).

## Stage 4: The referee (`POST /api/judge`)

If the answer is still wrong, the app asks a cheap model (`gemini-flash-lite-latest`). It gives one of three verdicts.

- `richtig`: The answer is correct French and means the same. A real synonym counts too.
- `form`: The word is right, the form is not. The child gets a second try.
- `falsch`: Everything else.

Each verdict comes with one sentence for the child. The prompt forbids revealing the solution.

Details:

- The app asks only for free writing (`type`).
- The app does not ask if the child wrote another word of the lesson. That is simply wrong.
- The app does not ask offline and not for long texts.
- The client waits at most 4 seconds (`JUDGE_TIMEOUT_MS` in `src/lib/account.ts`). The server waits at most 6.
- On any error, timeout or limit the result is `unknown`. Then the app judges as it would without a referee. The child notices nothing.
- In case of doubt the model should choose `falsch`. The temperature is 0.
- The hint is free text from the model. The server cuts it to 140 characters. If it contains a link or markup, it is dropped completely.
- Verdicts are stored in the table `judge_cache`. The key is a SHA-256 over the three normalised texts. It contains no account id. Equal questions cost nothing, also across accounts.
- Limits: 150 new verdicts per account and day, 1500 for all accounts (`worker/usage.ts`). Cache hits do not count.

**Decision:** Rules first, then the model.
**Reason:** Rules solve most cases at once, for free and offline. The model costs money and time. It only decides what the rules cannot.
**Trade-off:** A model verdict can be wrong. So the default in doubt is `falsch`, and any problem falls back to the rules.

## What is not stored

The verdict cache holds a hash, the verdict and the hint. It holds neither the texts nor an account id. The log holds only status codes and short error messages, never answers.
