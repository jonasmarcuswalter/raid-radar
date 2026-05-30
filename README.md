# Raid Radar

Offline route apps for GPX rides, next-raid decisions, route snapping, POIs, and iPhone/Safari service-worker behavior.

Brand:

- Product name: `Raid Radar`
- Launcher claim: `Find the next raid before the bonk finds you`
- Route-app claim: `Raid Before You Bonk`

The GitHub repository slug is still `race-cockpit` so existing GitHub Pages links keep working. The public product and visible app branding are Raid Radar.

## Public App

GitHub Pages publishes from the `pages` branch, `/docs`.

Launcher:

https://deinemuttersitztaufmeinemlenker.github.io/race-cockpit/

Route apps:

- Zürich test: https://deinemuttersitztaufmeinemlenker.github.io/race-cockpit/zuerich-test/
- Flensburg Rückfahrt: https://deinemuttersitztaufmeinemlenker.github.io/race-cockpit/flensburg-rueckfahrt/
- Hamburg Backyard: https://deinemuttersitztaufmeinemlenker.github.io/race-cockpit/hamburg-backyard/

## GPX Intake

The launcher includes the first GPX intake step:

- choose a `.gpx` file locally in the browser
- validate that it is parseable and no longer than 1000 km
- calculate route length and point count
- copy a ready-to-send Codex prompt for creating the next Raid Radar app

Current limitation: a static GitHub Pages page cannot push a file directly into this Codex chat by itself. The next automation step should be a small backend or GitHub Issue/Action flow:

1. User uploads GPX on Raid Radar.
2. Backend stores the GPX and opens a route-build request.
3. Codex receives the request, builds the route app, researches POIs, runs subagent QA, and pushes a new `/docs/<route-slug>/` app.
4. The launcher route list is updated.

## Current Builds

Each route app lives in its own subfolder with its own manifest and service worker scope:

- `docs/zuerich-test/`: current iPhone GPX test route, 39.8 km, 4 test POIs
- `docs/flensburg-rueckfahrt/`: Raid Radar route app, 109.8 km, Sunday raid options, offline corridor map
- `docs/hamburg-backyard/`: Hamburg Backyard Ultra draft route, 701.4 km, 381 POIs, 77 critical POIs

The app shell, GPX route, POIs, marker assets, and Leaflet library are cached by each app service worker. The OSM basemap is online for inspection; a true offline basemap should use PMTiles.

## Skill Backup

The reusable Codex skill lives in:

`skills/offline-race-pwa-builder`

Use it to scaffold, rebuild, test, and prepare future GPX/POI Raid Radar PWAs.
