# Raid Radar PWA Plan

## Summary

Build a static HTTPS Progressive Web App for iPhone/Safari that runs offline during Hamburg Backyard Ultra. The app shows the draft/final GPX, offline map tiles, current location, distance along route, next raid options, critical gaps, and route-leave points for off-route POIs.

## Delivery

- Serve as an HTTPS PWA before the race; install to iPhone Home Screen from Safari.
- Cache the full app shell, data JSON, map assets, rider icon assets, and offline tile pack with a Service Worker.
- Keep development runnable on `localhost`, but treat the race install as HTTPS-only because iOS geolocation and Service Workers require a secure context.
- Include iOS Home Screen metadata: `apple-touch-icon`, `apple-mobile-web-app-capable`, app title, manifest name/short name, theme color, and status-bar style.

## Data

- Convert the GPX route into `route.json` with simplified display geometry and precise cumulative-km snapping data.
- Convert `data/ultra_verified_resupply.csv` and `data/ultra_critical_resupply.csv` into `pois.json`.
- Convert gap strategy into `gaps.json` for Schwerin -> Malchin, CP loop, Malchin -> Wismar, Wismar -> Lübeck, and Lübeck -> Hamburg.
- Include source metadata, build date, route version, tile version, and final-week recheck status in `app-meta.json`.

## Offline Map

- Use MapLibre with a local PMTiles basemap corridor around the GPX route, not Google Maps and not scraped `tile.openstreetmap.org` raster tiles.
- Target a practical offline tile bundle for race use: enough context to see roads, towns, water, and POI surroundings without making the app enormous.
- Render GPX route, checkpoint, virtual finish, RBO, POIs, and off-route leave-point lines above the basemap.

## Rider Location Marker

- Use the supplied photo as the current-location marker source asset: `offline-app/assets/rider-marker-source.jpg`.
- Generate app-ready marker assets from it, preferably:
  - `rider-marker.png`: circular cropped face icon with transparent outside, high-contrast border, and shadow.
  - `rider-marker@2x.png`: retina version for iPhone.
- On the map, show this as the user position instead of a generic blue GPS dot.
- Direction logic:
  - Keep the face icon upright; rotate only the small compass-arrow/nose around it.
  - Use `GeolocationCoordinates.heading` when iOS provides it and it is not `null`.
  - If heading is missing, estimate bearing from the last two valid GPS fixes when moving.
  - If speed is too low or heading is unreliable, keep the icon upright and show an “heading weak” state.
- Visual design:
  - Keep the face readable and not distorted.
  - Add a small rotating compass-arrow/nose around the icon so direction is obvious while the face remains upright.
  - Show GPS accuracy as a subtle radius ring behind the icon.
  - Snap marker state to nearest route point and show off-route distance separately.

## Race UI

- Raid Radar: current route-km, remaining km, off-route distance, GPS accuracy, Next Raid, Food Raid, and Tankstellen Raid.
- Map: route, offline basemap, rider marker, CP/finish/RBO markers, POIs, leave-point lines.
- POI details: opening hours for Thu/Fri/Sat/Sun, source status, distance from route, GPX exit km, exact return-to-leave-point reminder, Google Maps link as online fallback.
- Filters: Hot Raids, Food Raid, Tank Raid, bike help, water/shelter, raidbar/likely open, 24h.
- Local state: pin stops, mark visited, hide irrelevant stops, store last known route-km.

## Detours

- V1 does not do offline turn-by-turn routing.
- For off-route stops, show GPX leave point, POI, straight-line distance, route-km, and a visible line between leave point and POI.
- Keep the rule text explicit: leave the GPX only for the stop and return to the exact leave point before continuing.

## Testing

- Verify the app has no network dependency after install by running in browser offline mode and on iPhone airplane mode.
- Simulate GPS positions at Schwerin, Malchin, CP, Wismar, Lübeck, and Hamburg approach.
- Check that the rider photo marker displays, rotates/falls back correctly, and remains legible at mobile map zooms.
- Confirm the next-POI and gap calculations update correctly from snapped route-km.
- Confirm Service Worker caches app shell, JSON data, marker assets, map libraries, and PMTiles.
- On a real iPhone: install from Safari to Home Screen, launch once online, switch to airplane mode, then verify app launch, route, PMTiles map, rider marker, GPS permission/state, POI list, and cached data.

## Assumptions

- The PWA is a decision-support cockpit, not a replacement for the primary bike computer route navigation.
- The supplied photo is approved for use inside the private race app bundle.
- Google Maps links remain online-only fallbacks and are not required for offline use.
