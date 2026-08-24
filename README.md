# Flag Stats — Live Tracker

A single-file web app for **live play-by-play stat tracking** in 5v5 flag football
(IFAF rules: 4 downs to reach midfield, 4 more to score). Built for logging on a
phone or tablet at the sideline. Works fully offline, stores each game locally on
the device, and exports JSON/CSV so you can combine games across devices into
tournament-wide stats.

No build step, no dependencies — it's just `index.html`.

---

## Deploy to GitHub Pages

You get a public URL you can open on any device. Two ways:

### Option A — GitHub Actions (recommended, auto-deploys on every push)

1. Create a new GitHub repo and push these files to the `main` branch.
2. In the repo: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. That's it. Every push to `main` redeploys automatically (see the included
   `.github/workflows/deploy.yml`). The live URL appears under **Settings → Pages**
   and in the Actions run summary. It looks like:
   `https://<your-username>.github.io/<repo-name>/`

### Option B — Deploy from a branch (no Actions)

1. Push these files to `main`.
2. **Settings → Pages → Source → Deploy from a branch → `main` / `/ (root)` → Save.**
3. Wait ~1 minute, then open the URL shown on that page.

> First deploy can take a minute or two. After that, updates are near-instant.

### Quick push from your machine

```bash
git init
git add .
git commit -m "Flag Stats app"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

---

## Install on a phone / tablet (offline app)

Once the Pages URL is open in a browser:

- **iPhone/iPad (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** menu (⋮) → **Add to Home screen** / **Install app**.

It then launches full-screen like a native app and works with no connection.
The app caches itself on first load; when you're online it always pulls the
newest version, and offline it falls back to the last cached copy.

---

## Using it

- **Teams & Games** — add teams (type players in or paste a roster), then create a
  game. A **Load tournament teams** button seeds the seven Nations Cup Prague teams
  (Ireland, Finland, Sweden, Ukraine, Poland, Czechia, Switzerland) with placeholder
  rosters for testing — swap in real players via Edit.
- **Live** — tap PASS/RUN, pick the player, then **drag or tap the field** (or use
  Numbers mode) to set where the play ended. Handles completions, incompletions,
  interceptions, sacks, penalties (incl. half-the-distance), touchdowns with
  missed-flag tracking, and PAT/2-pt conversions with player attribution.
  **Undo** reverts the last play; **Log** shows the full play-by-play where any
  play can be edited (players, spot) or deleted; **Fix** manually corrects
  possession/spot/down/score after missed plays; **Stats** shows the live box
  score with QB efficiency (rating, comp %, yds/att) and team drive summaries
  (pts/drive, avg start, 4th-down conversions), plus a shareable **Game report**
  (copies to clipboard + downloads as text).
- **Options** (in Teams & Games) — optional **game clock** (half + running time
  stamped on every play), **larger buttons** for cold hands, and **spotter mode**
  (fastest logging: auto-saves on spot, skips all optional attribution).
  The screen stays awake automatically while the app is open.
- **Tournament** — load the exported JSON from each game to see the **standings
  table** (W/D/L, win percentage, goal difference) and combined leaderboards, and export
  everything as CSV.

### Where's my data?

Each game is stored in that device's browser (`localStorage`) under this site's
URL. It stays put across reloads and offline use. To move a game to another device
or combine games, use **Export** (JSON) and load them in the **Tournament** tab.

> Because storage is per-URL, keep using the same Pages URL. Clearing browser data
> for the site, or using private/incognito mode, will remove locally stored games —
> export anything you want to keep.

---

## Forcing an update on devices

The app is network-first, so an online device gets the latest automatically on
reload. If a device seems stuck on an old version (offline cache), bump the
`CACHE` version string in `sw.js` (e.g. `flag-stats-v1` → `flag-stats-v2`) and push.

---

## Files

```
index.html                     the entire app
manifest.webmanifest           makes it installable (name, icons, colors)
sw.js                          service worker for offline use
icons/                         app icons
.github/workflows/deploy.yml   auto-deploy to GitHub Pages
```

## License

MIT — see `LICENSE`.

## Live sync — keeper links

Reads are public (scores are public data); **writes require a keeper key** that
arrives via a magic link and then lives on the device. Spectators and viewer
phones open the plain app URL and can never write.

Configure once:
1. In the Cloudflare worker, set a variable **KEYS** with a JSON map of
   key → device name, e.g.
   `{"f1-7kq2m9x4":"field1","f2-3vp8n5t1":"field2","hub-9rw4c6z8":"hub"}`
   (invent your own random keys). The old TOKEN variable can be deleted.
2. Send each device its keeper link: `<app-URL>#k=<its-key>` — opened once,
   the key is stored and the URL is cleaned. Options shows "Keeper link active".
3. Each key can only write its own device namespace (enforced server-side), so
   a leaked Field 1 key can never touch Field 2's games. Rotate a key by editing
   KEYS and re-sending one link — **no app redeploy needed**.

Without a `LIVE_CONFIG`, the app falls back to a manual JSONBin mode
configurable in Options (API key + bin IDs per device).

## Automation

- **Device check** (Teams & Games → Tournament readiness): one tap verifies relay,
  keeper key, offline cache, schedule, rosters, field filter and clock.
- **Practice game**: rehearse logging; never broadcast, excluded from bundles and
  standings, one-tap delete.
- **Rosters via relay**: enter squads once → Publish (live) → Fetch (live) on the
  other devices. Paste-import accepts "12 Anna Meier" lines.
- **Sunday bracket**: Tournament tab → button under the standings creates the three
  QFs with correct seeds and field labels.
- **Worker auto-deploy**: fill in `wrangler.toml` (KV id) and add the two GitHub
  secrets described there — every push touching `worker.js` then deploys it.
- **Keeper-link QR sheet**: `python3 make_keeper_qr.py <app-url> <key1> <key2> <key3>`
