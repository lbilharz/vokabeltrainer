# Photo reading and recordings

## Photo reading (`POST /api/extract`)

A child photographs a vocabulary page. The app reads the words and shows them for review.

### Flow

1. The browser shrinks the photo to 1600 pixels on the long edge and encodes it as JPEG (`src/lib/image.ts`). This also removes all EXIF data, including the location.
2. The browser converts the image to Base64 itself and sends it as JSON.
3. The Worker first asks a small model for the language of the page (see `11-languages.md`). Then it reads the photo **twice** in parallel at Gemini (`gemini-3.8-flash`, `thinkingLevel: low`).
4. `mergeReadings` (`shared/extract.ts`) merges the two readings. Where they differ, the entry has `check: true`. The row appears yellow.
5. The Worker passes the answer on as an NDJSON stream. The app shows a bar while sending. Then the words appear one by one with a counter.
6. A check (`POST /api/check`) runs in the background. The review list appears at once.
7. The child reviews the list. Each word can be edited. Then the child saves the lesson.

Up to six images are read one after another and collected into one lesson. The app names the image that failed.

### Decisions

**Two readings and a comparison.**
Reason: In a test one model merged two entries into one in a single run. Comparing two readings catches such errors. The child then sees yellow rows and reviews only those.
Trade-off: Each photo costs two requests to Gemini, up to four with retries. The language detection and the check come on top.

**Short thinking (`thinkingLevel: low`).**
Reason: Copying a book page needs little thinking. Measured on 22 November 2026: 5 to 6 seconds per photo instead of 17 to 37, with the same hit rate on the test photos.
Trade-off: With short thinking the check finds merged entries less reliably (see below).

**Model choice by accuracy, not by price.**
The smallest model (Flash Lite) was not reliable. On a skewed photo it shifted all translations by one row. The larger Flash models read the test pages without errors, except for one run. The model is set in one place (`GEMINI_MODEL` in `worker/extract.ts`). The script `tools/test_erkennung.py` compares models on own test photos.

**The image arrives as Base64 from the browser.**
Reason: One photo cost the Worker 22 ms of CPU time. The free plan allows 10 ms. Converting in the browser saves CPU time. The Worker builds the request to Gemini once and uses it for both readings.

**A stream instead of one answer.**
Reason: The child sees real progress and does not wait at an empty page. The Worker extracts the complete headwords from the partial JSON (`partialWords`).

**Retry on failure.**
A failed reading is retried once as long as no text has arrived. The timeout per reading is 45 seconds. If only one reading succeeds, the Worker returns it. Then no row is marked uncertain (`readings: 1`).

**The photo is never stored.**
It goes only to Gemini and is gone afterwards.

### Check (`POST /api/check`)

A second model checks only the list. It sees no photo.

- It knows three kinds of errors: `schreibweise`, `passt_nicht`, `verschmolzen`.
- It **only flags and changes nothing.** The book is right, not the model.
- Suspicious rows turn yellow. The reason appears as a question.
- The prompt says what is not an error: placeholders, explanations for proper names, short forms. In doubt it flags too little rather than too much.
- Measured on 22 November 2026: 16 of 16 shifted rows found, no false alarm, 2 to 3 seconds. It does not reliably find merged entries with short thinking.

### Input structure

- The rules are in the prompt (`PROMPT` in `worker/extract.ts`). The answer is bound to a fixed schema.
- The prompt knows details of the school book pages: notes in `n`, section headings in `c`, the mark for passé composé with être, no example sentences.
- The Worker cuts each read entry to the sync limits and drops empty entries. A page has at most 200 entries, a lesson at most 400.
- Foreign text and rules are kept apart, see `08-cost-and-safety.md`.

## Recordings

The app speaks the foreign word with a recording. If there is none yet, the device voice speaks.

### Two sources

- Bundled files under `public/audio/<fr|de>/<hash>.mp3`. They belong to the templates. `public/audio/index.json` lists them.
- Recordings for photographed words under `GET /api/audio/<fr|en>/<hash>.mp3`. They live in R2 and apply to all accounts. Each language has its own folder.

### Flow for photographed words

1. After a lesson is saved, the app announces its words in the background (`POST /api/audio/ensure`). One call carries the texts of one language and names it in `lang`.
2. The Worker checks which files are missing in R2. It renders at most three new recordings per call at ElevenLabs.
3. The Worker stores each file in R2. The answer names `ready` and `pending`, and on a stop also `stopped` (`limit`, `unconfigured` or `failed`).
4. The app announces what is in `pending` again. On `stopped` or an error it waits five minutes.
5. The recordings are loaded into the service worker cache in the background. So they play offline too.

The file name is computed from the text. `fnv1a` and `sayText` are in `shared/text.ts` and in `tools/render_tts.py`. Both must match.

### Decisions

**Render each recording alone.**
Reason: The first version was made in blocks with pauses. The voice then spoke at list speed, almost twice as fast. One recording per request at speed 0.95 sounds calmer. Single words end with a full stop. That gives a natural stress.

**Only the foreign language is recorded.**
The UI never speaks German. So no German recordings are created any more. The old German files remain in `public/audio/de/`.

**One native voice per language.**
Reason: The model guesses the language from the text. A French voice may read a word like "table" the French way. A voice whose mother tongue is English reads it the English way. The English voice is British, like the school books.

**Recordings apply to all accounts.**
Reason: A word is paid for once. Recordings contain only vocabulary and no data about children. So `GET /api/audio/<lang>/...` needs no login.

**Range requests.**
Safari asks for audio in parts. The Worker and the service worker answer `Range`.

**The device voice stays as a fallback.**
Safari allows it only directly inside a click and not after a failed load. So the app keeps the list of existing recordings in memory. It decides synchronously which source to use.

### Limits

400 new recordings per account and day, 1000 for all. At most 200 characters per text and at most 10 texts per call (`worker/audio.ts`, `worker/usage.ts`).

### Voice and model

The voices (one per language), the model (`eleven_multilingual_v2`), format and speed are in `worker/audio.ts`. `tools/render_tts.py` holds the same values for French. Change both together.
