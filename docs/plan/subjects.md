# More subjects than vocabulary

## Goal

A child should be able to learn for a test in any subject. The example: 13 pages of biology material and a test in two weeks. The app builds a learning plan from the material and trains the content.

## Why this is more than another language

Vocabulary is a list of pairs. The book already contains the list. Biology consists of terms, facts, processes and connections. Three things change.

| Part | Vocabulary today | Subject material |
| --- | --- | --- |
| Reading | The list is printed in the book. | The model has to choose what matters. |
| Tasks | Copy, gap word, free writing | Name the term, answer a question, put steps in order |
| Checking | Rules in the app, the referee only in doubt | A free answer always needs the model. |

What carries over unchanged: photos, boxes with spaced repetition, sync, accounts, the small celebrations and the test focus. The test focus is already a learning plan. It spreads the open cards over the days until the test and ends with a dress rehearsal.

## Built so far

- Stage 1: a second language (English). See `docs/history/2026-11-26-english.md`.
- A first version of study cards with self-check, built on 26 November 2026 for a real biology test the week after. See `docs/architecture/12-study-cards.md` and `docs/history/2026-11-26-study-cards.md`.

## What is still open

- **Terms that the child types.** A card whose back is a single term could be typed and checked with the answer rules. That needs German as a language for the rules.
- **Free answers judged by the referee.** Each card already stores the key points. The referee could compare an answer with them. Open: the cost per answer, the daily limit of 150 referee calls, and trust in the verdict.
- **A plan by topic** with reading tasks like "Lies Seite 3 bis 5" before the cards of that topic.
- **Labelled sketches** as a labelling task.
- **Pages in parallel.** Ten photos take several minutes one after another.
- **Words in the UI.** "Wortschatz", "Wörter" and "Neue Vokabeln" do not fit card lessons.
- **Adding photos to an existing lesson.** Today a second batch becomes a second lesson.
- **Honesty about the limit.** Cards secure terms and facts. They do not replace understanding.

## The experiment (26 November 2026)

Ten photos of real material for one biology test went through a draft prompt, one request per photo to `gemini-3.8-flash`. The material was mixed: handwritten notes, a mind map, a labelled sketch, printed worksheets. All of it was photographed from a tablet screen, partly rotated.

Result: 33 cards, 11 to 32 seconds per photo.

What worked:

- The model read handwriting and rotated pages. A spot check of three pages found no invented content.
- Every card carried a short quote from the page as proof. That makes a review by the child possible.
- The model made no cards from a worksheet that only held instructions and measured values.
- It named unreadable spots instead of guessing.

What did not work yet:

- **Other subjects slipped in.** Two pages were about dreams and belonged to psychology or ethics. The model made cards from them. The child has to be able to drop a whole page.
- **Trivia.** Single numbers and side remarks became cards. Nothing tells the model what the teacher finds important.
- **A labelled sketch became one question** that asks for all eight labels. A labelling task would fit better. That is not planned before stage 3.
- **The notes of a student can be wrong or thin.** The model copies them faithfully. The app then trains the mistake.
- **Few cards of the kind "term".** 8 of 33. Most material leads to questions with free answers. So stage 2 alone covers only a small part of real material.

Conclusions:

- The selection is good enough to build on. The review page is the important safety net.
- "Terms first, questions later" does not fit real material. It needs questions with free answers from the start. So the first version uses self-check for every card.
- The test photos and the cards are in the ignored folder `tools/testfotos/bio/`.
