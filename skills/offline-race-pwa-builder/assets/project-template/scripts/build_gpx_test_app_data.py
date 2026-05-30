#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import shutil
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

CSV_COLUMNS = [
    "route_km",
    "segment",
    "priority",
    "name",
    "category",
    "brand",
    "operator",
    "address",
    "lat",
    "lon",
    "gpx_exit_km",
    "gpx_exit_lat",
    "gpx_exit_lon",
    "distance_from_route_m",
    "access_note",
    "google_maps_place_link",
    "google_maps_directions_link",
    "hours_thu_2026_06_25",
    "hours_fri_2026_06_26",
    "hours_sat_2026_06_27",
    "hours_sun_2026_06_28",
    "raw_opening_hours",
    "source_url",
    "source_status",
    "official_check_note",
    "last_checked",
    "osm_url",
    "website",
    "race_use_note",
]

FOOD_TAGS = {"restaurant", "cafe", "fast_food", "supermarket", "convenience", "bakery"}


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-") or "gpx-test"


def parse_gpx(path: Path) -> tuple[str, list[tuple[float, float]]]:
    root = ET.parse(path).getroot()
    ns = {"g": root.tag.split("}")[0].strip("{")} if root.tag.startswith("{") else {}
    name_el = root.find(".//g:name", ns) if ns else root.find(".//name")
    name = name_el.text.strip() if name_el is not None and name_el.text else path.stem
    points = []
    for point in root.findall(".//g:trkpt", ns) if ns else root.findall(".//trkpt"):
        points.append((float(point.attrib["lat"]), float(point.attrib["lon"])))
    if len(points) < 2:
        raise RuntimeError(f"GPX has too few points: {path}")
    return name, points


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    radius = 6_371_000.0
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def cumulative_km(points: list[tuple[float, float]]) -> list[float]:
    kms = [0.0]
    for a, b in zip(points, points[1:]):
        kms.append(kms[-1] + haversine_m(a, b) / 1000)
    return kms


def nearest_route_point(points: list[tuple[float, float]], kms: list[float], lat: float, lon: float) -> dict:
    best = None
    lat0 = math.radians(lat)
    for idx in range(1, len(points)):
        a = points[idx - 1]
        b = points[idx]
        ax = (a[1] - lon) * 111320 * math.cos(lat0)
        ay = (a[0] - lat) * 111320
        bx = (b[1] - lon) * 111320 * math.cos(lat0)
        by = (b[0] - lat) * 111320
        dx = bx - ax
        dy = by - ay
        length2 = dx * dx + dy * dy
        t = max(0, min(1, -(ax * dx + ay * dy) / length2)) if length2 else 0
        px = ax + t * dx
        py = ay + t * dy
        distance = math.hypot(px, py)
        if best is None or distance < best["distance"]:
            best = {
                "lat": a[0] + (b[0] - a[0]) * t,
                "lon": a[1] + (b[1] - a[1]) * t,
                "km": kms[idx - 1] + (kms[idx] - kms[idx - 1]) * t,
                "distance": distance,
            }
    return best or {"lat": lat, "lon": lon, "km": 0, "distance": 0}


def overpass_pois(points: list[tuple[float, float]]) -> list[dict]:
    min_lat = min(lat for lat, _ in points) - 0.012
    min_lon = min(lon for _, lon in points) - 0.012
    max_lat = max(lat for lat, _ in points) + 0.012
    max_lon = max(lon for _, lon in points) + 0.012
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"~"fuel|restaurant|cafe|fast_food|drinking_water"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["amenity"~"fuel|restaurant|cafe|fast_food"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["shop"~"supermarket|convenience|bakery"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["shop"~"supermarket|convenience|bakery"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out center tags 220;
    """
    data = urllib.parse.urlencode({"data": query}).encode()
    request = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=data,
        headers={"User-Agent": "codex-gpx-pwa-test/1.0"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.load(response)
    return payload.get("elements", [])


def category_for(tags: dict) -> str:
    amenity = tags.get("amenity")
    shop = tags.get("shop")
    if amenity:
        return amenity
    if shop in {"supermarket", "convenience", "bakery"}:
        return shop
    return "poi"


def select_pois(elements: list[dict], points: list[tuple[float, float]], kms: list[float], limit: int) -> list[dict]:
    candidates = []
    seen = set()
    for element in elements:
        tags = element.get("tags", {})
        lat = element.get("lat") or element.get("center", {}).get("lat")
        lon = element.get("lon") or element.get("center", {}).get("lon")
        if not lat or not lon:
            continue
        category = category_for(tags)
        if category == "drinking_water":
            max_distance = 180
        elif category == "fuel":
            max_distance = 900
        else:
            max_distance = 650
        nearest = nearest_route_point(points, kms, float(lat), float(lon))
        if nearest["distance"] > max_distance:
            continue
        name = tags.get("name") or tags.get("brand") or category.replace("_", " ").title()
        key = (name, round(float(lat), 5), round(float(lon), 5))
        if key in seen:
            continue
        seen.add(key)
        score = nearest["distance"] + (0 if category == "fuel" else 80 if category in FOOD_TAGS else 180)
        candidates.append({"element": element, "tags": tags, "lat": float(lat), "lon": float(lon), "nearest": nearest, "category": category, "name": name, "score": score})

    fuels = sorted([c for c in candidates if c["category"] == "fuel"], key=lambda c: (c["nearest"]["km"], c["score"]))[:3]
    food = sorted([c for c in candidates if c["category"] in FOOD_TAGS], key=lambda c: (c["nearest"]["km"], c["score"]))[:8]
    water = sorted([c for c in candidates if c["category"] == "drinking_water"], key=lambda c: (c["nearest"]["km"], c["score"]))[:2]
    chosen = sorted({id(c): c for c in fuels + food + water}.values(), key=lambda c: c["nearest"]["km"])
    return chosen[:limit]


def google_search(name: str, lat: float, lon: float) -> str:
    return f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(name)}%20{lat:.6f}%2C{lon:.6f}"


def google_directions(origin_lat: float, origin_lon: float, dest_lat: float, dest_lon: float) -> str:
    return (
        "https://www.google.com/maps/dir/?api=1"
        f"&origin={origin_lat:.6f},{origin_lon:.6f}&destination={dest_lat:.6f},{dest_lon:.6f}&travelmode=bicycling"
    )


def normalize_hours(raw: str) -> str:
    if not raw:
        return "unverified"
    if "24/7" in raw or "24h" in raw:
        return "24h"
    matches = re.findall(r"\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}", raw)
    if matches:
        return ", ".join(matches[:3])
    return raw[:80]


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def rows_from_pois(pois: list[dict]) -> list[dict]:
    rows = []
    for idx, poi in enumerate(pois, start=1):
        tags = poi["tags"]
        nearest = poi["nearest"]
        hours = normalize_hours(tags.get("opening_hours", ""))
        address_parts = [tags.get(k) for k in ["addr:street", "addr:housenumber", "addr:postcode", "addr:city"] if tags.get(k)]
        address = " ".join(address_parts) or "OSM-Koordinaten/Maps-Link nutzen"
        osm_url = f"https://www.openstreetmap.org/{poi['element']['type']}/{poi['element']['id']}"
        access_note = "direkt/nahe GPX" if nearest["distance"] <= 120 else "off route - Rückkehr zum exakten Leave Point"
        row = {
            "route_km": f"{nearest['km']:.1f}",
            "segment": "GPX-Test",
            "priority": "critical" if idx <= 8 else "priority-candidate",
            "name": poi["name"],
            "category": "supermarket" if poi["category"] in {"supermarket", "convenience"} else poi["category"],
            "brand": tags.get("brand", ""),
            "operator": tags.get("operator", ""),
            "address": address,
            "lat": f"{poi['lat']:.6f}",
            "lon": f"{poi['lon']:.6f}",
            "gpx_exit_km": f"{nearest['km']:.1f}",
            "gpx_exit_lat": f"{nearest['lat']:.6f}",
            "gpx_exit_lon": f"{nearest['lon']:.6f}",
            "distance_from_route_m": f"{nearest['distance']:.0f}",
            "access_note": access_note,
            "google_maps_place_link": google_search(poi["name"], poi["lat"], poi["lon"]),
            "google_maps_directions_link": google_directions(nearest["lat"], nearest["lon"], poi["lat"], poi["lon"]),
            "hours_thu_2026_06_25": hours,
            "hours_fri_2026_06_26": hours,
            "hours_sat_2026_06_27": hours,
            "hours_sun_2026_06_28": hours,
            "raw_opening_hours": tags.get("opening_hours", ""),
            "source_url": osm_url,
            "source_status": "osm-fallback",
            "official_check_note": "Automatisch aus OSM für iPhone-Test; nicht offiziell verifiziert.",
            "last_checked": "2026-05-30",
            "osm_url": osm_url,
            "website": tags.get("website", ""),
            "race_use_note": "Test-POI entlang deiner GPX. Für Hamburg später wieder mit verifizierten Quellen ersetzen.",
        }
        rows.append(row)
    return rows


def named_place_row(query: str, points: list[tuple[float, float]], kms: list[float]) -> dict | None:
    url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + urllib.parse.quote(query)
    request = urllib.request.Request(url, headers={"User-Agent": "codex-gpx-pwa-test/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = json.load(response)
    except Exception:
        return None
    if not payload:
        return None
    item = payload[0]
    lat = float(item["lat"])
    lon = float(item["lon"])
    nearest = nearest_route_point(points, kms, lat, lon)
    if nearest["distance"] > 900:
        return None
    name = item.get("name") or query
    osm_type = {"node": "node", "way": "way", "relation": "relation"}.get(item.get("osm_type"), "node")
    osm_url = f"https://www.openstreetmap.org/{osm_type}/{item.get('osm_id')}" if item.get("osm_id") else google_search(name, lat, lon)
    return {
        "route_km": f"{nearest['km']:.1f}",
        "segment": "GPX-Test",
        "priority": "critical",
        "name": name,
        "category": item.get("type") if item.get("type") in FOOD_TAGS else "restaurant",
        "brand": "",
        "operator": "",
        "address": item.get("display_name", "Nominatim-Koordinaten/Maps-Link nutzen"),
        "lat": f"{lat:.6f}",
        "lon": f"{lon:.6f}",
        "gpx_exit_km": f"{nearest['km']:.1f}",
        "gpx_exit_lat": f"{nearest['lat']:.6f}",
        "gpx_exit_lon": f"{nearest['lon']:.6f}",
        "distance_from_route_m": f"{nearest['distance']:.0f}",
        "access_note": "direkt/nahe GPX" if nearest["distance"] <= 120 else "off route - Rückkehr zum exakten Leave Point",
        "google_maps_place_link": google_search(name, lat, lon),
        "google_maps_directions_link": google_directions(nearest["lat"], nearest["lon"], lat, lon),
        "hours_thu_2026_06_25": "unverified",
        "hours_fri_2026_06_26": "unverified",
        "hours_sat_2026_06_27": "unverified",
        "hours_sun_2026_06_28": "unverified",
        "raw_opening_hours": "",
        "source_url": osm_url,
        "source_status": "osm-fallback",
        "official_check_note": "Aus Nominatim ergänzt; Öffnungszeiten nicht geprüft.",
        "last_checked": "2026-05-30",
        "osm_url": osm_url,
        "website": "",
        "race_use_note": "Ziel-/Namens-POI aus der GPX-Bezeichnung ergänzt. Vor echter Nutzung prüfen.",
    }


def write_segments(path: Path, total_km: float, name: str) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "segment",
                "from",
                "to",
                "segment_km_roadbook",
                "cum_km_roadbook",
                "gpx_milestone_km",
                "moving_time_at_20_roadbook",
                "rolling_eta_no_stops_roadbook",
                "rolling_eta_no_stops_gpx_milestone",
                "daylight_exposure",
                "risk_notes",
            ],
        )
        writer.writeheader()
        writer.writerow(
            {
                "segment": "1",
                "from": "Start",
                "to": "Ziel",
                "segment_km_roadbook": f"{total_km:.1f}",
                "cum_km_roadbook": f"{total_km:.1f}",
                "gpx_milestone_km": f"{total_km:.1f}",
                "moving_time_at_20_roadbook": f"{int(total_km // 20)}:{int((total_km / 20 % 1) * 60):02d}",
                "rolling_eta_no_stops_roadbook": "Heute",
                "rolling_eta_no_stops_gpx_milestone": "Heute",
                "daylight_exposure": "iPhone-Test",
                "risk_notes": f"{name}: Test-App für Karte/GPS/POIs, keine verifizierte Versorgung.",
            }
        )


def write_config(path: Path, app_name: str, total_km: float) -> None:
    today = date(2026, 5, 30)
    race_days = {
        "thu": {"label": "Heute 30.05", "date": str(today)},
        "fri": {"label": "So 31.05", "date": str(today + timedelta(days=1))},
        "sat": {"label": "Mo 01.06", "date": str(today + timedelta(days=2))},
        "sun": {"label": "Di 02.06", "date": str(today + timedelta(days=3))},
    }
    demo_positions = [
        {"label": "Start", "km": 0.2},
        {"label": "25%", "km": round(total_km * 0.25, 1)},
        {"label": "Mitte", "km": round(total_km * 0.5, 1)},
        {"label": "75%", "km": round(total_km * 0.75, 1)},
        {"label": "Ziel", "km": round(total_km, 1)},
    ]
    config = {
        "app_name": app_name,
        "short_name": "GPX Test",
        "start_label": "Start",
        "race_finish_km": "total",
        "race_finish_label": "Ziel",
        "reception_km": "total",
        "reception_label": "Ziel",
        "cache_prefix": "gpx-iphone-test-offline-v1-",
        "zip_name": "gpx-iphone-test-pwa.zip",
        "race_days": race_days,
        "demo_positions": demo_positions,
        "milestones": [
            {"id": "quarter", "name": "25%", "km": round(total_km * 0.25, 1)},
            {"id": "half", "name": "Mitte", "km": round(total_km * 0.5, 1)},
            {"id": "three-quarter", "name": "75%", "km": round(total_km * 0.75, 1)},
        ],
        "gaps": [
            {
                "id": "test-loop",
                "section": "GPX iPhone-Test",
                "km_range": [0, round(total_km, 1)],
                "last_reliable_stop": "Testdaten aus OSM; für echte Verpflegung bitte separat prüfen.",
                "backup": "Heute Garmin/Komoot/Apple/Google Maps parallel verwenden.",
                "carry": "Teste GPS starten, Karte verschieben, POI antippen, Flugmodus/Offline-Check.",
            }
        ],
        "basemap": {
            "status": "online-osm",
            "note": "Online OSM tiles for the mobile test. Route, POIs and app shell are cached; true offline basemap needs PMTiles.",
        },
    }
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create test GPX/POI/config inputs for the offline PWA.")
    parser.add_argument("--gpx", required=True)
    parser.add_argument("--slug", default="komoot-chnuschper-huesli")
    parser.add_argument("--limit", type=int, default=12)
    args = parser.parse_args()

    source_gpx = Path(args.gpx)
    name, points = parse_gpx(source_gpx)
    kms = cumulative_km(points)
    total_km = kms[-1]
    slug = slugify(args.slug)
    route_path = ROOT / "routes" / f"{slug}.gpx"
    verified_path = ROOT / "data" / f"{slug}_resupply.csv"
    critical_path = ROOT / "data" / f"{slug}_critical_resupply.csv"
    segments_path = ROOT / "data" / f"{slug}_segments.csv"
    config_path = ROOT / "data" / f"{slug}_app_config.json"

    route_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_gpx, route_path)
    elements = overpass_pois(points)
    rows = rows_from_pois(select_pois(elements, points, kms, args.limit))
    if "chnuschper" in name.lower() and not any("chnuschper" in row["name"].lower() for row in rows):
        extra = named_place_row("Chnuschper-Hüsli Stallikon", points, kms)
        if extra:
            rows.append(extra)
            rows.sort(key=lambda row: float(row["route_km"]))
    if not rows:
        raise RuntimeError("No POIs found near route")
    write_csv(verified_path, rows)
    write_csv(critical_path, [row for row in rows if row["priority"] == "critical"])
    write_segments(segments_path, total_km, name)
    write_config(config_path, name, total_km)
    print(
        json.dumps(
            {
                "route": str(route_path),
                "verified": str(verified_path),
                "critical": str(critical_path),
                "segments": str(segments_path),
                "config": str(config_path),
                "route_points": len(points),
                "route_total_km": round(total_km, 3),
                "pois": len(rows),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
