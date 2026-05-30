import test from "node:test";
import assert from "node:assert/strict";
import { prepareRouteBuild } from "../src/build-policy.js";

test("prepares a balanced private user-owned build", () => {
  const result = prepareRouteBuild({
    routeName: "Sunday Raid",
    targetRepository: "friend/raid-radar-routes",
    intelligence: "balanced",
    stats: { routeKm: 109.8, pointCount: 1716 },
  });
  assert.equal(result.routeSlug, "sunday-raid");
  assert.equal(result.openaiResource.mode, "user_owned");
  assert.equal(result.intelligence.reasoningEffort, "medium");
  assert.equal(result.warnings.length, 0);
  assert.match(result.codexPrompt, /user's own OpenAI\/Codex secret/);
});

test("warns when the public template repo is selected", () => {
  const result = prepareRouteBuild({
    routeName: "Private Home Route",
    targetRepository: "jonasmarcuswalter/raid-radar",
  });
  assert.equal(result.openaiResource.browserTokenPolicy, "never-store-openai-or-github-tokens-in-browser");
  assert.ok(result.warnings.some((warning) => warning.includes("öffentliche Raid-Radar-Repo")));
});

