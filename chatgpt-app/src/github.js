import { prepareRouteBuild, PUBLIC_TEMPLATE_REPO, normalizeRepo } from "./build-policy.js";

export async function createRouteRequest({
  token,
  targetRepository,
  branch = "main",
  allowPublicRepoRequests = false,
  request,
  gpxText,
}) {
  const repo = normalizeRepo(targetRepository);
  if (!repo || !repo.includes("/")) {
    throw new Error("A target repository in the form owner/repo is required.");
  }
  if (repo === PUBLIC_TEMPLATE_REPO && !allowPublicRepoRequests) {
    throw new Error("Refusing to store private GPX in the public Raid Radar template repo. Use a user-owned private repo.");
  }
  if (!token) {
    throw new Error("GitHub auth is required server-side before the GPX can be persisted.");
  }
  if (!gpxText || typeof gpxText !== "string") {
    throw new Error("Missing GPX content.");
  }

  const [owner, name] = repo.split("/");
  const prepared = prepareRouteBuild({
    routeName: request.routeName,
    fileName: request.fileName,
    visibility: request.visibility || "private",
    targetRepository: repo,
    buildTarget: request.buildTarget || "codex_github_action",
    intelligence: request.intelligence || "balanced",
    notes: request.notes || "",
    stats: request.stats || null,
  });
  const requestId = `${timestampId()}-${prepared.routeSlug}`;
  const basePath = `route-requests/pending/${requestId}`;
  const metadata = {
    request_id: requestId,
    status: "pending-user-owned-build",
    received_at_utc: new Date().toISOString(),
    route_name: prepared.routeName,
    route_slug: prepared.routeSlug,
    original_file_name: request.fileName || "route.gpx",
    visibility: prepared.visibility,
    stats: request.stats || null,
    target_repository: repo,
    target_branch: branch,
    template_repository: PUBLIC_TEMPLATE_REPO,
    build_target: prepared.buildTarget,
    openai_resource: prepared.openaiResource,
    intelligence: prepared.intelligence,
    poi_strategy: prepared.poiStrategy,
    warnings: prepared.warnings,
  };

  await putGithubFile({
    owner,
    repo: name,
    branch,
    token,
    path: `${basePath}/route.gpx`,
    content: gpxText,
    message: `Add Raid Radar route request ${requestId}`,
  });
  await putGithubFile({
    owner,
    repo: name,
    branch,
    token,
    path: `${basePath}/request.json`,
    content: `${JSON.stringify(metadata, null, 2)}\n`,
    message: `Add metadata for Raid Radar route request ${requestId}`,
  });
  await putGithubFile({
    owner,
    repo: name,
    branch,
    token,
    path: `${basePath}/BUILD_PROMPT.md`,
    content: `${prepared.codexPrompt}\n`,
    message: `Add Codex prompt for Raid Radar route request ${requestId}`,
  });

  const issue = await createGithubIssue({
    owner,
    repo: name,
    token,
    title: `Raid Radar route request: ${prepared.routeName}`,
    body: buildIssueBody({ requestId, basePath, metadata, prompt: prepared.codexPrompt }),
    labels: ["raid-radar", "route-request", "codex"],
  });

  return {
    ok: true,
    requestId,
    requestPath: basePath,
    issueUrl: issue.html_url,
    metadata,
  };
}

export async function checkBuildStatus({ token, targetRepository, requestId, issueNumber }) {
  const repo = normalizeRepo(targetRepository);
  if (!repo || !repo.includes("/")) throw new Error("A target repository in the form owner/repo is required.");
  if (!token) throw new Error("GitHub auth is required server-side to check private build status.");
  const [owner, name] = repo.split("/");

  const status = { requestId, issueNumber: issueNumber || null, files: {}, issue: null };
  for (const path of [
    `route-requests/pending/${requestId}/request.json`,
    `route-requests/done/${requestId}/request.json`,
    `docs/${requestId}/index.html`,
  ]) {
    status.files[path] = await githubFileExists({ owner, repo: name, token, path });
  }

  if (issueNumber) {
    status.issue = await getGithubIssue({ owner, repo: name, token, issueNumber });
  }

  status.phase = status.files[`route-requests/done/${requestId}/request.json`]
    ? "done"
    : status.files[`route-requests/pending/${requestId}/request.json`]
      ? "pending"
      : "unknown";
  return status;
}

async function putGithubFile({ owner, repo, branch, token, path, content, message }) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponentPath(path)}`, {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify({
      branch,
      message,
      content: toBase64(content),
    }),
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`GitHub file upload failed for ${path}: ${response.status} ${payload}`);
  }
  return response.json();
}

async function createGithubIssue({ owner, repo, token, title, body, labels }) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: githubHeaders(token),
    body: JSON.stringify({ title, body, labels }),
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`GitHub issue creation failed: ${response.status} ${payload}`);
  }
  return response.json();
}

async function githubFileExists({ owner, repo, token, path }) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponentPath(path)}`, {
    method: "GET",
    headers: githubHeaders(token),
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`GitHub status check failed for ${path}: ${response.status} ${payload}`);
  }
  return true;
}

async function getGithubIssue({ owner, repo, token, issueNumber }) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: "GET",
    headers: githubHeaders(token),
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`GitHub issue check failed: ${response.status} ${payload}`);
  }
  const issue = await response.json();
  return {
    number: issue.number,
    state: issue.state,
    title: issue.title,
    html_url: issue.html_url,
    labels: (issue.labels || []).map((label) => label.name || label),
  };
}

function buildIssueBody({ requestId, basePath, metadata, prompt }) {
  return [
    "New user-owned Raid Radar route request.",
    "",
    `- Request ID: \`${requestId}\``,
    `- GPX: \`${basePath}/route.gpx\``,
    `- Metadata: \`${basePath}/request.json\``,
    `- Build prompt: \`${basePath}/BUILD_PROMPT.md\``,
    `- Route: ${metadata.route_name}`,
    `- Intelligence: ${metadata.intelligence.label}`,
    `- OpenAI resource: ${metadata.openai_resource.mode}`,
    "",
    "Security expectation: this repo should be private unless the user deliberately wants to share the route.",
    "Required user-owned secrets should be configured in this repo, not in the public Raid Radar template repo.",
    "",
    "```md",
    prompt,
    "```",
  ].join("\n");
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "raid-radar-chatgpt-app",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function toBase64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "z");
}

function encodeURIComponentPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

