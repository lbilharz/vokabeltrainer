# One vocabulary with current lesson and test focus

Date: 24 November 2026. Commit `4a69905`.

## Result

All words belong to one vocabulary. The start page shows the current lesson. A child with a test picks the test day and gets a plan.

## Problem

A new photo pushed the old set out of view. The child saw only the newest lesson. Old words stayed invisible, even if they were still open.

## Steps

1. **Start page.** A header with "Neue Vokabeln" that stays. One bar for the whole vocabulary. The current lesson with date and stations. A hint about open words in other lessons.
2. **"Alle Lektionen".** A new screen with date and progress. A tap picks the current lesson.
3. **"Heute".** New words from the current lesson and one from the backlog.
4. **The date.** It is shown the way a child says it: today, yesterday, on Sunday.
5. **Term.** "Set" is called "Lektion" everywhere in the UI. In the code and the database it stays `set`.
6. **Test focus.** Pick the test day. A plan until then. A test card with "sicher". A test round. A dress rehearsal on the day before with the shaky words. The focus ends by itself after the test day.

## Decisions

- **One slot in "Heute" belongs to the backlog.** So old lessons are not left behind, and the current one still has priority.
- **The test focus lives in the meta** and travels with the sync. The plan looks the same on every device.
- **New words per day in the focus:** unseen divided by days until the test, at least 3, at most 12. The bounds are an estimate. They are not measured.
- **"Sure"** changes only by writing, not by choosing.

## Compromises and temporary decisions

- This is **stage 1**. The same word in two lessons is two cards. The card id depends on the lesson. The app does not recognise known words across lessons. A photo cannot be added to an existing lesson. That is stage 2 (see `docs/plan/one-vocabulary-stage-2.md`).
- The focus lesson takes new words only from itself. The backlog slot is dropped while the focus runs.
