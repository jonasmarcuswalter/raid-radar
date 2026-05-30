# Race Cockpit

Static offline race-cockpit PWA for testing GPX routes, POIs, route snapping, and iPhone/Safari service-worker behavior.

## Published Apps

GitHub Pages is configured to publish from the `pages` branch, `/docs`.

Launcher:

https://deinemuttersitztaufmeinemlenker.github.io/race-cockpit/

Route apps:

- Zürich test: https://deinemuttersitztaufmeinemlenker.github.io/race-cockpit/zuerich-test/
- Hamburg Backyard: https://deinemuttersitztaufmeinemlenker.github.io/race-cockpit/hamburg-backyard/

## Current Builds

Each route app lives in its own subfolder with its own manifest and service worker scope:

- `docs/zuerich-test/`: current iPhone GPX test route, 39.8 km, 4 test POIs
- `docs/hamburg-backyard/`: Hamburg Backyard Ultra draft route, 701.4 km, 381 POIs, 77 critical POIs

The app shell, GPX route, POIs, marker assets, and Leaflet library are cached by each app service worker. The OSM basemap is online for inspection; a true offline basemap should use PMTiles.

## Skill Backup

The reusable Codex skill lives in:

`skills/offline-race-pwa-builder`

Use it to scaffold, rebuild, test, and prepare future GPX/POI race-cockpit PWAs.
