# Study cards for other subjects

A lesson can hold study cards instead of vocabulary. The example is material for a biology test: handwritten notes, a mind map, worksheets.

## What a card is

- A card has a front and a back. The front is a question or a short explanation. The back is the answer or the term.
- A card lesson has `kind: "cards"` and a `subject` like "Biologie" in its data (`SetData` in `shared/types.ts`).
- The fields of an entry are reused: `de` is the front, `fr` is the back, `n` holds the key points of a good answer, joined with " · ". `c` is the topic of the page and becomes the station.
- The card id contains front and back, because two questions can have the same answer (`buildSets` in `src/data/sets.ts`).
- The unit is "Karte" and "Karten".

**Decision:** Card lessons reuse the entry fields of vocabulary.
**Reason:** Sync, boxes, stations, the daily plan and the test focus then work without a change. The first version had to be ready within days for a real test.
**Trade-off:** The field names fit even less than before. Some UI texts still say "Wörter" for cards.

## From photo to cards

1. The detection step before the reading answers `sachtext` for study material (`detectPage` in `worker/extract.ts`). See `11-languages.md` for the language case.
2. The large model then gets one request with the photo and makes cards (`readCards`). It returns the subject, the topic, the cards and for each card a short quote from the page.
3. The answer arrives in the same stream as a vocabulary reading, with `kind: "cards"`. There are no partial words. A page takes 10 to 40 seconds.
4. The review page groups the cards by photo. Each card shows the quote ("Auf der Seite steht: ..."). The child can edit every text, remove a card or remove a whole page.
5. The quote is not stored with the lesson. It only serves the review.

Rules of the prompt: take only what is on the page, invent nothing, make no card from an unreadable spot, no cards from instructions, measured values, names or dates.
Every card must make sense without the page, because the child does not see the photo while practising. So a card never says "in der Skizze" or "laut Text". A labelled sketch becomes a question for the parts and names how many are wanted.

A lesson holds either vocabulary or cards. The first photo decides. A photo of the other kind is rejected with a message.
Up to ten photos are read in one go, one after another.

**Decision:** The selection of the model is a proposal. The child confirms it.
**Reason:** The model does not know what the teacher finds important. In the experiment it also made cards from pages of other subjects and from side remarks. The quote makes the check quick.

## Practising a card

The task kind is `recall` (`shared/session.ts`). A card lesson knows no other kind.

1. The child sees the front and thinks.
2. "Antwort zeigen" reveals the back and the key points.
3. The child taps "Gewusst" or "Noch nicht". That is the rating.

- "Gewusst" moves the card up one box. "Noch nicht" moves it to box 1 and puts it at the end of the round again.
- The next card comes at once. The feedback sheet only appears when there is a streak or a "Das sitzt jetzt." to show.
- The first reveal of a card counts as a new card of the day. Cards have no introduction step.
- For the test focus "Gewusst" makes a card sure, like a correctly written word (`WRITTEN_KINDS` in `shared/focus.ts`).
- Cards are never read aloud. No recordings are made for them.
- No request to a model happens while practising.

**Decision:** Self-check instead of a typed answer.
**Reason:** A free answer needs a model to judge it. That costs a request per answer and can be wrong. Self-check costs nothing and works offline.
**Trade-off:** A child can tap "Gewusst" without knowing the answer. The app trusts the child.

## Limits

- The lesson list names the subject of a card lesson, for example "Biologie · heute fotografiert". Home and other screens still use "Wortschatz" and "Wörter".
- A labelled sketch becomes one question that asks for all parts by name. There is no labelling task, and the app does not keep the picture.
- The notes of a student can be wrong or thin. The model copies them. The app then trains them.
- The model sometimes adds a few words that are not on the page. The prompt forbids it, the review page is the safety net.
- An older app version shows a card lesson as vocabulary and would ask the child to type the answers.
