# More subjects than vocabulary

## Goal

A child should be able to learn for a test in any subject. The example: 13 pages of biology material and a test in two weeks. The app builds a learning plan from the material and trains the content.

Stage 1 (a second language, English) is done. See `docs/history/2026-11-26-english.md` and `docs/architecture/11-languages.md`.

## Why this is more than another language

Vocabulary is a list of pairs. The book already contains the list. Biology consists of terms, facts, processes and connections. Three things change.

| Part | Vocabulary today | Subject material |
| --- | --- | --- |
| Reading | The list is printed in the book. | The model has to choose what matters. |
| Tasks | Copy, gap word, free writing | Name the term, answer a question, put steps in order |
| Checking | Rules in the app, the referee only in doubt | A free answer always needs the model. |

What carries over unchanged: photos, boxes with spaced repetition, sync, accounts, the small celebrations and the test focus. The test focus is already a learning plan. It spreads the open cards over the days until the test and ends with a dress rehearsal.

## Stage 2: terms for any subject

From the material the app makes pairs of a term and a short explanation. About 40 pairs for 13 pages.

- The app shows the explanation. The child writes the term. The answer rules of today work for that.
- The other direction is a choice task: the app shows the term, the child picks the right explanation.
- A lesson gets a subject instead of only a language. A language is then one kind of subject.
- The detection step before the reading (`detectLang` in `worker/extract.ts`) grows into "which subject is this?". It proposes the subject, and the child confirms it on the review page.
- Each card names the page it came from. The child can delete cards and add own ones on the review page.
- No recordings for these cards.

Open questions:

- How does the model choose the terms? One request per page gives duplicates across pages. A first pass over all pages for an outline and a second pass per topic may be better.
- How long may an explanation be? The choice task needs four of them on a phone screen.
- The daily limit for photo reading is 30 per account. 13 pages in one go fit, two such imports on one day do not.

## Stage 3: questions with free answers and a plan by topic

- Card kinds: a question with a short free answer, a sentence with a gap, the steps of a process in the right order.
- The referee becomes the main check for free answers. Each card stores the key points a good answer needs. The referee compares the answer with these points.
- The plan knows topics. It first gives reading tasks like "Lies Seite 3 bis 5" and then the cards for that topic.
- Diagrams with labels are a separate problem and not part of this stage.

Open questions:

- Cost. Every free answer is a request to Gemini. Today the limit is 150 referee calls per account and day.
- Trust. A wrong verdict on a free answer is worse than on a single word. A self-check ("gewusst" or "nicht gewusst") with the key points shown is the cheap alternative.
- Honesty about the limit. Cards secure terms and facts. They do not replace understanding. The app must not promise more.

## Before stage 2: one experiment

Take real material, for example the 13 pages. Let the model produce cards with a draft prompt. Look at the cards together. This costs about 13 to 15 requests and no change to the app. The result decides whether the selection is good enough to build on.

The test photos stay out of the repository, like the vocabulary test photos.

## One question that decides the design

What does the test look like? If it asks for terms and short answers, stage 2 covers most of it. If it asks "Erkläre den Ablauf", it needs stage 3.
