# Raid Radar Route Requests

This folder documents the route-request schema.

Because this repository is public, this folder should not receive private GPX files from other people. The preferred future flow is the ChatGPT App in `chatgpt-app/`, where the same schema is created inside the user's own private repository.

For a user-owned route repo, every accepted upload should create:

- `route-requests/pending/<request-id>/route.gpx`
- `route-requests/pending/<request-id>/request.json`
- `route-requests/pending/<request-id>/BUILD_PROMPT.md`

`request.json` must include the route name, route slug, validation stats, selected intelligence profile, build target, visibility, and the user-owned OpenAI/Codex resource policy.

Never commit OpenAI keys, GitHub tokens, or private GPX files into this public repo.
