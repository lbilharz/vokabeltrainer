# Leniency for another form, referee and separated prompts

Date: 25 November 2026. Commit `91b27b5`.

## Result

If a child writes the right word in another form, the child gets a hint and a second try. A cheap model judges answers that are still wrong afterwards. All requests to Gemini keep rules and foreign text apart.

## Trigger

A child who wrote "arriver à" instead of "il arrive à" got "Noch nicht". It looked as if the child had not known the word.

## Steps

1. **Rules in the app** (`shared/forms.ts`, `anotherForm`).
   - They recognise the right word in another form. Then there is a hint and a second try.
   - If the child wrote the solution of another card, the hint names its meaning.
2. **The referee** (`POST /api/judge`, `worker/judge.ts`).
   - A cheap model judges answers that are still wrong afterwards. It knows three verdicts: also right, other form, wrong. It also writes one sentence for the child.
   - Verdicts are stored without a link to the account (table `judge_cache`, migration `0006_judge_cache.sql`). Equal questions cost nothing.
   - There are daily limits per account and for all together (`usage_log`).
3. **Rules and foreign text stay apart** (`worker/prompt.ts`).
   - The rules are in the system instruction. Text from outside is JSON between markers and never counts as an instruction.
   - This covers photo reading, the check and the referee.

## Decisions and compromises

- **Rules first, then the model.** A rule settles most cases for free and at once.
- **In doubt, wrong.** The model should be generous only when it is sure. The temperature is 0.
- **On any problem the app falls back to the rules.** The client waits at most 4 seconds, the server 6. A second try takes too long, the child is waiting.
- **The smallest model is enough.** The task is short and has only three answers. Reading photos stays with the larger model, see `2026-11-22-photo-reading-and-recordings.md`.
- **Verdicts without account link.** The cache knows the texts only as a hash. It helps all accounts.
- **Hints from the model are free text.** The server cuts them to 140 characters. If a hint contains a link or markup, it is dropped.
- **The hint must not reveal the solution.** This is in the prompt. There is no check in the code for it. That remains a residual risk.

## Learned

- Foreign text can contain instructions. This applies to a photo, to words and to answers of children. A safeguard needs two parts: the separation in the prompt and a fixed answer format with validation after the call.
