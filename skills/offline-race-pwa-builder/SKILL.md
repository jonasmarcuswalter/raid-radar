---
name: offline-race-pwa-builder
description: Build, regenerate, test, and deploy reusable offline race-cockpit PWAs from GPX routes, verified POI CSVs, rider marker assets, GitHub Pages hosting, and optional PMTiles offline map packs. Use when Codex needs to create or update a cycling/race web app with route snapping, POIs, service-worker caching, iPhone/Safari testing, GitHub Pages deployment, or offline map-pack planning.
---

# Offline Race PWA Builder

## Core Workflow

1. Scaffold the project if the target workspace does not already contain the app:

   ```bash
   python3 <skill>/scripts/scaffold_offline_race_pwa.py --target <workspace>
   ```

2. Put route and data inputs into the project:

   - `routes/<route>.gpx`
   - `data/<verified-pois>.csv`
   - `data/<critical-pois>.csv`
   - `data/<segments>.csv`
   - optional `data/<app-config>.json`

3. Build the static PWA:

   ```bash
   python3 scripts/build_offline_app.py \
     --gpx routes/<route>.gpx \
     --verified data/<verified-pois>.csv \
     --critical data/<critical-pois>.csv \
     --segments data/<segments>.csv \
     --config data/<app-config>.json
   ```

4. Start a local server from `offline-app/dist` and test the app before changing deployment files.

5. For iPhone/GPS/PWA testing, use HTTPS. Prefer GitHub Pages for stable testing; use a temporary Cloudflare tunnel only for development.

6. Prepare GitHub Pages output:

   ```bash
   python3 <skill>/scripts/prepare_github_pages.py --project <workspace> --docs docs --force
   ```

7. Validate:

   - `node --check offline-app/src/app.js`
   - `node --check offline-app/dist/sw.js`
   - Browser smoke test: route, POIs, rider marker, map, tabs
   - Service worker test: reload offline after first online load
   - iPhone test: Safari, wait for `Cached`, add to Home Screen, airplane-mode reload

## Current Template

The bundled `assets/project-template/` contains:

- Vanilla static PWA in `offline-app/`
- Leaflet online basemap for development and route inspection
- Service worker caching for app shell, route JSON, POIs, marker, icons, and map libraries
- In-app Offline tab with manual core caching, readiness checks, browser storage estimate, and PMTiles pack placeholder
- GPX/POI generator scripts in `scripts/`
- Rider photo marker assets
- GitHub Pages preparation helper

Do not assume online OSM tiles are a complete offline map. The route, POIs, app shell, and marker can be offline; full background maps require PMTiles.

## Data Rules

Use verified POI CSVs for race planning. For quick tests, `scripts/build_gpx_test_app_data.py` can derive nearby OSM/Nominatim POIs, but mark those as `osm-fallback` or `unverified`.

POI CSVs should include:

- route km
- category
- name
- address
- coordinates
- GPX leave point
- distance from route
- hours fields
- source status
- Maps links
- race-use note

Off-route POIs must say: `off route - Rückkehr zum exakten Leave Point`.

## GitHub Pages

Read `references/github-pages-and-offline-map-plan.md` before configuring Pages, repository visibility, or the offline map-pack workflow.

Key rule: GitHub visibility is repository-level. A branch cannot be public if the repository is private. GitHub Free supports Pages from public repositories; private Pages sources require a paid plan.

## Offline Map Pack

For production race use, add a PMTiles corridor pack instead of bulk-caching OSM raster tiles.

Recommended implementation path:

1. Keep online Leaflet/OSM basemap for quick development.
2. Generate a route-corridor PMTiles file for the final route.
3. Add an in-app `Offline-Kartenpack laden` control.
4. Store the PMTiles pack in browser storage/OPFS where supported.
5. Display explicit readiness state and require a final airplane-mode test.

## Race-Day Positioning

Treat the PWA as a decision cockpit, not the only navigation device. Garmin/Wahoo should remain the primary route navigation. The PWA should answer:

- Where am I on the route?
- How far to the next critical stop?
- Is the stop likely open?
- How far off-route is it?
- Where is the exact GPX leave point?
- What gaps or warnings apply next?
