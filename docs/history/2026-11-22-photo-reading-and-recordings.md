# Photo reading, check and recordings for new words

Date: 22 November 2026. Commits `7ee6aa6`, `bc55a65`, `23266b8`. Plus parts of `0327016` and `0335365`.

## Result

A child photographs a vocabulary page. The app reads the words, marks uncertain rows and shows the list for review. After that each French word gets a recording.

## Preparation: which model reads best?

Before the build, a test ran with three own photos (`tools/test_erkennung.py`).

- The smallest model (`gemini-flash-lite-latest`) was not reliable. On a skewed photo it shifted all translations by one row.
- Three larger Flash models read the pages without errors. In a second run of one of them, two entries merged into one.
- Reading each photo in **two** passes with a comparison caught this error. From this came the plan to mark differing rows in the review step.

Decision of the owner: accuracy counts more than price. The paid Gemini plan was activated the same day. The free plan allowed only 20 requests per day for the good models. Rejected tries with 503 counted too. Every test run costs money since then. Test runs stay small and state the number of requests first.

## Steps

1. **Upload photos, lessons per account** (`7ee6aa6`).
   - New accounts start empty. Each child photographs the own vocabulary. The owner decided this.
   - The browser shrinks the photo to 1600 pixels.
   - `POST /api/extract` reads each photo twice and compares.
   - Uncertain rows are yellow. Each word is editable in the list. Several pages can be collected into one lesson.
   - Lessons live per account in D1 and travel with the sync.
   - The photo is not stored. 30 photos per day are allowed per account.
   - The test link `/prefill` adds the two templates to a signed-in account.
   - Newly photographed words were spoken only by the device voice for now. This was explicitly temporary.
2. **Less CPU time in the Worker** (`bc55a65`).
   - One photo cost the Worker 22 ms. The free plan allows 10 ms. The browser now converts the image to Base64 itself.
   - The Worker builds the request to Gemini only once.
   - A failed reading is retried once on any failure. Before, this applied only to overload.
   - The timeout per reading dropped to 45 seconds.
   - An older app gets the hint to reload the page.
3. **Real recordings for new words** (`23266b8`).
   - The app announces the words of a lesson in the background. The Worker has each missing word spoken one by one at ElevenLabs and stores it in the EU bucket `travok-audio`.
   - Three new recordings per call, 400 per account and day, 200 characters per text.
   - Voice, model and speed are the same as in `tools/render_tts.py`.
   - The new UI speaks only French. No German recordings are created any more.
4. **Progress while reading** (part of `0327016`).
   - Gemini thinks only briefly (`thinkingLevel: low`). A photo takes 5 to 6 seconds instead of 17 to 37, with the same hit rate on the test photos.
   - The Worker passes Gemini's answer on piece by piece as NDJSON. The app shows a bar while sending and then the read words one by one with a counter.
5. **Check** (part of `0335365`).
   - A second model checks whether the word pairs fit together. It sees only the list, no photo. It only flags and changes nothing.
   - The review list appears at once. The check runs in the background.
   - Measured: 16 of 16 shifted rows found, no false alarm, 2 to 3 seconds.
   - The hints contain no example sentences and no text from "Merke" boxes.

## Compromises and temporary decisions

- **Short thinking** makes reading fast, but the check finds merged entries less reliably with it. The comparison of two readings partly covers this case.
- **Two readings cost double.** The owner accepts this for accuracy.
- **Recordings apply to all accounts.** A word is paid for once.
- One photo failed on the live site once and worked on the second try after 4 seconds. The cause is not clear. The retry on failure (step 2) now catches such cases.

## Learned

- On the live site the free plan limits CPU time per request. Work belongs in the browser if it can run there.
- Comparing two readings is a stronger safeguard than a larger model alone.
- A phone photo lies sideways without `imageOrientation: "from-image"`. The rotation exists only in the EXIF data. Re-encoding also removes the location.
