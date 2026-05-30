const MAX_GPX_KM = 1000;
const DEFAULT_OWNER = "jonasmarcuswalter";
const DEFAULT_REPO = "race-cockpit";
const DEFAULT_BRANCH = "pages";
const DEFAULT_ORIGIN = "https://jonasmarcuswalter.github.io";

export default {
  async fetch(request, env) {
    const origin = env.PUBLIC_ORIGIN || DEFAULT_ORIGIN;
    if (request.method === "OPTIONS") return corsResponse(null, origin);

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return corsJson({ ok: true, service: "raid-radar-intake" }, origin);
    }
    if (request.method !== "POST" || url.pathname !== "/route-request") {
      return corsJson({ error: "Not found" }, origin, 404);
    }

    try {
      const token = env.GITHUB_TOKEN;
      if (!token) return corsJson({ error: "GITHUB_TOKEN is not configured" }, origin, 500);

      const form = await request.formData();
      const file = form.get("gpx");
      if (!file || typeof file.text !== "function") {
        return corsJson({ error: "Missing GPX file field named gpx" }, origin, 400);
      }
      const originalName = cleanFileName(file.name || String(form.get("fileName") || "route.gpx"));
      if (!originalName.toLowerCase().endsWith(".gpx")) {
        return corsJson({ error: "Only .gpx files are accepted" }, origin, 400);
      }

      const gpxText = await file.text();
      const stats = parseGpxStats(gpxText);
      if (stats.points < 2) return corsJson({ error: "GPX has too few route points" }, origin, 400);
      if (stats.km > MAX_GPX_KM) {
        return corsJson({ error: `GPX is ${stats.km.toFixed(1)} km; current limit is ${MAX_GPX_KM} km` }, origin, 400);
      }

      const owner = env.GITHUB_OWNER || DEFAULT_OWNER;
      const repo = env.GITHUB_REPO || DEFAULT_REPO;
      const branch = env.GITHUB_BRANCH || DEFAULT_BRANCH;
      const requestId = `${timestampId()}-${slugify(originalName.replace(/\.gpx$/i, ""))}`;
      const basePath = `route-requests/pending/${requestId}`;
      const metadata = {
        request_id: requestId,
        original_file_name: originalName,
        route_km: Number(stats.km.toFixed(3)),
        point_count: stats.points,
        received_at_utc: new Date().toISOString(),
        status: "pending-codex-build",
        max_km_limit: MAX_GPX_KM,
      };

      await putGithubFile({
        owner,
        repo,
        branch,
        token,
        path: `${basePath}/route.gpx`,
        content: gpxText,
        message: `Add Raid Radar route request ${requestId}`,
      });
      await putGithubFile({
        owner,
        repo,
        branch,
        token,
        path: `${basePath}/request.json`,
        content: `${JSON.stringify(metadata, null, 2)}\n`,
        message: `Add metadata for route request ${requestId}`,
      });
      const issue = await createGithubIssue({
        owner,
        repo,
        token,
        title: `Raid Radar route request: ${originalName}`,
        body: [
          "New Raid Radar route request.",
          "",
          `- Request ID: \`${requestId}\``,
          `- GPX: \`${basePath}/route.gpx\``,
          `- Metadata: \`${basePath}/request.json\``,
          `- Distance: ${metadata.route_km} km`,
          `- Points: ${metadata.point_count}`,
          "",
          "Codex task: build a new Raid Radar route app from this GPX, add relevant POIs, offline map pack, service worker, GitHub Pages route, and subagent QA.",
        ].join("\n"),
        labels: ["route-request", "codex"],
      });

      return corsJson({
        ok: true,
        requestId,
        gpxPath: `${basePath}/route.gpx`,
        metadataPath: `${basePath}/request.json`,
        issueUrl: issue.html_url,
      }, origin);
    } catch (error) {
      return corsJson({ error: error.message || "Upload failed" }, origin, 500);
    }
  },
};

function parseGpxStats(text) {
  const tagRegex = /<(trkpt|rtept)\b([^>]*)>/gi;
  const points = [];
  let match;
  while ((match = tagRegex.exec(text))) {
    const attrs = match[2];
    const lat = Number((attrs.match(/\blat=["']([^"']+)["']/i) || [])[1]);
    const lon = Number((attrs.match(/\blon=["']([^"']+)["']/i) || [])[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) points.push({ lat, lon });
  }
  let meters = 0;
  for (let index = 1; index < points.length; index += 1) {
    meters += haversineMeters(points[index - 1], points[index]);
  }
  return { points: points.length, km: meters / 1000 };
}

function haversineMeters(a, b) {
  const radius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
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

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "raid-radar-intake",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function corsJson(payload, origin, status = 200) {
  return corsResponse(JSON.stringify(payload), origin, status, { "Content-Type": "application/json; charset=utf-8" });
}

function corsResponse(body, origin, status = 204, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extraHeaders,
    },
  });
}

function timestampId() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "z");
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "route";
}

function cleanFileName(value) {
  return value.replace(/[^\w .()äöüÄÖÜß-]/g, "_").slice(0, 120);
}

function encodeURIComponentPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}
