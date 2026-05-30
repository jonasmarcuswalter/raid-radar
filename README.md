# Race Cockpit

Static offline race-cockpit PWA for testing GPX routes, POIs, route snapping, and iPhone/Safari service-worker behavior.

## Published App

GitHub Pages is configured to publish from `main` / `docs`.

After the first Pages deployment finishes, the app URL is:

https://deinemuttersitztaufmeinemlenker.github.io/race-cockpit/

## Current Build

The current `docs/` build contains the iPhone test route:

- `Rennrad-Tour nach Chnuschper-Hüsli`
- 39.8 km
- 1024 GPX points
- 4 test POIs

The app shell, GPX route, POIs, marker assets, and Leaflet library are cached by the service worker. The OSM basemap is online for this test build; a true offline basemap should use PMTiles.

## Skill Backup

The reusable Codex skill lives in:

`skills/offline-race-pwa-builder`

Use it to scaffold, rebuild, test, and prepare future GPX/POI race-cockpit PWAs.
