# SWGOH::RESOURCES — Event Schedule

Day-by-day Star Wars: Galaxy of Heroes event schedule (GAC, Territory War,
Territory Battle, Conquest, Marquee, fleet ships). Static site, hosted on
GitHub Pages.

## Structure

- `index.html` — schedule page, markup only (no inline CSS/JS).
- `404.html` — not-found page (GitHub Pages serves it automatically).
  Root-absolute asset paths so it works from any bad URL.
- `assets/css/main.css` — all styles.
- `assets/js/config.js` — **edit this when a new Era begins.** Era name,
  era start date, changeover hours, GAC cycle start, datacron sets,
  marquee names, episode overrides, monthly fleet days, boss loop,
  icon/category maps. No DOM, no logic. Mistakes here are reported by
  `validateScheduleConfig()` (see `assets/js/time.js`) as console
  warnings on page load.
- `assets/js/time.js` — pure date/math helpers (GAC cycle, era day,
  unlock windows, countdown targets). Depends on `config.js`. No DOM.
- `assets/js/render.js` — DOM builders (hero, dashboard, unlock windows,
  schedule explorer with daily coliseum boss, full-era timeline). Depends on
  `config.js` + `time.js`.
- `assets/js/app.js` — wiring: countdown tick, modals, mobile nav,
  starfield, init. Loaded last.
- `assets/img/` — imagery, grouped by type:
  - `events/` — GAC, conquest, TW, smuggling runs, journeys, fleet
    ships (`executor.png`, `leviathan.png`, `profundity.png`),
    era battles/journeys.
  - `tb/` — Territory Battles, one file per TB (`hoth-rebel-assault.png`,
    `hoth-imperial-retaliation.png`, `geonosis-republic-offensive.png`,
    `separatist-might.png`, `rise-of-the-empire.png`). The guild's pick
    is stored per Light/Dark side in `localStorage`.
  - `marquee/` — `marquee1-6event.png` unit art.
  - `bosses/` — coliseum rotation (`krayt.png`, `zeffo.png`,
    `jotaz.png`, `dryax.png`).
  - `datacrons/` — `datacron_blue/green/orange/pink.png`.
  - `icons/` — generated PNG icon set (`icon-180/192/512.png`,
    `favicon-32.png`), resized from `favicon.ico` with Pillow.
  Image paths live in `config.js` as paths relative to `IMG_BASE`
  (`assets/img/`); the renderer prefixes them, so regrouping art only
  touches `config.js`.
- `site.webmanifest`, `robots.txt`, `sitemap.xml`, `.nojekyll`,
  `favicon.ico` — standard Pages/PWA plumbing.
- `scripts/pull-live-events.mjs` + `assets/data/live-events.json` +
  `assets/img/live/` — live in-game events. The script talks to a
  running [swgoh-comlink](https://github.com/swgoh-utils/swgoh-comlink)
  instance (`COMLINK_URL`, default `http://localhost:3500`), pulls
  `/getEvents` + English names (Title Cased with acronyms kept, filler
  suffixes like "Resource Event" trimmed since the type pill shows it),
  keeps time-limited events in a −1d/+14d window (permanent
  journey/legend unlocks, GAC rounds, and daily credit/ability/gear/ship
  challenges excluded), then downloads each event's real banner art
  through
  [swgoh-ae2](https://github.com/swgoh-utils/swgoh-ae2) (`AE_URL`,
  default `http://localhost:3123`) into `assets/img/live/` (path stored
  as `art` per event; bundled art is the fallback when a texture isn't
  downloadable). `assets/img/live/` is a persistent library — files
  already on disk are reused as-is and nothing is auto-deleted, since
  events rerun and re-downloads can flake; each event's primary texture
  is always tried before any shared fallback icon. The day-by-day
  explorer renders them as standard cards
  — art, accent and badge all resolved through the same
  `EVENT_ICONS`/`CATEGORY_META` maps as the hardcoded rotation, so the
  two can never drift apart.

## Live event refresh

The day-by-day explorer overlays `assets/data/live-events.json` on top
of the expected rotation: live events render first as standard cards
with the same relative-day pill as hardcoded cards, then the rotation
cards. A day shows full live cards only
for what happens on it (events starting or ending that day); events
running longer than 24h also sit in the indicators row as badges shaped
like the coliseum boss, with their art and a "Day X of Y" caption.
Where a live card covers a rotation entry (same smuggling run, marquee,
fleet ship…) the rotation card is suppressed so nothing shows twice.
GAC is excluded
from the feed — Comlink exposes no round info, so the hardcoded
per-round GAC cards cover it. The snapshot refreshes itself via
`.github/workflows/live-events.yml` (every 4 hours, including
18:20 UTC just after the 18:00 UTC changeover, so late client updates
are caught overnight). Manual refresh works the same way:

```sh
# Terminal 1 — Comlink + asset extractor (needs Docker)
docker run --name swgoh-comlink -d --env APP_NAME=my-app \
  -p 3500:3000 ghcr.io/swgoh-utils/swgoh-comlink:latest
docker run --name swgoh-ae -d \
  -p 3123:8080 ghcr.io/swgoh-utils/swgoh-ae2:latest

# Terminal 2 — pull + commit the fresh snapshot (events + art)
npm run events:pull
```

`tests/live-events.test.js` fails if the committed snapshot is older
than 48h, so a broken refresh shows up in CI.

## Client version watch

`scripts/check-client-version.mjs` + `assets/data/client-version.json`
track the App Store client (`0.40.6` etc.) alongside the enforced server
versions (`latestGamedataVersion`, `assetVersion`) from Comlink. Store
builds land hours before the server flips, so both stages alert
separately: staged (new binary, old data) vs forced (data/asset moved).
Routine gamedata hash rotations never alert.
`.github/workflows/client-watch.yml` runs it hourly and posts to Discord
via the `DISCORD_WEBHOOK_URL` repo secret (job still tracks versions
when the secret is absent).

On a forced flip the same job also runs `scripts/content:diff`
(`scripts/diff-gamedata.mjs`), which diffs watched game-data files
(packs, units, journeys, reward tables) against slim hash snapshots in
`assets/data/gamedata-watch/` and posts new packs/assets/journeys/reward
changes to a second channel via `DISCORD_CONTENT_WEBHOOK_URL`. Snapshots
store sorted hash multisets per id, so per-tier duplicate rows and
routine hash rotations can never fake a change; while the gamedata
mirror lags the enforced version the diff reports `pending` and retries
next run.

```sh
npm run versions:check
npm run content:diff
```

## Daily digest

`scripts/post-schedule-digest.mjs` posts the homepage's daily schedule to
`DISCORD_EVENT_WEBHOOK_URL`: first a status embed (era, GAC, TB, TW,
conquest — short labeled fields like the version alerts), then one
message per live event starting/ending that day, each wearing the event's
own artwork. `.github/workflows/digest.yml` runs it daily at 18:10 UTC,
just after the changeover. It needs no Comlink — rotation state comes from
the site's own `config.js` + `time.js` and events from the committed
`live-events.json` snapshot, so posts always match the page. One post set
per era day is enforced via `assets/data/digest-state.json`:

```sh
npm run digest:post
DRY_RUN=1 npm run digest:post   # preview payloads, change nothing
```

> Git workflow: the `live-events.yml` bot pushes to
> `main` on a schedule, so `main` moves under you. Always run
> `npm run sync` (fetch + rebase onto `origin/main`) before editing
> or committing. Don't commit `assets/data/live-events.json`
> or `assets/img/live/` by hand
> unless you're doing an intentional manual refresh — a local
> pre-commit hook blocks `main` commits made while behind upstream
> for exactly this reason.

Scripts load in order at the end of `<body>` as deferred classic scripts
(ordered, non-blocking) so `onclick="…"` handlers keep working:

```html
<script defer src="assets/js/config.js?v=27"></script>
<script defer src="assets/js/time.js?v=41"></script>
<script defer src="assets/js/render.js?v=64"></script>
<script defer src="assets/js/app.js?v=28"></script>
```

Bump the `?v=` number on every deploy, or browsers may keep serving
cached CSS/JS instead of the new schedule. Each stylesheet must be
linked exactly once (a duplicated `<link>` loads the CSS twice).

## Editing rotation

- New Era: `ERA_NAME`, `ERA_START_DATE` in `config.js`, plus
  `EPISODE_OVERRIDES`, `MARQUEE_NAMES`, `DATACRON_SETS`. Hero title,
  day counts (`/ 84`), week counts, timeline subtitle and changeover
  labels update automatically — no HTML edits needed.
- New GAC season: `GAC_CYCLE_START_DATE`.
- Fleet ships (Executor day 15, Leviathan day 20, Profundity last day):
  `MONTHLY_EVENTS` in `config.js`.
- Changed reset times: `STD_CHANGEOVER_HOUR_UTC` /
  `GAC_CHANGEOVER_HOUR_UTC`. Countdown, cycles and labels follow.
