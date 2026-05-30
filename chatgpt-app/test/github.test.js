import test from "node:test";
import assert from "node:assert/strict";
import { createRouteRequest } from "../src/github.js";

test("refuses to store private requests in the public template repo by default", async () => {
  await assert.rejects(
    createRouteRequest({
      token: "fake",
      targetRepository: "jonasmarcuswalter/raid-radar",
      request: { routeName: "Home loop", fileName: "home.gpx" },
      gpxText: "<gpx></gpx>",
    }),
    /public Raid Radar template repo/,
  );
});

test("requires server-side GitHub auth before persisting GPX", async () => {
  await assert.rejects(
    createRouteRequest({
      token: "",
      targetRepository: "friend/private-routes",
      request: { routeName: "Home loop", fileName: "home.gpx" },
      gpxText: "<gpx></gpx>",
    }),
    /GitHub auth is required/,
  );
});

