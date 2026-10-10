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

`conquest.html` + `assets/js/conquest.js` + `assets/data/conquest-planner.json`:
tick the feats you'll attempt and it totals keycards against the crate
ladder. The page is a two-column grid above 1000px — conquest status card
and feat list on the left, a sticky projection panel on the right that
keeps the running total, the crate ladder and the battle-star stepper in
view while a long feat list scrolls. The ladder is split in two: ticks
mark each threshold on the progress rail, and the chips below it are the
tappable ladder (tap to target, hover or focus for the shard payout);
purple chips are earned, amber is your target. A group progress bar, a
picked/total counter on every tab, contextual `All`/`None`, `Reset whole plan` and
`Copy plan link` round out the feat sheet. A **Not doing** box in the
right column, under the crate panel, lists every feat left unticked in the
difficulty — grouped by tab, biggest keycard value first, each row with the
feat's icon, name, description, kind and value. It is deliberately
**read-only**: it exists so you can see, and show someone else, exactly what
a plan skips. Only the highest crate pays out — the page
says so. Crates are the official reward-crate tiers (`Reward Crate
Tier 1`…`Tier 7`, ascending `at`); the UI shortens them to `Tier N` and
maps each tier to the bundled chest art, which is still filed under the
old colour names (`crate-carbon.png` is tier 1). Per-crate shard payouts
(new unit + previous volume unit) live on each crate entry and show in the
ladder chip tooltips — there is no always-on payout line, which told you
nothing you couldn't already read off the chip. Instead the panel carries
a **next step**: the fewest unpicked feats that would close the gap to your
target tier (naming them when it's two or three, otherwise how many of your
remaining feats it would take). Picks persist per conquest in
`localStorage` under `swgoh-cq-plan`. Chain-gated feats render an explicit
requirement chip parsed from the official description. The page
auto-selects the entry whose changeover-anchored window holds today and
derives the day/countdown from the site engine.

Battle stars step **one star at a time** (1 star = 1 keycard) rather than
in threes, because you 3★ nearly everything and drop a star or two on a
few battles; "All 3★", "None" and the running `N of M` readout cover the
rest.

Reward chips (title, datadisk icon) and the keycard value chip are **grey
until the feat is ticked, amber once it is** — the sheet always shows what
you're actually getting rather than what you could get.

Plans are shareable as a link: the whole plan (difficulty, stars, target and
picked feat ids) is base64url-encoded into the `#p=` hash and rewritten with
`history.replaceState` on every change, so the address bar is always a
reproducible plan. `Copy plan link` copies it. A hash is read **once**, on
first render, and never written back to `localStorage` — opening someone
else's plan doesn't overwrite your own, and your later edits aren't undone
by the hash still sitting in the URL.

Feat-row anatomy, left to right: custom-drawn checkbox · the feat's own
game icon · title + requirement chip + description · keycard value ·
reward. Every feat has a real icon pulled from the game:
unit portraits (`charui_*`), faction/role badges (`datacronui_affix_*` — ISB,
Hutt Cartel, the banned Support/Tank/Attacker roles) and signature
**unit ability icons** (`ability_*` — Luminara's heal for Heal Over Time,
Old Ben's basic for Evasion Down, Boba Fett's Thermal Detonator, Batcher's
basic for Off Balance, Carson Teva's special for On the Run, and so on;
each chosen because that ability grants or inflicts the feat's effect per
gamedata). Generic buff/debuff pips (`abilityui_passive_*`) are never used —
two feats must never share an icon, which is also pinned by test. Each feat
records the extractor's asset name in `artAsset`, and
`npm run conquest:pull` re-downloads any missing art from swgoh-ae2 (same
"persistent library, never re-download" behaviour as `events:pull` art), so
new conquests only need the mapping added once. A feat with no art simply
gets no icon box — there is no placeholder asset. `reward` is free text: a
datadisk reward renders as an inline-SVG disc icon (no datadisk art exists)
with a hover/focus tooltip naming it, while anything matching
`/title|holo/i` stays a text chip. Feats are split into tabs (Global,
Sectors) with per-tab totals.

UI-sprite sourcing, verified against the live extractor and localization:
the Conquest **keycard** is the standalone texture
`icon_points_pathofconquest` (`CONQUEST_POINTS_DETAIL_TITLE` reads "Conquest
Keycards"; shipped as `assets/img/live/conquest-points.png`), while
`assets/img/live/conquest-keycard.png` is the Conquest *Credits* icon and
must not stand in for it. The **battle star** has no standalone texture —
it only exists as a sprite inside the game's UI atlases, which swgoh-ae2
downloads as bundles but does not export per-sprite (atlas names 500 on
`/Asset/single`, and no star-named standalone texture exists in the
11,400-asset manifest), so `assets/img/live/conquest-battle-star.png` is a
user-supplied export of that sprite — cross-checked against the white base
sprite in `battleui_view_rgba_atlas` at ~(1391,654,34x33), inside the
`shared_uicontainer` bundle, which the game tints gold at runtime — with a
gold-star inline SVG as fallback.
`UI_SPRITES` at the top of `conquest.js` takes the PNG filenames; the row
and the button render them only once set, so nothing incorrect ships in the
meantime.

Feat TITLES + DESCRIPTIONS sync from gamedata automatically
(`npm run conquest:pull`, needs Comlink like `events:pull`) and are
preserved across refreshes; sectors + keycard values come from the
published feat sheet (Vol 25 hard transcribed exactly — 334 feat
keycards per the sheet's own total), Normal/Easy stay preliminary until
their sheets land. Disk/title rewards render as chips, chain gates as
requirement chips (explicit `requires` wins over the parsed gate text).
The page banners the entry while `status` is `preliminary`, and notes
automatically when the feat list can't yet reach the top crate. New feat
text that lands late (e.g. a delayed data push) is staged for triage by
the pull script. Doing everything per difficulty is pinned by test
(easy 408 / normal 433 / hard 544 including stars).
Pure math (`planTotals`, `crateFor`, `findConquestEntry`, `featDesc`) is
covered by `tests/conquest-planner.test.js`, including a data-integrity
pass (sorted ladders, unique ids, per-difficulty text, art files exist).


