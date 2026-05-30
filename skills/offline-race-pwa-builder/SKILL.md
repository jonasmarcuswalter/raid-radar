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

4. Optional but recommended: build the offline corridor map pack after the first app build has produced `offline-app/data/route.json`:

   ```bash
   python3 scripts/build_corridor_map_pack.py \
     --route-json offline-app/data/route.json \
     --output offline-app/maps/corridor-map.json \
     --radius-km 1.0 \
     --chunk-km 8
   ```

   Then rerun `scripts/build_offline_app.py` with a config containing:

   ```json
   {
     "basemap": {
       "status": "corridor-vector",
       "note": "Offline OSM vector corridor pack is included."
     },
     "offline_map_pack": {
       "status": "available",
       "label": "Offline Route-Korridor",
       "url": "./maps/corridor-map.json",
       "renderer": "corridor-vector",
       "note": "Offline-Kartenpack mit lokalen OSM-Vektorlinien."
     }
   }
   ```

5. Start a local server from `offline-app/dist` and test the app before changing deployment files.

6. For iPhone/GPS/PWA testing, use HTTPS. Prefer GitHub Pages for stable testing; use a temporary Cloudflare tunnel only for development.

7. Prepare GitHub Pages output:

   ```bash
   python3 <skill>/scripts/prepare_github_pages.py --project <workspace> --docs docs --force
   ```

8. Validate:

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
- Offline corridor map-pack renderer for `maps/corridor-map.json`
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

For production race use, use either the built-in `corridor-map.json` vector pack or add a PMTiles corridor pack instead of bulk-caching OSM raster tiles.

Recommended implementation path:

1. Keep online Leaflet/OSM basemap for quick development.
2. For near-term sharing, generate `offline-app/maps/corridor-map.json` from Overpass with `scripts/build_corridor_map_pack.py`.
3. For heavier production maps, generate a route-corridor PMTiles file for the final route.
4. Add or reuse the in-app `Offline-Kartenpack laden` control.
5. Store the map pack in browser storage/OPFS or Cache API where supported.
6. Display explicit readiness state and require a final airplane-mode test.

## Race-Day Positioning

Treat the PWA as a decision cockpit, not the only navigation device. Garmin/Wahoo should remain the primary route navigation. The PWA should answer:

- Where am I on the route?
- How far to the next critical stop?
- Is the stop likely open?
- How far off-route is it?
- Where is the exact GPX leave point?
- What gaps or warnings apply next?
