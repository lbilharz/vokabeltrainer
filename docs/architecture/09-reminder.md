# Daily reminder

A child can be reminded every day. The child chooses the way. Both ways are in the settings.

## Way 1: Notification from the app (Web Push)

Code: `worker/push.ts`, `shared/reminder.ts`, `src/lib/push.ts`, `public/sw.js`.

1. The device registers at the push service of its maker and gets an address (endpoint).
2. The app sends the endpoint and the time to `PUT /api/push`. The time is in steps of 15 minutes from 7:00 to 21:45. The default is 17:00.
3. The cron of the Worker runs every 15 minutes (`runReminders`). It checks the time in Berlin and selects the subscriptions of the current quarter hour.
4. The server sends only if **cards are waiting** and the child **has not practised that day** (`shouldRemind`).
5. The signal has **no content**. The service worker shows the text "Zeit für deine Vokabeln" itself.
6. An endpoint that answers 404 or 410 is deleted. At most one send per day (`last_sent_day`).

Other endpoints: `GET /api/push/key` (public key), `POST /api/push/state`, `DELETE /api/push`.
The private key (`VAPID_JWK`) is a secret. `node tools/make_vapid.mjs` creates the pair and does not display it. The script aborts if a key exists, because a new pair invalidates all reminders.

## Way 2: Calendar entry

`GET /api/reminder.ics` returns a daily calendar entry. The server stores nothing for it. The time has no time zone and applies in the local time of the device. The id of the entry is fixed. Adding it again replaces the old one.

## Decisions

**Both ways, push as the first choice.**
Reason: The owner had data protection concerns about push through the server. The calendar way needs no server state. Push is more convenient because it comes only when cards are waiting and nothing was practised. The calendar reminds every day.

**Signal without content.**
Reason: Apple and Google learn nothing about the child or the learning state.

**Cron in UTC, Berlin time in the code.**
Reason: Crons run in UTC. The code computes local time itself (`berlinNow`). Nobody has to think about daylight saving time twice a year.

**Quarter hours instead of full hours.**
The first version checked hourly. The schedule was shortened to 15 minutes so the child can choose the time more exactly. The column `minute` came with the migration `0004_push_minute.sql`.

## Limits

- A device can use push only if the app is installed (home screen).
- At most 200 subscriptions per run (`MAX_PER_RUN`).
- Push through Apple was confirmed on an iPhone. The calendar link inside the installed app was only checked locally (see `docs/plan/open-checks.md`).
