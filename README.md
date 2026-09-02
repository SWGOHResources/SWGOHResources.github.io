# SWGOH::RESOURCES — Event Schedule

Day-by-day Star Wars: Galaxy of Heroes event schedule (GAC, Territory War,
Territory Battle, Conquest, Marquee, fleet ships). Static site, hosted on
GitHub Pages.

## Structure

- `index.html` — markup only (no inline CSS/JS).
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
- `assets/schedule/` — event art (`conquest.png`, `erajourney.png`,
  `executor.png`, `leviathan.png`, `profundity.png`, …).

Scripts load in order at the end of `<body>` as plain (non-module) scripts
so `onclick="…"` handlers keep working:

```html
<script src="assets/js/config.js"></script>
<script src="assets/js/time.js"></script>
<script src="assets/js/render.js"></script>
<script src="assets/js/app.js"></script>
```

## Editing rotation

- New Era: `ERA_START_DATE` in `config.js`, plus `EPISODE_OVERRIDES`,
  `MARQUEE_NAMES`, `DATACRON_SETS`.
- New GAC season: `GAC_CYCLE_START_DATE`.
- Fleet ships (Executor day 15, Leviathan day 20, Profundity last day):
  `MONTHLY_EVENTS` in `config.js`.
