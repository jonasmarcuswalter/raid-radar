import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { validateGpx } from "./gpx.js";
import { BUILD_TARGETS, INTELLIGENCE_PROFILES, prepareRouteBuild } from "./build-policy.js";
import { checkBuildStatus, createRouteRequest } from "./github.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const widgetPath = path.join(__dirname, "../public/raid-radar-widget.html");

const server = new McpServer({
  name: "raid-radar-chatgpt-app",
  version: "0.1.0",
});

server.registerResource(
  "raid-radar-route-builder",
  "ui://raid-radar/route-builder.html",
  {
    title: "Raid Radar Route Builder",
    description: "Validate GPX files and prepare private user-owned Raid Radar builds.",
    mimeType: "text/html",
  },
  async () => ({
    contents: [
      {
        uri: "ui://raid-radar/route-builder.html",
        mimeType: "text/html",
        text: await readFile(widgetPath, "utf8"),
      },
    ],
  }),
);

server.registerTool(
  "validate_gpx",
  {
    title: "Validate GPX",
    description: "Validate a GPX file, enforce the 1000 km limit, and return basic route stats.",
    inputSchema: {
      fileName: z.string().default("route.gpx"),
      gpxText: z.string().describe("Raw GPX XML text supplied by the user or app component."),
    },
    _meta: {
      "openai/outputTemplate": "ui://raid-radar/route-builder.html",
    },
  },
  async ({ fileName, gpxText }) => {
    const result = validateGpx({ fileName, gpxText });
    return toolResult(
      result.ok
        ? `GPX ist valide: ${result.stats.routeKm.toFixed(1)} km, ${result.stats.pointCount} Punkte.`
        : `GPX ist noch nicht buildbar: ${result.errors.join(" ")}`,
      result,
    );
  },
);

server.registerTool(
  "prepare_route_build",
  {
    title: "Prepare Route Build",
    description: "Prepare a user-owned Raid Radar build request and intelligence profile without storing GPX data.",
    inputSchema: {
      routeName: z.string(),
      fileName: z.string().default("route.gpx"),
      visibility: z.enum(["private", "unlisted", "public"]).default("private"),
      targetRepository: z.string().optional(),
      buildTarget: z.enum(Object.keys(BUILD_TARGETS)).default("codex_github_action"),
      intelligence: z.enum(Object.keys(INTELLIGENCE_PROFILES)).default("balanced"),
      notes: z.string().optional().default(""),
      stats: z
        .object({
          routeKm: z.number().optional(),
          pointCount: z.number().optional(),
        })
        .optional(),
    },
    _meta: {
      "openai/outputTemplate": "ui://raid-radar/route-builder.html",
    },
  },
  async (input) => {
    const result = prepareRouteBuild(input);
    return toolResult(
      `Build vorbereitet: ${result.routeName}, Profil ${result.intelligence.label}. OpenAI-Policy: ${result.openaiResource.mode}.`,
      result,
    );
  },
);

server.registerTool(
  "connect_github",
  {
    title: "Connect GitHub",
    description: "Explain the GitHub connection expected for private user-owned route repositories.",
    inputSchema: {
      targetRepository: z.string().optional(),
      desiredVisibility: z.enum(["private", "unlisted", "public"]).default("private"),
    },
    _meta: {
      "openai/outputTemplate": "ui://raid-radar/route-builder.html",
    },
  },
  async ({ targetRepository, desiredVisibility }) => {
    const configured = Boolean(process.env.RAID_RADAR_GITHUB_TOKEN || process.env.GITHUB_TOKEN);
    const result = {
      ready: configured && Boolean(targetRepository),
      authMode: "server-side-oauth-or-dev-token",
      targetRepository: targetRepository || process.env.RAID_RADAR_DEFAULT_TARGET_REPO || null,
      desiredVisibility,
      requiredScopes: ["contents:write", "issues:write", "metadata:read"],
      productionNote: "In production this should be a GitHub OAuth/App install for the user's own repository.",
      devTokenConfigured: configured,
    };
    return toolResult(
      configured
        ? "GitHub-Serverauth ist für diesen Dev-Server konfiguriert."
        : "GitHub ist noch nicht verbunden. Der GPX-Request wird erst gespeichert, wenn ein serverseitiger GitHub-Token/OAuth-Flow vorhanden ist.",
      result,
    );
  },
);

server.registerTool(
  "connect_openai",
  {
    title: "Connect User OpenAI Resource",
    description: "Return the user-owned OpenAI/Codex secret policy for a route build.",
    inputSchema: {
      buildTarget: z.enum(Object.keys(BUILD_TARGETS)).default("codex_github_action"),
      intelligence: z.enum(Object.keys(INTELLIGENCE_PROFILES)).default("balanced"),
    },
    _meta: {
      "openai/outputTemplate": "ui://raid-radar/route-builder.html",
    },
  },
  async ({ buildTarget, intelligence }) => {
    const prepared = prepareRouteBuild({
      routeName: "New route",
      buildTarget,
      intelligence,
      visibility: "private",
    });
    const result = {
      mode: "user_owned",
      buildTarget,
      intelligence: prepared.intelligence,
      requiredSecrets: prepared.openaiResource.requiredSecrets,
      whereToStoreSecrets: "User-owned private GitHub repo secrets or the user's own Codex CLI/SDK environment.",
      browserPolicy: "Never paste or store OpenAI/Codex keys in the Raid Radar public browser app.",
      jonasResourcePolicy: "Jonas's public Raid Radar repo provides templates and docs only; it does not pay for private route intelligence.",
    };
    return toolResult("OpenAI-Ressource bleibt beim User: Secrets ins eigene Repo/Codex-Environment, nicht in die öffentliche Seite.", result);
  },
);

server.registerTool(
  "create_route_request",
  {
    title: "Create Route Request",
    description: "Persist a validated GPX route request into the user's repository and open a Codex-ready issue.",
    inputSchema: {
      routeName: z.string(),
      fileName: z.string().default("route.gpx"),
      gpxText: z.string(),
      targetRepository: z.string().describe("User-owned repository in owner/repo form."),
      branch: z.string().default(process.env.RAID_RADAR_DEFAULT_BRANCH || "main"),
      visibility: z.enum(["private", "unlisted", "public"]).default("private"),
      buildTarget: z.enum(Object.keys(BUILD_TARGETS)).default("codex_github_action"),
      intelligence: z.enum(Object.keys(INTELLIGENCE_PROFILES)).default("balanced"),
      notes: z.string().optional().default(""),
    },
    _meta: {
      "openai/outputTemplate": "ui://raid-radar/route-builder.html",
    },
  },
  async (input) => {
    const validation = validateGpx({ fileName: input.fileName, gpxText: input.gpxText });
    if (!validation.ok) {
      return toolResult(`GPX nicht gespeichert: ${validation.errors.join(" ")}`, { ok: false, validation });
    }

    const token = process.env.RAID_RADAR_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
      return toolResult("Noch kein GitHub OAuth/Token vorhanden. GPX wurde nicht gespeichert.", {
        ok: false,
        reason: "needs_github_auth",
        validation,
        nextStep: "Connect GitHub for the user's private route repo, then call create_route_request again.",
      });
    }

    const result = await createRouteRequest({
      token,
      targetRepository: input.targetRepository,
      branch: input.branch,
      allowPublicRepoRequests: process.env.RAID_RADAR_ALLOW_PUBLIC_REPO_REQUESTS === "true",
      request: {
        ...input,
        stats: validation.stats,
      },
      gpxText: input.gpxText,
    });
    return toolResult(`Route-Request erstellt: ${result.requestId}`, result);
  },
);

server.registerTool(
  "check_build_status",
  {
    title: "Check Build Status",
    description: "Check the status of a user-owned Raid Radar route request in GitHub.",
    inputSchema: {
      targetRepository: z.string(),
      requestId: z.string(),
      issueNumber: z.number().int().positive().optional(),
    },
  },
  async (input) => {
    const token = process.env.RAID_RADAR_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
      return toolResult("Status nicht abrufbar: GitHub ist noch nicht verbunden.", {
        ok: false,
        reason: "needs_github_auth",
      });
    }
    const result = await checkBuildStatus({ token, ...input });
    return toolResult(`Build-Status: ${result.phase}`, result);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

function toolResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

