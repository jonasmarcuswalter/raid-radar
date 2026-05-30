#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import shutil
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from re import sub

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "offline-app"
DIST_DIR = APP_DIR / "dist"
DATA_DIR = APP_DIR / "data"
ASSET_DIR = APP_DIR / "assets"

DEFAULT_GPX = ROOT / "routes" / "hamburg-backyard-2026-ultra-draft.gpx"
DEFAULT_VERIFIED = ROOT / "data" / "ultra_verified_resupply.csv"
DEFAULT_CRITICAL = ROOT / "data" / "ultra_critical_resupply.csv"
DEFAULT_SEGMENTS = ROOT / "data" / "ultra_segment_strategy.csv"
DEFAULT_CONFIG = None

CHECKPOINT = {"id": "checkpoint", "name": "Hohenbrünzow Checkpoint", "km": 362.1, "lat": 53.812737, "lon": 13.142642}
VIRTUAL_FINISH = {"id": "virtual_finish", "name": "Virtual Finish Haus der Wilden Weiden", "km": 680.4, "lat": 53.615942, "lon": 10.185245}
SW_TEMPLATE = """const CACHE_NAME = "__CACHE_NAME__";
const CACHE_PREFIX = "__CACHE_PREFIX__";
const ASSETS = __ASSETS__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then(async (response) => {
          if (response && response.ok) {
            const clone = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, clone);
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") return caches.match("./index.html");
          return new Response("Offline asset not cached", { status: 503, statusText: "Offline" });
        });
    }),
  );
});
"""

DEFAULT_RACE_DAYS = {
    "thu": {"label": "Do 25.06", "date": "2026-06-25"},
    "fri": {"label": "Fr 26.06", "date": "2026-06-26"},
    "sat": {"label": "Sa 27.06", "date": "2026-06-27"},
    "sun": {"label": "So 28.06", "date": "2026-06-28"},
}

DEFAULT_DEMO_POSITIONS = [
    {"label": "Start", "km": 0.2},
    {"label": "Schwerin", "km": 178.8},
    {"label": "Malchin", "km": 323.3},
    {"label": "Checkpoint", "km": 362.1},
    {"label": "Wismar", "km": 523.3},
    {"label": "Lübeck", "km": 612.7},
    {"label": "Virtual Finish", "km": 680.4},
    {"label": "RBO", "km": 701.2},
]


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    radius = 6_371_000.0
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def route_point_at_km(points: list[list[float]], km: float) -> dict:
    if km <= points[0][2]:
        return {"lat": points[0][0], "lon": points[0][1], "km": points[0][2]}
    for idx in range(1, len(points)):
        prev = points[idx - 1]
        cur = points[idx]
        if cur[2] >= km:
            span = cur[2] - prev[2] or 1
            t = (km - prev[2]) / span
            return {
                "lat": round(prev[0] + (cur[0] - prev[0]) * t, 6),
                "lon": round(prev[1] + (cur[1] - prev[1]) * t, 6),
                "km": round(km, 3),
            }
    last = points[-1]
    return {"lat": last[0], "lon": last[1], "km": last[2]}


def build_milestones(points: list[list[float]], config: dict) -> list[dict]:
    total_km = points[-1][2]
    if not config:
        return [
            {"id": "start", "name": "RBO Start / Reception", "km": 0.0, "lat": points[0][0], "lon": points[0][1]},
            CHECKPOINT,
            VIRTUAL_FINISH,
            {"id": "rbo", "name": "RBO Reception", "km": total_km, "lat": points[-1][0], "lon": points[-1][1]},
        ]

    milestones = []
    start_label = config.get("start_label", "Start")
    milestones.append({"id": "start", "name": start_label, "km": 0.0, "lat": points[0][0], "lon": points[0][1]})
    for idx, marker in enumerate(config.get("milestones", []), start=1):
        km = clean_num(marker.get("km", 0))
        point = route_point_at_km(points, km)
        milestones.append(
            {
                "id": marker.get("id") or f"milestone-{idx}",
                "name": marker.get("name") or marker.get("label") or f"Milestone {idx}",
                "km": round(km, 1),
                "lat": clean_num(marker.get("lat", point["lat"])),
                "lon": clean_num(marker.get("lon", point["lon"])),
            }
        )
    finish_label = config.get("reception_label") or config.get("race_finish_label") or "Ziel"
    milestones.append({"id": "finish", "name": finish_label, "km": total_km, "lat": points[-1][0], "lon": points[-1][1]})
    return milestones


def parse_gpx(path: Path, config: dict | None = None) -> dict:
    ns = {"g": "http://www.topografix.com/GPX/1/1"}
    root = ET.parse(path).getroot()
    raw_points = [(float(p.attrib["lat"]), float(p.attrib["lon"])) for p in root.findall(".//g:trkpt", ns)]
    if len(raw_points) < 2:
        raise RuntimeError(f"GPX has too few trackpoints: {path}")

    cumulative = [0.0]
    for a, b in zip(raw_points, raw_points[1:]):
        cumulative.append(cumulative[-1] + haversine_m(a, b))

    points = [
        [round(lat, 6), round(lon, 6), round(km / 1000, 3)]
        for (lat, lon), km in zip(raw_points, cumulative)
    ]

    display = []
    last_km = -999.0
    for lat, lon, km in points:
        if km - last_km >= 0.35 or not display:
            display.append([lat, lon, km])
            last_km = km
    if display[-1] != points[-1]:
        display.append(points[-1])

    lats = [p[0] for p in points]
    lons = [p[1] for p in points]
    total_km = points[-1][2]
    config = config or {}
    return {
        "source": str(path.relative_to(ROOT)),
        "total_km": total_km,
        "point_count": len(points),
        "bounds": {
            "min_lat": min(lats),
            "min_lon": min(lons),
            "max_lat": max(lats),
            "max_lon": max(lons),
        },
        "points": points,
        "display_points": display,
        "milestones": build_milestones(points, config),
    }


def clean_num(value: str) -> float:
    try:
        return float(value)
    except Exception:
        raise ValueError(f"Expected numeric value, got {value!r}")


def load_pois(verified_path: Path, critical_path: Path) -> list[dict]:
    critical_ids = set()
    with critical_path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            critical_ids.add(row.get("osm_url") or f"{row.get('name')}@{row.get('route_km')}")

    pois = []
    with verified_path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            osm_id = row.get("osm_url") or f"{row.get('name')}@{row.get('route_km')}"
            is_critical = osm_id in critical_ids or row.get("priority") == "critical"
            pois.append(
                {
                    "id": f"poi-{len(pois) + 1}",
                    "name": row["name"],
                    "category": row["category"],
                    "segment": row["segment"],
                    "priority": "critical" if is_critical else row.get("priority", "candidate"),
                    "critical": is_critical,
                    "route_km": round(clean_num(row["route_km"]), 1),
                    "lat": clean_num(row["lat"]),
                    "lon": clean_num(row["lon"]),
                    "gpx_exit_km": round(clean_num(row["gpx_exit_km"]), 1),
                    "gpx_exit_lat": clean_num(row["gpx_exit_lat"]),
                    "gpx_exit_lon": clean_num(row["gpx_exit_lon"]),
                    "distance_from_route_m": int(round(clean_num(row["distance_from_route_m"]))),
                    "access_note": row["access_note"],
                    "address": row["address"],
                    "hours": {
                        "thu": row["hours_thu_2026_06_25"],
                        "fri": row["hours_fri_2026_06_26"],
                        "sat": row["hours_sat_2026_06_27"],
                        "sun": row["hours_sun_2026_06_28"],
                    },
                    "raw_opening_hours": row["raw_opening_hours"],
                    "source_status": row["source_status"],
                    "source_url": row["source_url"],
                    "google_maps_place_link": row["google_maps_place_link"],
                    "google_maps_directions_link": row["google_maps_directions_link"],
                    "race_use_note": row["race_use_note"],
                    "osm_url": row["osm_url"],
                }
            )
    return sorted(pois, key=lambda poi: (poi["route_km"], not poi["critical"], poi["category"], poi["name"]))


def load_segments(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def build_gaps(config: dict | None = None) -> list[dict]:
    if config and "gaps" in config:
        return config["gaps"]
    return [
        {
            "id": "schwerin-malchin",
            "section": "Schwerin -> Malchin",
            "km_range": [181, 323],
            "last_reliable_stop": "Schwerin km 171-181, Supermärkte plus 24h-Fuel",
            "backup": "Dobbertin CAP nur tagsüber; Malchin Rewe, wenn vor Ladenschluss erreicht",
            "carry": "Essen für Nacht + Frühstück, volle Flaschen, Salz/Koffein, trockene Schicht griffbereit",
        },
        {
            "id": "cp-loop",
            "section": "CP-Loop Malchin/Hohenbrünzow",
            "km_range": [323, 404],
            "last_reliable_stop": "Malchin Rewe/Lidl/Netto/Penny km 323 bzw. 402-404",
            "backup": "Sarow Landmarkt kurz tagsüber; Landkauf unverified",
            "carry": "Genug für CP-Loop und Rückkehr nach Malchin; nicht auf Dorfshops verlassen",
        },
        {
            "id": "malchin-wismar",
            "section": "Malchin -> Wismar",
            "km_range": [404, 519],
            "last_reliable_stop": "Malchin km 402-404",
            "backup": "Lalendorf/Star, Güstrow, Bützow, Neukloster",
            "carry": "Bis mindestens Güstrow/Bützow autonom fahren können",
        },
        {
            "id": "wismar-luebeck",
            "section": "Wismar -> Lübeck",
            "km_range": [519, 612],
            "last_reliable_stop": "Wismar km 519-526",
            "backup": "Boltenhagen saisonal, Esso Selmsdorf/Pre-Lübeck",
            "carry": "Küstenabschnitt nicht auf Sonntag/Spätverkauf bauen",
        },
        {
            "id": "luebeck-hamburg",
            "section": "Lübeck -> Hamburg",
            "km_range": [612, 701],
            "last_reliable_stop": "Lübeck km 612-620",
            "backup": "Sandesneben, Großhansdorf/Ahrensburg, Hamburg-Outskirts",
            "carry": "Finale 90 km: genug für zweite Nacht, Hamburg-Optionen nur als Notfall",
        },
    ]


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def render_sw(cache_name: str, cache_prefix: str, assets: list[str]) -> str:
    return (
        SW_TEMPLATE.replace("__CACHE_NAME__", cache_name)
        .replace("__CACHE_PREFIX__", cache_prefix)
        .replace("__ASSETS__", json.dumps(assets, ensure_ascii=False, indent=2))
    )


def slugify(value: str) -> str:
    slug = sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "offline-race"


def load_config(path: str | None) -> dict:
    if not path:
        return {}
    with resolve_path(path).open(encoding="utf-8") as f:
        return json.load(f)


def resolve_path(path: str | Path) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else ROOT / candidate


def resolve_km(value: object, total_km: float, default: float) -> float:
    if value in (None, "", "total", "route_total"):
        return total_km if value in ("total", "route_total") else default
    return clean_num(value)


def write_manifest(app_name: str, short_name: str) -> None:
    manifest = {
        "name": f"{app_name} Cockpit",
        "short_name": short_name,
        "description": "Offline race cockpit for route, resupply, and leave-point decisions.",
        "start_url": "./index.html",
        "scope": "./",
        "display": "standalone",
        "background_color": "#f5f8f6",
        "theme_color": "#15392c",
        "orientation": "portrait",
        "icons": [
            {"src": "./assets/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": "./assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
    }
    write_json(APP_DIR / "manifest.webmanifest", manifest)


def make_icons() -> None:
    src = ASSET_DIR / "rider-marker@2x.png"
    if not src.exists():
        src = ASSET_DIR / "rider-marker.png"
    img = Image.open(src).convert("RGBA")
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
        icon = Image.new("RGBA", (size, size), "#15392c")
        inner = int(size * 0.78)
        marker = img.resize((inner, inner), Image.Resampling.LANCZOS)
        icon.alpha_composite(marker, ((size - inner) // 2, (size - inner) // 2))
        icon.convert("RGB").save(ASSET_DIR / name)


def copy_tree_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def build(args: argparse.Namespace) -> dict:
    config = load_config(args.config)
    gpx_path = resolve_path(args.gpx)
    verified_path = resolve_path(args.verified)
    critical_path = resolve_path(args.critical)
    segments_path = resolve_path(args.segments)

    route = parse_gpx(gpx_path, config)
    pois = load_pois(verified_path, critical_path)
    gaps = build_gaps(config)
    segments = load_segments(segments_path)
    build_time = datetime.now(timezone.utc).isoformat(timespec="seconds")
    critical_count = sum(1 for poi in pois if poi["critical"])
    finish_default = VIRTUAL_FINISH["km"] if not config else route["total_km"]
    race_finish_km = resolve_km(config.get("race_finish_km"), route["total_km"], finish_default)
    reception_km = resolve_km(config.get("reception_km"), route["total_km"], route["total_km"])
    app_name = config.get("app_name") or args.app_name
    short_name = config.get("short_name") or app_name[:12]
    demo_positions = config.get("demo_positions") or DEFAULT_DEMO_POSITIONS
    race_days = config.get("race_days") or DEFAULT_RACE_DAYS
    meta = {
        "app_name": app_name,
        "short_name": short_name,
        "build_time_utc": build_time,
        "route_source": str(gpx_path.relative_to(ROOT)),
        "verified_poi_source": str(verified_path.relative_to(ROOT)),
        "critical_poi_source": str(critical_path.relative_to(ROOT)),
        "route_total_km": route["total_km"],
        "race_finish_km": race_finish_km,
        "race_finish_label": config.get("race_finish_label", "Virtual Finish" if not config else "Ziel"),
        "reception_km": reception_km,
        "reception_label": config.get("reception_label", "RBO" if not config else "Ziel"),
        "route_point_count": route["point_count"],
        "verified_poi_count": len(pois),
        "critical_poi_count": critical_count,
        "demo_positions": demo_positions,
        "race_days": race_days,
        "basemap": config.get(
            "basemap",
            {
                "status": "pending",
                "note": "MVP uses an offline schematic route/POI map. Add PMTiles corridor pack when tile source is prepared.",
            },
        ),
        "offline_ready": "core-route-poi-schematic",
        "offline_map_pack": config.get(
            "offline_map_pack",
            {
                "status": "missing",
                "label": "PMTiles Route-Korridor",
                "url": "",
                "renderer": "pending",
                "expected_size_mb": None,
                "note": (
                    "PMTiles-Kartenpack ist noch nicht hinterlegt. Route, POIs, Marker und Cockpit "
                    "funktionieren nach Kern-Cache trotzdem offline; Basemap-Anzeige folgt erst mit PMTiles-Renderer."
                ),
            },
        ),
    }

    make_icons()
    write_manifest(app_name, short_name)
    for data_root in [DATA_DIR, DIST_DIR / "data"]:
        write_json(data_root / "route.json", route)
        write_json(data_root / "pois.json", pois)
        write_json(data_root / "gaps.json", gaps)
        write_json(data_root / "segments.json", segments)
        write_json(data_root / "app-meta.json", meta)

    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    (DIST_DIR / "src").mkdir(parents=True, exist_ok=True)
    (DIST_DIR / "assets").mkdir(parents=True, exist_ok=True)
    (DIST_DIR / "data").mkdir(parents=True, exist_ok=True)
    (DIST_DIR / "vendor").mkdir(parents=True, exist_ok=True)

    for name in ["route.json", "pois.json", "gaps.json", "segments.json", "app-meta.json"]:
        copy_tree_file(DATA_DIR / name, DIST_DIR / "data" / name)
    for name in ["index.html", "manifest.webmanifest"]:
        copy_tree_file(APP_DIR / name, DIST_DIR / name)
    for name in ["app.js", "styles.css"]:
        copy_tree_file(APP_DIR / "src" / name, DIST_DIR / "src" / name)
    for name in [
        "rider-marker-source.jpg",
        "rider-marker.png",
        "rider-marker@2x.png",
        "icon-192.png",
        "icon-512.png",
        "apple-touch-icon.png",
    ]:
        copy_tree_file(ASSET_DIR / name, DIST_DIR / "assets" / name)
    if (APP_DIR / "vendor").exists():
        shutil.copytree(APP_DIR / "vendor", DIST_DIR / "vendor", dirs_exist_ok=True)

    assets = [
        "./",
        "./index.html",
        "./manifest.webmanifest",
        "./src/app.js",
        "./src/styles.css",
        "./vendor/leaflet/leaflet.css",
        "./vendor/leaflet/leaflet.js",
        "./vendor/leaflet/images/marker-icon.png",
        "./vendor/leaflet/images/marker-icon-2x.png",
        "./vendor/leaflet/images/marker-shadow.png",
        "./data/route.json",
        "./data/pois.json",
        "./data/gaps.json",
        "./data/segments.json",
        "./data/app-meta.json",
        "./assets/rider-marker.png",
        "./assets/rider-marker@2x.png",
        "./assets/icon-192.png",
        "./assets/icon-512.png",
        "./assets/apple-touch-icon.png",
    ]
    cache_prefix = config.get("cache_prefix") or f"{slugify(app_name)}-offline-v1-"
    cache_name = cache_prefix + build_time.replace(":", "").replace("+", "z")
    rendered_sw = render_sw(cache_name, cache_prefix, assets)
    (APP_DIR / "sw.js").write_text(rendered_sw, encoding="utf-8")
    (DIST_DIR / "sw.js").write_text(rendered_sw, encoding="utf-8")

    zip_path = APP_DIR / (config.get("zip_name") or "hamburg-backyard-offline-pwa-mvp.zip")
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in DIST_DIR.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(DIST_DIR))

    summary = {
        "dist": str(DIST_DIR),
        "zip": str(zip_path),
        "route_points": route["point_count"],
        "route_total_km": route["total_km"],
        "pois": len(pois),
        "critical_pois": critical_count,
        "cache_assets": len(assets),
    }
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build an offline race PWA from GPX and resupply CSVs.")
    parser.add_argument("--gpx", default=str(DEFAULT_GPX))
    parser.add_argument("--verified", default=str(DEFAULT_VERIFIED))
    parser.add_argument("--critical", default=str(DEFAULT_CRITICAL))
    parser.add_argument("--segments", default=str(DEFAULT_SEGMENTS))
    parser.add_argument("--app-name", default="Hamburg Backyard Ultra")
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    return parser.parse_args()


def main() -> None:
    summary = build(parse_args())
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
