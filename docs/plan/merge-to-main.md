# Move `neue-oberflaeche` to `main`

Status: planned.

## Starting point

- `main` still holds the old app: one `index.html`, with `vercel.json`. It was the live deployment at Vercel.
- `neue-oberflaeche` holds the new app and the Worker. It runs live at `https://vok.cards`, deployed with `npm run deploy`.
- `vercel.json` is removed on the branch.

## Goal

`main` holds the state of `neue-oberflaeche`. After that there is one main branch.

## Open

- What happens to the old Vercel deployment? It hangs on `main` and could not build the new app.
- Whether progress from the old app should be taken over. The old app is on another address. `localStorage` applies only per address. A way for this would have to be built.
- How the merge runs: as a pull request, squashed or with the whole history.
- Whether `public/audio/de/` stays. The new UI speaks only French.
- The docs belong to the same pull request (`AGENTS.md`).
