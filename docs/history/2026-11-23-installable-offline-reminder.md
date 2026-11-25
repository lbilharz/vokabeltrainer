# Installable app, offline start and reminder

Date: 22 and 23 November 2026. Commits `48af3b2`, `0327016`, `0335365`, `a8020db`.

## Result

The app can be put on the home screen and starts offline. A child can be reminded daily, by notification or by calendar entry.

## Steps

1. **Installable and offline** (`48af3b2`).
   - Manifest and icons. From the home screen the app runs without an address bar.
   - A hand-written service worker (`public/sw.js`) keeps the app files and the recordings. It also answers `Range` requests.
   - The app remembers who was signed in and starts with that without a connection.
   - The recordings of the own words are preloaded in the background.
   - When the network returns, the progress goes to the server.
   - On upload up to six images can be chosen at once.
2. **Reminder, rename lesson** (`0327016`).
   - Notification from the app: a cron checks the Berlin time hourly and sends an empty signal. It comes only if cards are waiting and nothing was practised that day.
   - Or a daily calendar entry on the device through `/api/reminder.ics`. The server stores nothing for it.
   - The default is 17:00. `tools/make_vapid.mjs` creates the key pair and does not display it.
   - A lesson can be renamed with a pencil next to the name. Stations without a heading are called "Teil 1", "Teil 2". Before, all entries got the name of the first heading.
3. **Reminder in quarter hours, "Weiter" stays visible** (`0335365`).
   - The time can be chosen in steps of 15 minutes, from 7:00 to 21:45. The cron runs every 15 minutes. Migration `0004_push_minute.sql`.
   - The feedback while practising sticks to the bottom edge. "Weiter" is always visible. Long memory hints are cut to three lines.
4. **The "Keine Verbindung" incident** (`a8020db`). See below.

## Why the reminder has two ways

The owner had data protection concerns about push through the server. The notification runs over the services of Apple and Google. So the server sends an empty signal. The text is fixed in the service worker. These services learn nothing about the child.
The calendar entry needs no server state at all.
The owner decided: both ways, push as the first choice. Push comes only if there is something to practise. The calendar reminds every day.

Push through Apple works on a real iPhone. The owner confirmed this on 23 November 2026.

## The "Keine Verbindung" incident

**What happened:** On the second start without network, a child saw only the text "Keine Verbindung.".

**Cause:** The phone briefly had no network. The app had not yet stored a copy of itself. The copy was created only at the second start.

**Fix** (`a8020db`), three parts:
- The service worker loads page, script, stylesheet and font into the cache at install (`preload`).
- If the network does not answer after 3 seconds, the stored page starts.
- If both fail, a notice page appears with "Noch einmal versuchen". It reloads as soon as the network is back.

**Learned:** An app that should start offline must store itself at the first visit and not only at the second.

## Compromises and temporary decisions

- If preloading fails, the app still runs. It just does not start offline yet.
- Without network, reading photos and signing in anew do not work.
- Not checked on a real device, only locally: the calendar link inside the installed app and the start in flight mode. See `docs/plan/open-checks.md`.

## Learned

- After a browser test, `localStorage` must be cleared **and** the page reloaded. Otherwise the running app writes its state back.
- The Vite dev server sometimes hangs after `npm run build`. Then restarting the preview helps.
- Requests from iPhones come through Apple's private relay. Addresses in the log do not identify a device. To know who did something, look in the database (card changes per account).
- Apple does not allow a home screen web app on the "Always Allowed" list of Screen Time. This is one reason for a native app (see `docs/plan/app-store.md`).
