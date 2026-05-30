import test from "node:test";
import assert from "node:assert/strict";
import { validateGpx } from "../src/gpx.js";

test("validates a small GPX route", () => {
  const gpxText = `<?xml version="1.0"?><gpx><trk><trkseg>
    <trkpt lat="54.0" lon="9.0"></trkpt>
    <trkpt lat="54.1" lon="9.1"></trkpt>
  </trkseg></trk></gpx>`;
  const result = validateGpx({ fileName: "ride.gpx", gpxText });
  assert.equal(result.ok, true);
  assert.equal(result.stats.pointCount, 2);
  assert.ok(result.stats.routeKm > 12);
});

test("rejects non GPX file names", () => {
  const result = validateGpx({ fileName: "ride.txt", gpxText: "<gpx></gpx>" });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /\.gpx/);
});

test("rejects routes longer than 1000 km", () => {
  const gpxText = `<?xml version="1.0"?><gpx><trk><trkseg>
    <trkpt lat="0" lon="0"></trkpt>
    <trkpt lat="0" lon="20"></trkpt>
  </trkseg></trk></gpx>`;
  const result = validateGpx({ fileName: "too-long.gpx", gpxText });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /1000 km/);
});

