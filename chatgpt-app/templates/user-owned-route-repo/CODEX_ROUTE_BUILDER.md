# Codex Route Builder Prompt

Use this when a `route-requests/pending/<request-id>/` folder appears in a user-owned Raid Radar route repository.

1. Read `request.json`, `route.gpx`, and `BUILD_PROMPT.md`.
2. Confirm the GPX is parseable and no longer than 1000 km.
3. Use the user's own OpenAI/Codex resource from the private repo or runner environment.
4. Do not move the GPX into Jonas's public Raid Radar repo unless the user explicitly requests public sharing.
5. Generate a Raid Radar route app from the public template:
   - `route.json`
   - `pois.json`
   - `gaps.json`
   - `segments.json`
   - `app-meta.json`
   - route page, manifest, service worker, marker assets, and map pack where feasible
6. Apply the selected intelligence profile:
   - official source first
   - Google Maps crosscheck where needed
   - OSM only as candidate/fallback
   - off-route return-to-leave-point notes
   - uncertainty and final-week recheck notes
7. Run local checks and browser/offline checks if available.
8. Open a PR or create a deploy artifact according to the request visibility.

Never commit API keys, OAuth tokens, or private credentials.

