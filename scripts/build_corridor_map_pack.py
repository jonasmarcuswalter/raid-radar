#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


OVERPASS_URL = "https://overpass-api.de/api/interpreter"
HIGHWAY_RE = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|cycleway|track|path|footway|pedestrian"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def sample_route(points: list[list[float]], chunk_km: float) -> list[tuple[float, float, float]]:
    if not points:
        return []
    samples = [(points[0][0], points[0][1], points[0][2])]
    next_km = chunk_km
    for lat, lon, km in points:
        if km >= next_km:
            samples.append((lat, lon, km))
            next_km += chunk_km
    last = points[-1]
    if samples[-1][2] != last[2]:
        samples.append((last[0], last[1], last[2]))
    return samples


def bbox_for_point(lat: float, lon: float, radius_km: float) -> tuple[float, float, float, float]:
    dlat = radius_km / 111.32
    dlon = radius_km / (111.32 * max(0.2, math.cos(math.radians(lat))))
    return lat - dlat, lon - dlon, lat + dlat, lon + dlon


def merge_bounds(bounds: list[tuple[float, float, float, float]]) -> dict:
    south = min(b[0] for b in bounds)
    west = min(b[1] for b in bounds)
    north = max(b[2] for b in bounds)
    east = max(b[3] for b in bounds)
    return {"min_lat": round(south, 6), "min_lon": round(west, 6), "max_lat": round(north, 6), "max_lon": round(east, 6)}


def overpass_query(bbox: tuple[float, float, float, float], timeout: int) -> str:
    south, west, north, east = bbox
    bbox_text = f"{south:.6f},{west:.6f},{north:.6f},{east:.6f}"
    return f"""
[out:json][timeout:{timeout}];
(
  way["highway"~"^({HIGHWAY_RE})$"]({bbox_text});
  way["railway"~"^(rail|tram|light_rail)$"]({bbox_text});
  way["waterway"]({bbox_text});
  way["natural"="water"]({bbox_text});
  way["landuse"="reservoir"]({bbox_text});
  node["place"~"^(city|town|village|suburb|hamlet)$"]({bbox_text});
);
out body geom;
"""


def fetch_overpass(query: str, timeout: int, endpoint: str) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(endpoint, data=data, headers={"User-Agent": "raid-radar-offline-map-pack/1.0"})
    with urllib.request.urlopen(req, timeout=timeout + 20) as response:
        return json.loads(response.read().decode("utf-8"))


def classify_way(tags: dict) -> str | None:
    highway = tags.get("highway")
    if highway in {"motorway", "trunk"}:
        return "motorway"
    if highway in {"primary", "secondary"}:
        return "major"
    if highway in {"tertiary", "unclassified"}:
        return "medium"
    if highway in {"cycleway", "track", "path", "footway", "pedestrian"}:
        return "path"
    if highway:
        return "minor"
    if tags.get("railway"):
        return "railway"
    if tags.get("waterway"):
        return "waterway"
    if tags.get("natural") == "water" or tags.get("landuse") == "reservoir":
        return "water"
    return None


def simplify(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return points
    first, last = points[0], points[-1]
    max_dist = -1.0
    index = 0
    for idx, point in enumerate(points[1:-1], start=1):
        dist = perpendicular_distance(point, first, last)
        if dist > max_dist:
            max_dist = dist
            index = idx
    if max_dist > epsilon:
        left = simplify(points[: index + 1], epsilon)
        right = simplify(points[index:], epsilon)
        return left[:-1] + right
    return [first, last]


def perpendicular_distance(point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> float:
    px, py = point[1], point[0]
    sx, sy = start[1], start[0]
    ex, ey = end[1], end[0]
    dx = ex - sx
    dy = ey - sy
    if dx == 0 and dy == 0:
        return math.hypot(px - sx, py - sy)
    t = max(0.0, min(1.0, ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)))
    proj_x = sx + t * dx
    proj_y = sy + t * dy
    return math.hypot(px - proj_x, py - proj_y)


def feature_from_element(element: dict, epsilon: float) -> dict | None:
    tags = element.get("tags", {})
    if element.get("type") == "node":
      return {
          "id": f"node/{element['id']}",
          "type": "point",
          "kind": "place",
          "name": tags.get("name", ""),
          "lat": round(float(element["lat"]), 6),
          "lon": round(float(element["lon"]), 6),
      }
    kind = classify_way(tags)
    geom = element.get("geometry") or []
    if not kind or len(geom) < 2:
        return None
    points = [(float(p["lat"]), float(p["lon"])) for p in geom]
    points = simplify(points, epsilon)
    if len(points) < 2:
        return None
    is_closed = len(points) >= 4 and points[0] == points[-1]
    feature_type = "polygon" if kind == "water" and is_closed else "line"
    return {
        "id": f"way/{element['id']}",
        "type": feature_type,
        "kind": kind,
        "name": tags.get("name", ""),
        "points": [[round(lat, 6), round(lon, 6)] for lat, lon in points],
    }


def build_pack(args: argparse.Namespace) -> dict:
    route = read_json(Path(args.route_json))
    points = route["points"]
    samples = sample_route(points, args.chunk_km)
    if args.max_chunks:
        samples = samples[: args.max_chunks]
    bboxes = [bbox_for_point(lat, lon, args.radius_km) for lat, lon, _ in samples]
    features_by_id: dict[str, dict] = {}
    errors = []
    for idx, bbox in enumerate(bboxes, start=1):
        if args.no_overpass:
            break
        last_error = None
        for attempt in range(1, args.retries + 2):
            try:
                query = overpass_query(bbox, args.timeout)
                payload = fetch_overpass(query, args.timeout, args.overpass_url)
                for element in payload.get("elements", []):
                    feature = feature_from_element(element, args.simplify_epsilon)
                    if feature:
                        features_by_id[feature["id"]] = feature
                print(f"chunk {idx}/{len(bboxes)} ok · features {len(features_by_id)}")
                last_error = None
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt <= args.retries:
                    wait = args.retry_sleep * attempt
                    print(f"chunk {idx}/{len(bboxes)} retry {attempt}/{args.retries} after {exc}; sleeping {wait:.0f}s")
                    time.sleep(wait)
                else:
                    errors.append(f"chunk {idx}: {exc}")
                    print(f"chunk {idx}/{len(bboxes)} failed: {exc}")
        if last_error is None and args.sleep:
            time.sleep(args.sleep)

    features = sorted(features_by_id.values(), key=lambda f: (f["type"], f["kind"], f.get("name", ""), f["id"]))
    pack = {
        "schema": "raid-radar-corridor-map-v1",
        "build_time_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "openstreetmap-overpass" if features else "empty",
        "route_total_km": route.get("total_km"),
        "bounds": merge_bounds(bboxes),
        "radius_km": args.radius_km,
        "chunk_km": args.chunk_km,
        "feature_count": len(features),
        "features": features,
        "errors": errors,
        "note": "Offline vector corridor pack generated from OpenStreetMap via Overpass. Not a turn-by-turn navigation source.",
    }
    write_json(Path(args.output), pack)
    return pack


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a small offline vector corridor map pack from a route.json file.")
    parser.add_argument("--route-json", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--radius-km", type=float, default=1.2)
    parser.add_argument("--chunk-km", type=float, default=5.0)
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--overpass-url", default=OVERPASS_URL)
    parser.add_argument("--sleep", type=float, default=0.6)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--retry-sleep", type=float, default=12.0)
    parser.add_argument("--simplify-epsilon", type=float, default=0.00008)
    parser.add_argument("--max-chunks", type=int, default=0)
    parser.add_argument("--no-overpass", action="store_true")
    return parser.parse_args()


def main() -> None:
    pack = build_pack(parse_args())
    print(json.dumps({"features": pack["feature_count"], "output": pack["schema"], "errors": len(pack["errors"])}, indent=2))


if __name__ == "__main__":
    main()
