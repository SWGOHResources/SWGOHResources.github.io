# SWGOH::RESOURCES

Static Star Wars: Galaxy of Heroes event schedule, Conquest planner and era
material calculator, published through GitHub Pages.

## Pages

- `/` — daily schedule, GAC and guild phases, unlock dates and live events.
- `/conquest/` — Conquest feat coverage, keycards and projected rewards.
- `/era-chart/` — era upgrade costs and available rewards.
- `/privacy/`, `/cookie-policy/`, `/terms/` — site policies.

Edit the root HTML files. `npm run cache:bust` stamps local asset URLs and
refreshes the directory-route copies used by GitHub Pages. Legacy `.html`
URLs retain their query strings and plan fragments when switching to clean
routes. `404.html` handles missing pages.

## Development

Requires Node.js 24. Install the locked dependencies and run the checks:

```sh
npm ci
npm test
python tests/atlas-sprites.test.py
```

The Python atlas tests require Pillow. Exporting new atlas sprites also
requires UnityPy. CI runs the tests on Linux and Windows.

Before committing changes to code, data or images:

```sh
npm run cache:bust
npm test
```

The cache command is idempotent. Tests check asset versions, local asset
references, directory copies, scheduling boundaries and planner behaviour.

## Application code

- `assets/js/config.js` contains era dates, event rotations, timing settings,
  timezone presets and artwork mappings. Update it for a new era or season.
- `assets/js/time.js` provides the scheduling engine and timezone helpers.
- `assets/js/render.js` builds the homepage and loads live event snapshots.
- `assets/js/app.js` wires schedule controls, countdowns and refreshes.
- `assets/js/site.js` handles shared navigation, cookies, dialogs and footer.
- `assets/js/conquest.js` implements Conquest planning and share links.
- `assets/js/era-chart.js` implements the era material calculator.
- `assets/js/asseturl.js` versions image URLs assembled at runtime.

Styles are split into shared, Conquest and era-calculator files under
`assets/css/`. Planner selections stay in localStorage; Conquest share links
encode the plan in the URL fragment. Editing a shared plan saves a local copy.

## Data refreshes

`npm run events:pull` reads time-limited events and English localization from
[swgoh-comlink](https://github.com/swgoh-utils/swgoh-comlink). Set `COMLINK_URL`
when the service is not at `http://localhost:3500`. Optional artwork comes from
[swgoh-ae2](https://github.com/swgoh-utils/swgoh-ae2), configured by `AE_URL`
(default `http://localhost:3123`). The command also refreshes asset versions.

Bonus-drop portraits use the small texture catalogue in
`scripts/data/bonus-portraits.json`. It records the source revision and CDN
texture names independently of any retired page.

`npm run conquest:pull` updates feat text from Comlink and downloads missing
configured artwork. Curated sector placement, keycards, coverage metadata and
reward thresholds remain in `assets/data/conquest-planner.json`. Unknown feats
are staged for review.

The era calculator uses `assets/data/era-chart.json` and `era-coliseum.json`.
Retained source extracts in `scripts/data/` support its reward builders:

```sh
node scripts/build-era-marquees.mjs
node scripts/build-era-coliseum.mjs
npm run cache:bust
```

`npm run versions:check` observes store/server versions and queues meaningful
transitions. `npm run versions:notify` delivers queued alerts through
`DISCORD_WEBHOOK_URL`, retaining failed notifications for retry.

`npm run digest:post` posts the daily schedule through
`DISCORD_EVENT_WEBHOOK_URL`. `DRY_RUN=1` previews the payload without sending.
`npm run sitemap` refreshes the homepage sitemap date and is safe to rerun.

GitHub Actions refresh events, watch client versions and post the daily digest.
These jobs update `main`; run `npm run sync` before editing an existing checkout
to fetch and rebase onto the current branch. Commit intentional live-data and
artwork updates together with regenerated page versions.

## Shared atlas library

All 2,019 named atlas sprites in `assets/img/atlases/` are retained for current
and future features. Their source bundle checksums, original names, coordinates,
borders, padding and mirror flags are recorded in `index.json`.

To reproduce the full library from the original bundles:

```sh
python scripts/extract-atlas-sprites.py BUNDLE ... --atlas-map scripts/atlas-containers.json --output assets/img/atlases
python tests/atlas-sprites.test.py
npm run cache:bust
npm test
```

Use the containers listed in `scripts/atlas-containers.json`. The exporter uses
the original NGUI sprite rectangles rather than inferred image boundaries.
