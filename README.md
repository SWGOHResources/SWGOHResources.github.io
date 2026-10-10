# SWGOH::RESOURCES — Event Schedule

Named atlas sprites live in `assets/img/atlases/`. They are cropped from the
original Unity bundles using each NGUI atlas's `mSprites` rectangles and its
material texture, with original names, borders, padding, mirror flags and
checksums recorded in `index.json`. This preserves disconnected parts of an
icon and excludes neighbouring sprites. Case-sensitive Unity names that
collide on Windows receive a deterministic filename suffix; the manifest
keeps both original names. The failed inferred crops have been deleted and
replaced by this library of 2,019 sprites from the 11 original containers.

To reproduce the export with UnityPy and Pillow installed, download the
original bundles through the asset extractor and run:

```sh
python scripts/extract-atlas-sprites.py BUNDLE ... --atlas-map scripts/atlas-containers.json --output assets/img/atlases
python tests/atlas-sprites.test.py
npm run cache:bust
npm test
```

The [SWGoH Asset Extractor](https://github.com/swgoh-utils/swgoh-ae2) provides
a prebuilt Docker image. Obtain the asset version from Comlink `/metadata`,
download the containers listed in `scripts/atlas-containers.json`, and pass
their original `.bundle` files to the command above. The map selects each
container's own atlas definitions and excludes references to foreign atlases.

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
Rotation marquee, era-challenge and journey-guide slots are matched to
live events by unit and name (Comlink only tags true marquees, so the
pull script also reads the unit out of each event's texture name):
a matched slot wears the live art and marquee name instead of its
hardcoded placeholder, and its rotation badge/card stays out of the way
while the live event touches the day — one representation per happening.
GAC is excluded
from the feed — Comlink exposes no round info, so the hardcoded
per-round GAC cards cover it. The snapshot refreshes itself via
`.github/workflows/live-events.yml` (every 4 hours, including
18:20 UTC just after the 18:00 UTC changeover, so late client updates
are caught overnight).

Open browser tabs check for newer snapshots every 15 minutes, and when
returning to a tab once that interval has elapsed. Failed requests retry
after a minute and keep the last good snapshot; simultaneous requests
share one fetch. Countdown text updates in place each minute, while
standard, GAC and guild phase transitions trigger a full refresh even
if a timer was delayed. Automatically replaced era artwork is
revalidated online and remains cached for offline use.

Manual refresh works the same way:

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

Meaningful transitions are saved in `pendingNotifications` in the
version snapshot before any delivery attempt. `scripts/notify-client-version.mjs`
posts the queued alerts with their original version details and records
each successful delivery. The workflow saves those checkpoints even
when a later request fails, so the next hourly run retries the remaining
alerts. A missing webhook keeps the queue. If the process stops after
Discord accepts a post but before its checkpoint is persisted, that
post may repeat on retry.

```sh
npm run versions:check
npm run versions:notify
```

Alert embeds carry no emojis.

## Daily digest

`scripts/post-schedule-digest.mjs` posts the homepage's daily schedule to
`DISCORD_EVENT_WEBHOOK_URL`: first a status embed (era, GAC, TB, TW,
conquest — short labeled rows like the version alerts), then one message
per live event starting that day, each with Type/Starts/Ends rows and the
event's full artwork image. `.github/workflows/digest.yml` runs it daily at 18:30 UTC
(just after the 18:00 UTC game-day changeover, so it posts the fresh day). It needs no Comlink — rotation state comes from
the site's own `config.js` + `time.js` and events from the committed
`live-events.json` snapshot, so posts always match the page. One post set
per era day is enforced via `assets/data/digest-state.json`:

```sh
npm run digest:post
DRY_RUN=1 npm run digest:post   # preview payloads, change nothing
```

The same job also runs `npm run sitemap` so the homepage `<lastmod>`
stays within a day (the schedule rolls daily and nothing else stamps
it).

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
<script defer src="assets/js/config.js?v=41"></script>
<script defer src="assets/js/time.js?v=54"></script>
<script defer src="assets/js/render.js?v=80"></script>
<script defer src="assets/js/app.js?v=29"></script>
```

`conquest.html` keeps the same header/footer shell plus
`assets/js/site.js` (mobile nav, cookie notice, footer year,
Discord-handle copy). Keep each feature on its own page — don't fold
them into the homepage.

Each stylesheet must be linked exactly once (a duplicated `<link>` loads
the CSS twice).

### Asset caching (`npm run cache:bust`)

Don't hand-bump `?v=` numbers — a forgotten bump is exactly how a stale
stylesheet or an old feat icon "reappears" after you changed it. Instead:

```
npm run cache:bust      # rewrites ?v= on every local href/src, per file
```

`scripts/cache-bust.mjs` hashes every file under `assets/` and stamps each
page's local `href`/`src` with **that file's own content hash**, so a URL
only changes when the bytes do. It also writes one site-wide token into
`<meta name="swgoh-asset-v">` on every page, which `assets/js/asseturl.js`
exposes as `assetUrl(path)`.

Images the scripts build at runtime (feat icons, crate art, unit portraits,
event art) go through `assetUrl()` — in `render.js` that's the `imgPath(f)`
helper, in `conquest.js` the `withAssetV(p)` one — so a replaced PNG can't
be served from an old cache entry either. `main.css` has no `url()`
references, which is the only reason the CSS side needs no runtime help.

`npm test` fails if the committed pages have drifted from what the script
would stamp, and if a page references an asset that isn't on disk, so run
`cache:bust` before committing. It's chained onto `events:pull` and
`conquest:pull`, since those are what add or replace images.

## Performance notes

Measured in-page (median of repeated interactions, 1280x900): every planner
action now lands inside one or two frames.

- **No `backdrop-filter` on the planner's sticky header.** It sat over a live
  animated starfield, so every twinkle frame and every scroll re-blurred it.
  A solid gradient bar looks the same over this background and costs nothing
  per frame. This alone took the page from 40fps idle to 60fps.
- **The starfield twinkles on `transform`, not `opacity`** (compositor-only,
  no repaint), and only the 1px stars twinkle: 46 stars, 10 animated. Animated
  nodes cost the whole page a frame each; decoration needs a handful.
- **Switching feat tabs is an in-place swap** of the feat list, not a
  re-render of the planner. It went from a 63ms frame to ~15ms. `activeGroup`
  is a lookup for the same reason.
- **The not-doing list is only rebuilt when the set of unpicked feats
  changes**, so star and crate clicks don't re-lay 49 rows.
- **`?v=`/hash writes are coalesced to one per frame** — `replaceState` isn't
  free and two in a frame is pointless.
- `contain: content` on the feat list, skip list and panel cards keeps a
  repaint inside one card from invalidating the page.

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

## Conquest planner

`conquest.html`, `assets/js/conquest.js` and
`assets/data/conquest-planner.json` implement a responsive feat planner.
The header shares the home page's status-card styling. Upcoming preliminary
conquests show a provisional-feat notice; it disappears at the launch time
without requiring a reload.

Select feats in Global or sector tabs to update the projected crate,
keycard totals and target rewards. Tabs turn green once all positive-keycard
feats in that group are selected; optional bonus-only feats do not prevent
completion. The projected-crate heading collapses the entire panel to its
running keycard total. The battle-star input accepts one-star increments,
with a complete focus outline around the stepper. Text selection is disabled
on the page except in editable fields and the copy-link fallback.

A separate Coverage & skips tab contains an editable, screenshot-ready report
with its own compact header (the Planner hero is hidden), feat keycard totals, skipped counts and a crate progress
rail below the diagram. Crate details and shard rewards appear in a custom
hover card or tap popup. Battle keycards missed subtract from the same
saved battle-star total used by the Planner tab; shared links remain compatible.
Every skipped feat is visible by sector with its requirement and keycard value.
Title-only feats remain available in the Planner but are omitted from coverage.
Shared links preserve the chosen view. Copy and Reset sit beside the view tabs.

The two-ring SVG shows objective categories and individual feats, each once.
Bright wedges are planned, dark wedges are skipped. Sector labels and original
bonus-reward artwork identify feat locations and extra rewards. Clicking a
feat opens its details without changing the plan; right-click toggles its
selection. Crate hover previews show the crate name and shard rewards,
left-click opens details, and right-click sets the target without opening a popup.
Popups have explicit Plan/Skip and target controls for touch and keyboard users. Click an inner category segment to filter the diagram; click it again to show all.
Each feat segment also supports keyboard activation. Desktop hover uses a custom card. Sector labels and
original bonus-reward artwork are shown in feat previews. No chart action
navigates away. The page is locked while a popup is open; tapping its backdrop closes it.
Coverage metadata lives on each feat as `coverage.category` and
`coverage.requirement`; newly staged feats default to Other.

Skipped feats list every unselected feat by group, their total keycards,
and the skip allowance for the target crate at the expected battle stars.
The skipped list stays expanded for screenshots. Selecting a feat in
this list opens its details and Plan/Skip control without leaving the report.

Artwork comes from the game's named textures and metadata-based atlas
extractions. Buff/debuff icons have green/red frames; neutral status
effects have blue frames. Faction feats use `datacronui_affix_*` textures,
including ISB, New Republic, Imperial Remnant, Hutt Cartel and Mercenary.
Those five standalone textures were obtained unmodified through swgoh-ae2
`/Asset/single`, asset version 100052, and are stored in
`assets/img/live/`. No Constable faction texture exists in that manifest;
Final Watch uses the game's squad symbol alongside its explicit requirement.
Challenge Path uses `conquestui_atlas/combat_gl_selectable.png`.

Disk rewards show only the original purple rarity-04 texture, without
emblem or capacity overlays. Disk emblems used as feat icons retain
their original gold colour. Deployable Cooling Systems is a consumable and uses
its consumable artwork. Title rewards use the game title icon. Unit shard
rewards layer a portrait over the game's ShardIcon background, coloured
blue for light side and red for dark side. The keycard texture is
`icon_points_pathofconquest` (Conquest Credits are a different asset), and
the battle star uses `standard_rgba_atlas/icon_rendered_star.png`.

Plans persist per conquest in localStorage under `swgoh-cq-plan` and are
shareable through the base64url `#p=` hash. Opening a shared plan does not
overwrite a saved plan until the visitor edits it. Delegated event handlers
remain attached when reset or tab changes replace feat rows.

`npm run conquest:pull` refreshes titles and descriptions from Comlink,
keeps coverage/art metadata, downloads missing `artAsset` textures through
swgoh-ae2, and stages unknown feats for triage. Sector placement, keycards
and reward thresholds are transcribed from the published feat sheet.
The current Volume 25 hard sheet contains 49 feats worth 334 keycards;
Normal and Easy remain preliminary until their sheets arrive.

Planner math and data integrity are checked in
`tests/conquest-planner.test.js`. DOM interaction tests cover reset,
selection, collapsed projection, coverage navigation, skipped totals,
completion states, warning timing and share-link persistence.
