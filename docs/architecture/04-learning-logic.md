# Learning logic

The logic is in `shared/` and has tests. The UI (`src/screens/Session.tsx`) only applies it.

## Boxes (Leitner)

Each card has a box from 1 to 8, a due day `due` and the flag `seen` (`shared/srs.ts`).

| Box | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Days until the next review | 0 | 1 | 2 | 4 | 7 | 14 | 30 | 90 |

- Correct: The card moves up one box. The next review follows the new box.
- Wrong: The card falls back to box 1 and is due today again.
- Practised too early: The state stays. Practising before the due day does not raise the box.
- From box 4 on a card counts as "sits" (`MASTER`).
- A card is due when it was seen and `due` is today or earlier.

**Decision:** The intervals grow up to 90 days.
**Reason:** The old app had five boxes up to seven days, made for one week. The new app keeps training all earlier words. That needs longer intervals.

**Decision:** A day is the local calendar day of the device (`dayNumber`).

## Exercise kinds

The app chooses the exercise from the learning state. The child does not choose (`pickKind` in `shared/session.ts`).

| Kind | What the child does |
| --- | --- |
| `intro` | See and hear a new word. Pick the German meaning from four answers. |
| `gap` | See the German word. Fill the gaps in the foreign word. |
| `type` | See the German word and type the foreign word freely. |
| `listenChoice` | Only listen. Pick the German meaning. |
| `listenType` | Only listen. Type the foreign word. |
| `recall` | A study card: see the front, reveal the back, say whether you knew it (see `12-study-cards.md`). |

Rules of the ladder:

- An unseen card always starts with `intro`.
- Listening tasks appear only if they are on in the settings. Then about half of the tasks are listening tasks. Up to box 2 it is choice (`listenChoice`), from box 3 on it is typing (`listenType`).
- Listening tasks do not show the word. The child only hears the recording.
- In box 1 and 2, `gap` alternates with `type` (`GAP_MAX_BOX`). From box 3 on the child always writes freely.
- If an entry has no letters to fill, `gap` becomes `type`.
- Wrong choices come preferably from the same section of the lesson. Entries with the same German side do not count as wrong choices.
- Two cards can have the same German side. Then the foreign side of each of them counts as right (`targetsFor`). The pool is always one lesson, so it never mixes languages.

**Reason for `gap` and copying:** The jump from choosing to free writing was too big (see `docs/history/2026-11-23-learning-steps.md`).

## Copying

The child sees the word and types it letter by letter (`shared/copy.ts`, `src/components/CopyWord.tsx`).

- It comes after the introduction (`intro`) and after a wrongly typed answer. "Weiter" appears only afterwards.
- A wrong letter is not accepted. So the right word is on screen at the end.
- Punctuation, slashes and placeholders such as `qn/qc` are set by the app.
- A hint helps with accents. After two failed tries a button appears.

## Gap word

Of each word part with three or more letters, the first letter stays visible. Short parts such as articles are fully hidden. So the child must know the article.
A single slip still counts as "almost right" for words with at least four gaps (`rateGaps`).

## Free writing

The child types the solution. How the answer is judged is in `05-answer-checking.md`.

## The "Heute" round

`planToday` in `shared/session.ts` plans the round.

- Reviews come from all lessons. The oldest due days come first. A round has at most 10 (`REVIEW_LIMIT`).
- New cards: at most 5 per round (`NEW_PER_ROUND`) and 10 per day (`NEW_PER_DAY`). The number of new cards shown today is kept in the meta (`newLog`).
- New cards come first from the current lesson. See `07-lessons-and-test-focus.md`.
- The stations on the learning path of a lesson are exempt from the daily limit.

## Progress display

There are two numbers (`shared/lessons.ts`): practised (was due once) and sits (box 4 or higher).
The bar shows practised words light and sitting words dark.
**Reason:** A word sits only after several days. Counting only "sits" left the bar empty on day one.

## Left out on purpose

- A streak of days.
- A key row for accents.
- A form for own sentences. Old own entries were migrated into the template "Sätze".

## Small joys (`shared/cheer.ts`)

A round that goes well gets short feedback. The rules are pure functions with tests. `src/screens/Session.tsx` and `src/screens/Done.tsx` only show the result.

- **Run:** right answers at the first try, one after another. The "Kennenlernen" step does not count in either direction. An answer after a hint ends the run.
- **Lines:** only at 3, 5, 10, 15, 20 and then every 10.
- **"Das sitzt jetzt.":** when an answer moves a card from below box 4 to box 4 or higher.
- **End screen:** "Fehlerfrei" when no card was wrong and the round had at least three cards.

**Decision:** No sound, no extra tap, nothing after a wrong answer. Every effect ends within about a second.
**Reason:** The audience is teenagers. Feedback that slows practice down or sounds childish would be switched off in the head.
All movement sits behind `prefers-reduced-motion`. The styles are in `src/celebrate.css`.
