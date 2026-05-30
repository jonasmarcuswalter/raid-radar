# Raid Radar Legacy Intake Worker

Tiny backend scaffold for an earlier public Raid Radar upload idea.

Status: parked/dev-only. The public launcher no longer shows GPX upload, and the preferred architecture is now the ChatGPT App in `chatgpt-app/`, where each user stores GPX data in their own private repo and uses their own OpenAI/Codex resource.

Why this exists: GitHub Pages is static and cannot safely hold a GitHub token. The launcher can validate a GPX locally, but any backend that receives uploads must protect private route data and write only to the intended storage target.

## Flow

1. User uploads a `.gpx` on a future authenticated Raid Radar surface.
2. The client posts `multipart/form-data` to this worker.
3. Worker validates the GPX again server-side and rejects routes over 1000 km.
4. Worker commits the GPX and metadata into a configured route-request inbox.
5. Worker opens a GitHub issue labelled `route-request` and `codex`.
6. Codex can pick up that request and build the route app.

Important: do not point this at the public `jonasmarcuswalter/raid-radar` repo for other people's private home-address routes. The ChatGPT-App/User-owned flow is the safer default.

## Required Secrets / Vars

- `GITHUB_TOKEN`: fine-grained token with contents write + issues write for this repo.
- `GITHUB_OWNER`: defaults to `jonasmarcuswalter`.
- `GITHUB_REPO`: defaults to `raid-radar`.
- `GITHUB_BRANCH`: defaults to `pages`.
- `PUBLIC_ORIGIN`: defaults to `https://jonasmarcuswalter.github.io`.

After deployment, set `window.RAID_RADAR_INTAKE_ENDPOINT` in `docs/intake-config.js` to the worker `/route-request` URL.
