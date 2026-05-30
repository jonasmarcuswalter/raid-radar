export const PUBLIC_TEMPLATE_REPO = "jonasmarcuswalter/raid-radar";

export const BUILD_TARGETS = {
  codex_github_action: {
    label: "Codex GitHub Action",
    description: "Der private User-Repo bekommt einen Request; ein Workflow/Codex-Run baut daraus die Route-App.",
  },
  codex_cli: {
    label: "Codex CLI",
    description: "Der User oder ein Runner startet Codex lokal/non-interactive im eigenen Checkout.",
  },
  codex_sdk: {
    label: "Codex SDK",
    description: "Ein eigener Backend-Worker stößt Codex per SDK an und behält GPX/Secrets im User-Kontext.",
  },
  guided_handoff: {
    label: "Guided Codex handoff",
    description: "Die App erzeugt Request-Dateien und einen fertigen Prompt, den der User in Codex ausführt.",
  },
};

export const INTELLIGENCE_PROFILES = {
  fast: {
    label: "Fast raid scan",
    reasoningEffort: "low",
    costProfile: "low",
    poiDensity: "sparse",
    officialSourceDepth: "critical-only",
    mapPack: "basic-corridor",
    description: "Schneller, günstiger Build mit wenigen relevanten Raid Stops und begrenzter Quellenprüfung.",
  },
  balanced: {
    label: "Balanced raid radar",
    reasoningEffort: "medium",
    costProfile: "medium",
    poiDensity: "route-first",
    officialSourceDepth: "best-stops-and-gaps",
    mapPack: "standard-corridor",
    recommended: true,
    description: "Empfohlen: gute POI-Auswahl, kritische Lücken, offizielle Quellen für die wichtigsten Stops.",
  },
  deep: {
    label: "Deep raid research",
    reasoningEffort: "high",
    costProfile: "higher",
    poiDensity: "dense-critical",
    officialSourceDepth: "broad-crosscheck",
    mapPack: "expanded-corridor",
    description: "Mehr Recherche, bessere Sonntags-/Nachtlogik, mehr Backups und Konfliktwarnungen.",
  },
  ultra: {
    label: "Ultra paranoia mode",
    reasoningEffort: "xhigh",
    costProfile: "highest",
    poiDensity: "max-useful",
    officialSourceDepth: "source-conflict-audit",
    mapPack: "expanded-corridor",
    description: "Für lange/risikoreiche Fahrten: maximale Prüfung, explizite Unsicherheiten und Final-Week-Checks.",
  },
};

export function prepareRouteBuild({
  routeName,
  fileName = "route.gpx",
  visibility = "private",
  targetRepository,
  buildTarget = "codex_github_action",
  intelligence = "balanced",
  notes = "",
  stats = null,
}) {
  const selectedProfile = INTELLIGENCE_PROFILES[intelligence] || INTELLIGENCE_PROFILES.balanced;
  const selectedTarget = BUILD_TARGETS[buildTarget] || BUILD_TARGETS.codex_github_action;
  const cleanName = String(routeName || fileName.replace(/\.gpx$/i, "") || "Route").trim();
  const routeSlug = slugify(cleanName);
  const warnings = [];

  if (!targetRepository) {
    warnings.push("Noch kein privates User-Repo gesetzt. Das ist für echte GPX-Requests Pflicht.");
  } else if (normalizeRepo(targetRepository) === PUBLIC_TEMPLATE_REPO) {
    warnings.push("Das öffentliche Raid-Radar-Repo ist nur Template/Demo. Für private GPX bitte ein User-owned Repo nutzen.");
  }

  if (visibility !== "private") {
    warnings.push("Öffentliche Routen können Start/Ziel oder Wohnorte verraten. Private Builds bleiben Standard.");
  }

  const requiredSecrets = requiredOpenAiSecretsForTarget(buildTarget);
  const codexPrompt = buildCodexPrompt({
    routeName: cleanName,
    routeSlug,
    fileName,
    selectedProfile,
    selectedTarget,
    stats,
    notes,
  });

  return {
    routeName: cleanName,
    routeSlug,
    visibility,
    targetRepository: targetRepository || null,
    buildTarget,
    buildTargetLabel: selectedTarget.label,
    openaiResource: {
      mode: "user_owned",
      owner: "route-request-user",
      requiredSecrets,
      browserTokenPolicy: "never-store-openai-or-github-tokens-in-browser",
    },
    intelligence: {
      key: Object.hasOwn(INTELLIGENCE_PROFILES, intelligence) ? intelligence : "balanced",
      ...selectedProfile,
    },
    poiStrategy: {
      maxRouteKm: 1000,
      useOfficialSourcesFirst: true,
      googleMapsCrosscheck: true,
      osmCandidateOnly: true,
      sundayAndHolidayLogic: true,
      markUnverifiedStops: true,
    },
    warnings,
    codexPrompt,
  };
}

function requiredOpenAiSecretsForTarget(buildTarget) {
  if (buildTarget === "codex_github_action") return ["CODEX_API_KEY or OPENAI_API_KEY"];
  if (buildTarget === "codex_sdk") return ["OPENAI_API_KEY"];
  if (buildTarget === "codex_cli") return ["OPENAI_API_KEY or Codex CLI login on the user's machine"];
  return ["User runs Codex with their own OpenAI/Codex account"];
}

function buildCodexPrompt({ routeName, routeSlug, fileName, selectedProfile, selectedTarget, stats, notes }) {
  const statsLine = stats
    ? `Route stats: ${Number(stats.routeKm || 0).toFixed(1)} km, ${stats.pointCount || "unknown"} points.`
    : "Route stats: validate from route.gpx before building.";

  return [
    `Build a Raid Radar route app for "${routeName}" (${routeSlug}).`,
    `Input GPX: ${fileName}. ${statsLine}`,
    `Use the existing Raid Radar template from ${PUBLIC_TEMPLATE_REPO}, but keep this GPX and generated route data in the user's repo unless the user explicitly requests public sharing.`,
    `OpenAI resource policy: use the user's own OpenAI/Codex secret configured in this repo; do not use Jonas's public Raid Radar repo secrets.`,
    `Build target: ${selectedTarget.label}.`,
    `Intelligence profile: ${selectedProfile.label} (${selectedProfile.reasoningEffort} reasoning, ${selectedProfile.costProfile} cost profile).`,
    "Generate route JSON, relevant POIs, gaps, offline map pack where feasible, manifest, service worker, and route-page branding.",
    "POI rules: official source first, Google Maps crosscheck, OSM only as candidate/fallback, mark uncertain sources, and make off-route return-to-leave-point behavior explicit.",
    "Security rules: do not commit API keys, OAuth tokens, or private GPX into a public repo.",
    notes ? `User notes: ${notes}` : "",
  ].filter(Boolean).join("\n");
}

export function slugify(value) {
  return String(value || "route")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "route";
}

export function normalizeRepo(value) {
  return String(value || "")
    .trim()
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
}

