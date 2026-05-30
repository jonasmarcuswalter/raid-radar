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

Create-route builder:

https://jonasmarcuswalter.github.io/raid-radar/create/

Route apps:

- Zürich test: https://jonasmarcuswalter.github.io/raid-radar/zuerich-test/
- Flensburg Rückfahrt: https://jonasmarcuswalter.github.io/raid-radar/flensburg-rueckfahrt/
- Hamburg Backyard: https://jonasmarcuswalter.github.io/raid-radar/hamburg-backyard/

## Codex Route Builder Direction

The public `/create/` page is a local-first Codex builder: it validates a GPX in the browser, previews the route, lets the rider choose an intelligence profile, and downloads a route-request ZIP/prompt. It does not upload GPX data, store credentials, or write to GitHub.

The practical flow is:

- User creates a package at https://jonasmarcuswalter.github.io/raid-radar/create/.
- User opens their own Codex at https://chatgpt.com/codex/.
- User connects Codex to their own GitHub repo, for example `github-user/raid-radar-routes`.
- User unzips the downloaded package into the repo root; it creates `route-requests/pending/<request-id>/`.
- User opens Codex for that repo and pastes `BUILD_PROMPT.md`.
- Codex uses `jonasmarcuswalter/raid-radar` only as the public template source.
- The GPX, generated route data, POI research, and commits stay in the user's own repo unless the user explicitly chooses public sharing.

The older MCP scaffold still lives in `chatgpt-app/`, but it is not the primary user flow right now. The Codex handoff path is simpler and works with each rider's own Codex account and repo.

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

No OpenAI, Codex, or GitHub write token belongs in the public browser app. Users run route builds from their own Codex workspace and GitHub repo.

Official technical direction:

- Codex web: https://chatgpt.com/codex/
- Codex SDK: https://developers.openai.com/codex/sdk
- Codex non-interactive mode: https://developers.openai.com/codex/noninteractive
- Codex GitHub Action: https://developers.openai.com/codex/github-action

## Legacy Intake Worker

The older central intake worker is still parked in:

`intake-worker/`

It can validate GPX and write requests into GitHub, but it is not wired into the homepage and should be treated as dev-only. It is not the target architecture for private user GPX builds because central storage would put privacy and compute responsibility on Jonas.

Current limitation: a static GitHub Pages page cannot push a file directly into Codex or GitHub by itself because a GitHub write token cannot live safely in public browser code. The current solution is the Codex handoff ZIP: the user downloads the package and runs it in their own Codex workspace.

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
