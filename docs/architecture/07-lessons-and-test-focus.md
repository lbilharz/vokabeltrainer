# Lessons, current lesson, backlog and test focus

## One vocabulary made of lessons

All words of a child form one vocabulary. A photo creates a new **lesson**. In the code and the database it is still called `set`. The UI says "Lektion" everywhere.

- A lesson has a name, a date (`createdAt`) and entries. The child can rename or delete it.
- Without a heading a lesson is named for example "Vokabeln vom 22. November" (`defaultLessonName` in `shared/dates.ts`). The date of the lesson is shown the way a child says it: today, yesterday, on Sunday.
- Stations without a heading in the book are called "Teil 1", "Teil 2". A station is a section (`c`) of the lesson.
- `buildSets` (`src/data/sets.ts`) builds the lessons with fixed ids from the documents. The newest comes first. Duplicate entries inside a lesson are dropped.

## The current lesson

The start page shows a header with "Neue Vokabeln", a bar for the whole vocabulary, and the current lesson with date and stations.

- The current lesson is stored in the meta (`activeSet`). Empty means: the newest.
- A new photo no longer pushes the old lesson out of view. The header with "Neue Vokabeln" stays.
- The screen "Alle Lektionen" shows date and progress per lesson. A tap on a lesson makes it the current one.

## The backlog

A word in another lesson that was never practised belongs to the backlog.

- Below the current lesson a hint appears: `In „Name“ vom Sonntag sind noch 8 Wörter offen.` or for several lessons `In 2 anderen Lektionen sind noch 14 Wörter offen.` (`openHint` in `shared/lessons.ts`).
- "Heute" takes new words first from the current lesson. One slot of the round is reserved for the backlog. The backlog starts with the oldest lesson (`planToday` in `shared/session.ts`).
- Reviews come from all lessons.

**Decision:** New words from the current lesson have priority, but one slot goes to the backlog.
**Reason:** The child learns for the next test. Old lessons should not be left behind.

## Test focus

A child writes a test on one day about one lesson. Until then this lesson has priority (`shared/focus.ts`, `src/screens/TestDay.tsx`).

- The child picks the test day. It lies between tomorrow and 60 days ahead (`FOCUS_MAX_AHEAD`). The app offers the next school days.
- The meta stores the focus: lesson, test day and the ids of the words the child can currently write (`sure`).
- New words per day: unseen words divided by the days until the test, at least 3 and at most 12 (`newPerDay`). They come only from the focus lesson. There is no backlog slot.
- What was already shown today counts. So the daily number does not change during the day.
- A word is "sure" if the child wrote it correctly last. Only writing tasks (`type`, `gap`, `listenType`) change this. Choice tasks and the introduction do not count (`updateSure`).
- A practice round holds the words that are not yet sure, in book order, at most 20 (`PRACTICE_LIMIT`).
- On the day before the test and on the test day there is the **dress rehearsal** (`roundKind`). It takes all words of the lesson. New words come first and start with the introduction as always. Seen words follow shuffled and are only written freely (`freeWriting` in `makeStep`).
- The result of the rehearsal names the shaky words with the reason: accent, spelling, article or not known. The child can practise them again.
- The focus ends by itself after the test day (`isExpired`). It also ends when the lesson is deleted (`isFocusValid`).

**Decision:** The focus lives in the meta and travels with the sync.
**Reason:** The plan should look the same on every device.
**Trade-off:** A device with an older app does not know the field and leaves it out. Then the local value stays.

## Limit of stage one

The same word in two lessons is two cards, because the card id depends on the lesson. The app does not recognise known words across lessons. New photos cannot be added to an existing lesson. Both are planned (see `docs/plan/one-vocabulary-stage-2.md`).
