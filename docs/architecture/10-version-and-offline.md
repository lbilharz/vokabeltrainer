# App version, updates and offline

## Service worker (`public/sw.js`)

The service worker lets the app start offline and plays recordings. It is written by hand, without a library.

| Request | Rule |
| --- | --- |
| Page load (`navigate`) | Network first. If it does not answer within 3 seconds, the stored page starts. If there is none, a notice page appears. |
| `/assets/` | Files with a hash in the name. Once loaded, always from the cache. |
| Recordings (`.mp3` under `/audio/` or `/api/audio/`) | Once loaded, always from the cache. The cache holds the whole file. Parts (`Range`) are cut from it. |
| `/api/` | Never from the cache. |
| Other | Network first, else cache. |

- **At install** it loads the page, script, stylesheet and font into the cache (`preload`). So the app starts offline after the first visit.
- The cache `shell-v1` holds the app. The cache `audio-v1` survives an app update.
- Only an HTML answer is stored as the start page.
- It shows the notification of the daily reminder (see `09-reminder.md`).
- The app remembers who was signed in. With that it starts without a connection.

Two things do not work offline: reading photos and signing in anew.

**Decision:** The network has priority for page loads.
**Reason:** A new version should arrive at once.
**Trade-off:** On a slow network the start waits up to 3 seconds before the stored page starts.

## Version of app and server (`shared/version.ts`)

Each build gets a UTC timestamp as version, for example `20261123.160500`. Vite sets it at build time (`vite.config.ts`). App and Worker carry the same version. Later built means larger. So versions can be compared as text. In development and tests it is `dev`.

- The app sends its version in the header `x-app-version`. The server answers with its own.
- If another version asks, the log says so. The header comes from outside and reaches the log only if it looks like a version.
- If the server knows a newer version, the app loads it (`src/lib/version.ts`). This happens only on the start page and by itself only once per version. An entry in `sessionStorage` prevents a loop.
- Before reloading, the app puts the new page into the service worker cache. The reload finds it there even on a slow network.
- The settings show the app state as a date in German time. A button asks the server for its version. On a button press an earlier try does not count.

**Reason:** After an update the app sometimes still showed the old version for one more start. On the server it was not visible which version asked.
**Trade-off:** An update needs one network call. Offline, the old version stays, and the next start tries again.

A writing request that is not JSON gets status 415 and the hint to reload the page (`worker/index.ts`). This also covers a very old app that sent the raw image to `/api/extract`.
