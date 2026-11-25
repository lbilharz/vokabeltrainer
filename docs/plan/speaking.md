# Speaking exercise with speech recognition

Status: wanted, planned for "version 2". There is no code.

## Goal

The child speaks the word. The app listens and judges the pronunciation or the word.

## Decisions

- The owner wants speaking with speech recognition. It comes later on purpose ("version 2").
- Listening tasks do not show the word. This is already done (`listenChoice`, `listenType`).

## Open

- Which recognition? The one in the device or a service through the Worker. A service costs money and needs limits like the others (see `docs/architecture/08-cost-and-safety.md`).
- What happens to the recordings of the children? They should not be stored, like the photos.
- How is it judged: only the word or also the pronunciation?
- Where does the exercise sit in the ladder (`docs/architecture/04-learning-logic.md`)? Does it count for the box?
- How does the app react if recognition is not available?
