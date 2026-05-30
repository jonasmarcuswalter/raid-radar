# Raid Radar ChatGPT App

This folder is the long-term GPX intake direction for Raid Radar: a ChatGPT App / MCP server that validates GPX files and prepares user-owned route builds.

It intentionally does not publish GPX uploads through the public GitHub Pages launcher.

## What This Solves

The public Raid Radar site can show finished demo routes, but it should not accept private GPX files directly because browser code cannot safely hold GitHub or OpenAI write credentials.

This app moves sensitive steps into authenticated tool calls:

- GPX validation happens inside ChatGPT/app tooling.
- GPX files are written to the user's own private GitHub repo or storage.
- Route intelligence, POI research, and Codex builds use the user's own OpenAI/Codex resource.
- Jonas's public `jonasmarcuswalter/raid-radar` repo remains the template and public demo, not the compute account or private route inbox.

## Tools

- `validate_gpx`: checks file type, parseability, point count, and the 1000 km limit.
- `prepare_route_build`: chooses route slug, visibility, build target, POI policy, and intelligence profile without storing GPX.
- `connect_github`: describes the user-owned GitHub connection requirements.
- `connect_openai`: describes where the user's OpenAI/Codex resource must be configured.
- `create_route_request`: writes `route.gpx`, `request.json`, and `BUILD_PROMPT.md` into the user's repo.
- `check_build_status`: reads request/build status from the user's repo.

## Intelligence Profiles

Users should explicitly choose how hard Codex should think and how much research should be done:

- `fast`: quick and lower cost, sparse stops, critical-only checking.
- `balanced`: recommended default, route-first POIs and source checks for best stops/gaps.
- `deep`: broader source checks, richer fallback logic, better Sunday/night handling.
- `ultra`: highest paranoia mode for long rides, source conflicts, final-week checks, and more explicit uncertainty.

The selected profile is saved in `request.json` so a GitHub Action, Codex CLI, or Codex SDK runner can apply it later.

## User-Owned OpenAI Resource

Do not ask users to paste OpenAI or Codex keys into browser UI.

For real builds, configure the user's private route repo or runner with one of:

- `OPENAI_API_KEY`
- `CODEX_API_KEY`
- an authenticated Codex CLI/session owned by that user

The public Raid Radar repo should not pay for other users' GPX intelligence. It provides the template, docs, and finished public demo routes.

## Development

```sh
cd chatgpt-app
npm install
npm run check
npm start
```

For local development, copy `.env.example` and set:

- `RAID_RADAR_GITHUB_TOKEN`: server-side dev token with contents write + issues write for the test target repo.
- `RAID_RADAR_DEFAULT_TARGET_REPO`: for example `github-user/raid-radar-routes`.
- `RAID_RADAR_ALLOW_PUBLIC_REPO_REQUESTS=false`: keep false unless deliberately testing against a disposable public repo.

## Request Files

`create_route_request` writes:

- `route-requests/pending/<request-id>/route.gpx`
- `route-requests/pending/<request-id>/request.json`
- `route-requests/pending/<request-id>/BUILD_PROMPT.md`

`request.json` includes the route stats, visibility, target repo, template repo, build target, intelligence profile, POI policy, and user-owned OpenAI resource policy.

## Production Auth Shape

The production app should use:

- Apps SDK authentication for the ChatGPT App.
- GitHub OAuth or GitHub App installation for the user's chosen repo.
- User-owned OpenAI/Codex secrets stored in the user's repo/runner, never in the public browser app.

Relevant docs:

- https://developers.openai.com/apps-sdk/
- https://developers.openai.com/apps-sdk/build/auth/
- https://developers.openai.com/codex/sdk
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/github-action

