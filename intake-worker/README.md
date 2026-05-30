# Raid Radar Intake Worker

Tiny backend for the public Raid Radar launcher.

Why this exists: GitHub Pages is static and cannot safely hold a GitHub token. The launcher can validate a GPX locally, but a backend must receive the upload and write it into the GitHub route-request inbox.

## Flow

1. User uploads a `.gpx` on the Raid Radar homepage.
2. Homepage posts `multipart/form-data` to this worker.
3. Worker validates the GPX again server-side and rejects routes over 1000 km.
4. Worker commits the GPX and metadata into `route-requests/pending/<request-id>/`.
5. Worker opens a GitHub issue labelled `route-request` and `codex`.
6. Codex can pick up that request and build the next `/docs/<route-slug>/` app.

## Required Secrets / Vars

- `GITHUB_TOKEN`: fine-grained token with contents write + issues write for this repo.
- `GITHUB_OWNER`: defaults to `deinemuttersitztaufmeinemlenker`.
- `GITHUB_REPO`: defaults to `race-cockpit`.
- `GITHUB_BRANCH`: defaults to `pages`.
- `PUBLIC_ORIGIN`: defaults to `https://deinemuttersitztaufmeinemlenker.github.io`.

After deployment, set `window.RAID_RADAR_INTAKE_ENDPOINT` in `docs/intake-config.js` to the worker `/route-request` URL.
