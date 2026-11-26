# Study cards with self-check

26 November 2026, the same day as English (`2026-11-26-english.md`).

## Why

A child had a biology test in the following week. The material was ten photos: handwritten notes, a mind map, a labelled sketch and printed worksheets, photographed from a tablet screen. The question was whether the app could turn this into something to practise. The plan had this as stage 2 and 3, for later. The date of the test moved it to now.

## Steps

1. **Experiment first.** A script sent the ten photos to the model with a draft prompt and no change to the app. Result: 33 cards, nothing invented in a spot check of three pages, 11 to 32 seconds per page. The findings are in `docs/plan/subjects.md`.
2. **Change of plan.** Only 8 of the 33 cards were terms. The rest were questions with free answers. The planned first stage ("terms only, typed") would have covered a quarter of the material.
3. **Smallest version that helps for the test.** Every card is practised by self-check: see the front, reveal the back, tap "Gewusst" or "Noch nicht". No typing, no model while practising.
4. **Detection.** The step that detects the language now also answers "study material". The same request then makes cards instead of reading vocabulary.
5. **Review page.** Cards are grouped by photo, with the quote from the page. A whole page can be removed.
6. **Practice screen.** A new task kind `recall`. The next card comes at once, the feedback sheet only for a streak or "Das sitzt jetzt.".

7. **First real use, first fix.** A card asked "Welche Bereiche und Strukturen des Gehirns sind in der Skizze beschriftet?". Without the sketch that is nonsense. The prompt now demands that every card makes sense without the page. A retest on four pages gave no card that points at the page.

## Decisions and reasons

- **Reuse the vocabulary entry fields.** Sync, boxes, stations, daily plan and test focus work unchanged. That made the change small enough for one evening.
- **Self-check for all cards, also for terms.** Typed terms need German answer rules. That was not needed to be ready for the test.
- **The tested prompt went into the Worker almost word for word.** Only two lines about the length of subject and topic were added.
- **The quote is shown in the review and not stored.** It is only needed to check a card once.

## What was tested

- Two of the ten photos through the local Worker: both detected as study material, subject "Biologie", 6 cards and 1 card.
- A practice round in the browser at phone width with a card lesson and a French lesson in one account: reveal, "Gewusst", "Noch nicht", the streak sheet after three, a wrong card coming back at the end, a French card in the same round.
- 318 tests pass, 3 of them new.

## Compromises and open points

- The review page for cards was not tested in a browser. The test stored the cards through the sync route.
- No test on a real phone.
- Many UI texts still say "Wörter" and "Wortschatz" for cards.
- Ten photos take several minutes, one after another.
- One card from the local run added a few words that were not on the page.
- The open work is listed in `docs/plan/subjects.md`.

## Learned

- Twenty minutes with real material changed the plan more than the planning before it.
- A hard date is a good filter. It left self-check and removed everything that needed a model at practice time.
