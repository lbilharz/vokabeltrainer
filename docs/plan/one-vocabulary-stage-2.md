# One vocabulary, stage 2

Status: planned. Stage 1 is done (`docs/history/2026-11-24-one-vocabulary-and-test-focus.md`).

## Goal

All words of a child form one real shared vocabulary.

1. **Recognise known words across lessons.** If a new lesson contains a word the child already knows, the app should take over its state. It should not show it as a new word.
2. **Add photos to an existing lesson.** Today each photo creates a new lesson.

## Why this does not work yet

The card id is `${setId}:${fnv1a(fr)}` (`itemId()` in `shared/text.ts`). It depends on the lesson. So the same word in two lessons is two cards with separate state.

Stage 2 needs **new card ids**. They must no longer depend on the lesson.

## Open questions

- What does the new id look like? Is the French word alone enough? There are entries with the same headword and a different meaning.
- How does existing progress move to the new ids? The table `cards` holds cards with the old id. Old devices keep writing old ids at sync.
- What happens if the same word has different translations in two lessons?
- What does sync with a device that does not know the new id look like? `docs/architecture/03-sync.md` describes today's sync.
- Where do hints and recordings attach? Recordings already apply per text.
- How does this affect the test focus? It names the sure words by card id (`docs/architecture/07-lessons-and-test-focus.md`).
- How is a photo added to an existing lesson? Today the app collects several images into one lesson before saving.

## After the work

The architecture of lessons and sync changes. `docs/architecture/` must be updated for it.
