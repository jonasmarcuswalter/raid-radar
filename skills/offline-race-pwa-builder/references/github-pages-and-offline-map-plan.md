# GitHub Pages and Offline Map Plan

## GitHub Pages model

- Repository visibility is repository-level, not branch-level. A branch cannot be public if the repository is private.
- GitHub Pages can publish from a selected branch and folder, commonly `/docs` or `gh-pages`.
- GitHub Free supports Pages from public repositories. Private repository publishing needs a paid GitHub plan.
- Recommended working pattern:
  - Keep development on normal branches.
  - Build the PWA into `offline-app/dist`.
  - Copy the final static site into `docs/`.
  - Configure GitHub Pages to publish from the chosen branch's `/docs` folder.

## Race hosting pattern

- Prefer a permanent HTTPS host, such as GitHub Pages, over a laptop tunnel for race day.
- Keep a local Mac tunnel only as a temporary development path.
- The iPhone should install the app from Safari via HTTPS, then use the Home Screen app.

## Offline status model

The app should expose explicit status lines:

- App shell: cached/missing
- GPX route: cached/missing
- POIs: cached/missing
- Rider marker: cached/missing
- Map library: cached/missing
- Offline map pack: missing/downloading/ready
- Last offline test: timestamp/result

## Basemap strategy

- Do not bulk-download `tile.openstreetmap.org` raster tiles for offline use.
- For true offline maps, use a route-corridor PMTiles pack.
- Keep online OSM tiles only as a convenient development/test basemap.
- For Hamburg Backyard, generate a corridor around the official GPX, with larger buffers around cities, checkpoints, and sleep/resupply bands.

## Deployment checklist

1. Build app from GPX and POI CSVs.
2. Run local smoke test.
3. Run HTTPS smoke test.
4. Run service worker offline reload test.
5. Prepare `docs/` for GitHub Pages.
6. Push to a public Pages repository or a paid/private Pages repository.
7. Open the Pages URL on iPhone Safari.
8. Wait for `Cached`.
9. Download offline map pack.
10. Add to Home Screen.
11. Run airplane-mode test.
