# The old app and its recordings

Period: 13 June 2026 to 21 November 2026. Commits `00fa861` to `f188dde`. This state is still on `main`.

## Result

One static `index.html` for practising vocabulary. It had cards, boxes and voice recordings. It ran as a Vercel deployment.
The new UI (see `2026-11-22-new-ui-and-worker.md`) replaces it on the branch `neue-oberflaeche`.

## Steps

1. **13 June:** First version as a static HTML app. Then a fix: in writing mode the solution was visible at once. New were a list with a filter and a form for own sentences (stored in `localStorage`).
2. **14 June:** Leitner with five boxes and intervals of 0, 1, 2, 4 and 7 days. This was chosen for a short learning cycle of one week. Old progress went to box 4. A wrong card came back in the same pass.
3. **14 June:** The progress bar counted only cards from box 4. On day one it always showed 0. Now each box counts proportionally, and "in Arbeit" counts the started cards.
4. **14 June:** Natural voices from ElevenLabs for French and German. All cards were rendered to mp3 in advance. The file name is an FNV-1a hash of the text. So playback survives a new order. Own sentences fall back to the browser voice.
5. **15 June:** Fix for Safari. There the device voice may start only directly inside a click. The fallback after a 404 came too late. The app now decides synchronously from a list of existing recordings.
6. **15 June:** Icon and favicon.
7. **21 November:** New vocabulary set "Unité 2" from the school book, switchable, with its own progress. The old progress and the own sentences moved into the set "Sätze". In writing mode placeholders such as `qn/qc` and `+ inf.` were optional. The iPhone keyboard apostrophe is accepted. `tools/render_tts.py` renders missing recordings.
8. **21 November:** 86 recordings for the new set (each word in French and German).
9. **21 November:** All recordings were created again one by one (see below).

## Compromises and temporary decisions

- Progress lived only in the browser. There was no server and no account.
- The recordings were rendered in advance and live in the repository. They belong only to the bundled sets. New words had no recording in the old app.
- The device voice remains the fallback to this day.

## Learned

- **One recording per request.** The first version of the 86 recordings was made in blocks with pauses and then cut. The voice spoke at list speed, almost twice as fast as single words. So all files were created again one by one at speed 0.95. Single words end with a full stop. 15 files had an abrupt start and got 60 ms of silence in front. The full stop and the speed apply in the Worker to this day.
- The voice does not read placeholders. "(sich) ändern" is spoken as "sich ändern" (`sayText`).
