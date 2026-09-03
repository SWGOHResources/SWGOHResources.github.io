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

Scripts load in order at the end of `<body>` as deferred classic scripts
(ordered, non-blocking) so `onclick="…"` handlers keep working:

```html
<script defer src="assets/js/config.js?v=13"></script>
<script defer src="assets/js/time.js?v=13"></script>
<script defer src="assets/js/render.js?v=11"></script>
<script defer src="assets/js/app.js?v=11"></script>
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
