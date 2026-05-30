# Raid Radar

Offline route apps for GPX rides, next-raid decisions, route snapping, POIs, and iPhone/Safari service-worker behavior.

Brand:

- Product name: `Raid Radar`
- Launcher claim: `Find the next raid before the bonk finds you`
- Route-app claim: `Raid Before You Bonk`

The GitHub repository slug is `raid-radar`; the public product and visible app branding are Raid Radar.

## Public App

GitHub Pages publishes from the `pages` branch, `/docs`.

Launcher:

https://jonasmarcuswalter.github.io/raid-radar/

Route apps:

- Zürich test: https://jonasmarcuswalter.github.io/raid-radar/zuerich-test/
- Flensburg Rückfahrt: https://jonasmarcuswalter.github.io/raid-radar/flensburg-rueckfahrt/
- Hamburg Backyard: https://jonasmarcuswalter.github.io/raid-radar/hamburg-backyard/

## ChatGPT App Direction

GPX upload is intentionally not shown in the public launcher right now. The product stays focused on prepared route apps until the user-owned ChatGPT/Codex flow is ready enough to feel clean.

The planned flow now lives in:

`chatgpt-app/`

The key idea:

- User opens Raid Radar inside ChatGPT.
- User attaches a `.gpx` file.
- The ChatGPT app validates the GPX, checks the 1000 km limit, and asks for route name, visibility, build target, and intelligence level.
- The GPX is stored in the user's own private GitHub repo or private build storage, not in this public repo.
- The route intelligence, POI research, and Codex build use the user's own OpenAI/Codex resource.
- Jonas's public `raid-radar` repo stays the template/demo app, not the default storage or compute account for other people's routes.

The current scaffold exposes these MCP tools for a future ChatGPT App:

- `validate_gpx`
- `prepare_route_build`
- `connect_github`
- `connect_openai`
- `create_route_request`
- `check_build_status`

Users choose an intelligence profile before build:

- `fast`: quick and cheaper, sparse raid-stop scan.
- `balanced`: recommended default for normal rides.
- `deep`: broader POI and source checks.
- `ultra`: highest paranoia mode for long or risky rides.

No OpenAI, Codex, or GitHub write token belongs in the public browser app. Production should use ChatGPT Apps SDK authentication plus a GitHub OAuth/App install for the user's own repo, then run Codex via the user's private secrets or environment.

Official technical direction:

- OpenAI Apps SDK: https://developers.openai.com/apps-sdk/
- Apps SDK authentication: https://developers.openai.com/apps-sdk/build/auth/
- Codex SDK: https://developers.openai.com/codex/sdk
- Codex non-interactive mode: https://developers.openai.com/codex/noninteractive
- Codex GitHub Action: https://developers.openai.com/codex/github-action

## Legacy Intake Worker

The older central intake worker is still parked in:

`intake-worker/`

It can validate GPX and write requests into GitHub, but it is not wired into the homepage and should be treated as dev-only. It is not the target architecture for private user GPX builds because central storage would put privacy and compute responsibility on Jonas.

Current limitation: a static GitHub Pages page cannot push a file directly into this Codex chat by itself because a GitHub write token cannot live safely in public browser code. The user-owned ChatGPT-App path solves that by moving writes and route intelligence into authenticated server/tool calls and private user resources.

Worker source, if needed for reference:

`intake-worker/src/worker.js`

Configure and deploy it with:

- `GITHUB_TOKEN`: fine-grained token with contents write + issues write
- `GITHUB_OWNER`: `jonasmarcuswalter`
- `GITHUB_REPO`: `raid-radar`
- `GITHUB_BRANCH`: `pages`
- `PUBLIC_ORIGIN`: `https://jonasmarcuswalter.github.io`

If this feature returns later, prefer adapting it to target private user repositories rather than the public Raid Radar repo.

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
