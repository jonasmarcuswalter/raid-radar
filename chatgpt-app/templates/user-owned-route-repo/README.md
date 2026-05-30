# User-Owned Raid Radar Routes

This is the recommended private repository shape for GPX builds that should not live in Jonas's public `raid-radar` repo.

## Principle

- The public Raid Radar app provides branding, templates, and reusable build logic.
- The user owns the GPX, route data, build logs, GitHub repo, and OpenAI/Codex spend.
- OpenAI/Codex keys are stored only as private repo secrets or in the user's own local/runner environment.
- The browser never receives OpenAI, Codex, or GitHub write tokens.

## Required Secrets

Configure one of these in the user-owned repo or runner:

- `OPENAI_API_KEY`: for Codex SDK / non-interactive route intelligence.
- `CODEX_API_KEY`: if the selected Codex runner expects this name.

Optional deployment secrets depend on the target:

- `GH_PAGES_TOKEN` or GitHub Pages permissions for private-to-pages deploys.
- Provider-specific tunnel/storage secrets if a private route should not be published via GitHub Pages.

## Route Request Schema

Every request created by the ChatGPT app uses:

- `route-requests/pending/<request-id>/route.gpx`
- `route-requests/pending/<request-id>/request.json`
- `route-requests/pending/<request-id>/BUILD_PROMPT.md`

The Codex runner should read `request.json`, apply the selected intelligence profile, build the route app, and either open a PR or publish the generated route according to the user's visibility setting.

## Intelligence Profiles

- `fast`: quick and low cost, fewer stops, critical-only checks.
- `balanced`: recommended default, route-first POIs, official checks for best stops and gaps.
- `deep`: broader POI and source checks, better Sunday/night/fallback logic.
- `ultra`: maximum useful checking with explicit conflicts, uncertainty notes, and final-week recheck tasks.

## Safety

Keep this repository private by default. GPX files can expose home addresses, sleep locations, training habits, and travel plans.

