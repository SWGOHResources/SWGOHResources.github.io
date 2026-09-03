# SWGOH::RESOURCES — Event Schedule

Day-by-day Star Wars: Galaxy of Heroes event schedule (GAC, Territory War,
Territory Battle, Conquest, Marquee, fleet ships). Static site, hosted on
GitHub Pages.

## Structure

- `index.html` — schedule page, markup only (no inline CSS/JS).
- `404.html` — not-found page (GitHub Pages serves it automatically).
  Root-absolute asset paths so it works from any bad URL.
- `assets/css/main.css` — all styles.
- `assets/js/config.js` — **edit this when a new Era begins.** Era start
  date, GAC cycle start, datacron sets, marquee names, episode overrides,
  monthly fleet days, boss loop, icon/category maps. No DOM, no logic.
- `assets/js/time.js` — pure date/math helpers (GAC cycle, era day,
  unlock windows, countdown targets). Depends on `config.js`. No DOM.
- `assets/js/render.js` — DOM builders (hero, dashboard, cards, forecast,
  boss strip, full schedule). Depends on `config.js` + `time.js`.
- `assets/js/app.js` — wiring: countdown tick, modals, mobile nav,
  starfield, init. Loaded last.
- `assets/js/firebase-reference.js` — not loaded. Preserved Firebase
  auth/Firestore snippet in case the schedule ever needs sync.
- `assets/img/` — imagery, grouped by type:
  - `events/` — GAC, conquest, TW/TB, smuggling runs, journeys, fleet
    ships (`executor.png`, `leviathan.png`, `profundity.png`),
    era battles/journeys.
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
<script defer src="assets/js/config.js?v=1"></script>
<script defer src="assets/js/time.js?v=1"></script>
<script defer src="assets/js/render.js?v=1"></script>
<script defer src="assets/js/app.js?v=1"></script>
```

Bump the `?v=` number on every deploy, or browsers may keep serving
cached CSS/JS instead of the new schedule.

## Editing rotation

- New Era: `ERA_START_DATE` in `config.js`, plus `EPISODE_OVERRIDES`,
  `MARQUEE_NAMES`, `DATACRON_SETS`.
- New GAC season: `GAC_CYCLE_START_DATE`.
- Fleet ships (Executor day 15, Leviathan day 20, Profundity last day):
  `MONTHLY_EVENTS` in `config.js`.
