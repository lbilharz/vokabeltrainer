# App version and updates

Date: 23 and 24 November 2026. Commits `632465b`, `4c2a372`.

## Result

App and server know their version and tell each other. The app reloads itself if the server has a newer version. The settings show the state and have a button to look for a new version.

## Problem

After an update the app sometimes still showed the old version for one more start. The child needed a second start to see the new one. On the server it was also not visible which version was asking.

## Cause

The explanation follows from the code of the service worker (`page()` in `public/sw.js`). Page loads ask the network first. If it does not answer within 3 seconds, the stored page starts. The late answer still lands in the cache. It is visible only at the **next** start. On a slow network, or right after a deployment, the old version therefore runs for one more start.
This is the explanation from the code. It was not proven in an individual case.

The service worker stayed as it was on this point. The wait of 3 seconds protects against a hanging start (see `2026-11-23-installable-offline-reminder.md`).

## Steps

1. **Version in the header** (`632465b`).
   - Each build gets a UTC timestamp as version. App and Worker carry the same one.
   - The app sends its version in the header `x-app-version`. The server answers with its own.
   - If another version asks, the log says so.
   - If the server knows a newer version, the app loads it. This happens only on the start page and only once per version.
2. **Version in the settings** (`4c2a372`).
   - The settings show the state of the app as a date in German time.
   - A button asks the server for its version. If it is newer, the app loads it at once. Otherwise it says that everything is current.
   - On a button press the earlier try does not count. By itself it stays at one try per version.
   - A test sheet for photo reading was added (`tools/testblatt.html`), compiled by hand. It needs no school book.

## How the version solves the problem

The app notices from the header of any answer that the server is newer. Then it fetches the new page with `fetch("/", { cache: "no-store" })` into the service worker cache and reloads. The reload finds the new page in the cache even on a slow network. The child no longer needs a second start.

## Compromises

- **One try per version by itself.** It is noted in `sessionStorage`. So there is no loop if the reload brings the old version again. Without storage the app does not reload by itself.
- **Only on the start page.** In the middle of an exercise the app does not reload.
- **The version is a timestamp.** That is simple and enough. There is no version number.
- The comparison is a text comparison. `dev` and an unknown version never count as newer.

## Learned

- A version in both directions (request and answer) makes debugging easier. The log shows which version is in circulation.
