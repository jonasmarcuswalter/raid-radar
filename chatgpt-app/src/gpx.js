export const MAX_GPX_KM = 1000;

export function parseGpxStats(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("GPX content is empty");
  }

  const tagRegex = /<(trkpt|rtept)\b([^>]*)>/gi;
  const points = [];
  let match;
  while ((match = tagRegex.exec(text))) {
    const attrs = match[2];
    const lat = Number((attrs.match(/\blat=["']([^"']+)["']/i) || [])[1]);
    const lon = Number((attrs.match(/\blon=["']([^"']+)["']/i) || [])[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      points.push({ lat, lon });
    }
  }

  if (points.length < 2) {
    return {
      pointCount: points.length,
      routeKm: 0,
      start: points[0] || null,
      finish: points[points.length - 1] || null,
      bounds: null,
    };
  }

  let meters = 0;
  const bounds = {
    minLat: points[0].lat,
    maxLat: points[0].lat,
    minLon: points[0].lon,
    maxLon: points[0].lon,
  };

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    bounds.minLat = Math.min(bounds.minLat, point.lat);
    bounds.maxLat = Math.max(bounds.maxLat, point.lat);
    bounds.minLon = Math.min(bounds.minLon, point.lon);
    bounds.maxLon = Math.max(bounds.maxLon, point.lon);
    if (index > 0) meters += haversineMeters(points[index - 1], point);
  }

  return {
    pointCount: points.length,
    routeKm: meters / 1000,
    start: points[0],
    finish: points[points.length - 1],
    bounds,
  };
}

export function validateGpx({ fileName = "route.gpx", gpxText }) {
  const errors = [];
  const warnings = [];
  const cleanName = String(fileName || "route.gpx").trim();

  if (!cleanName.toLowerCase().endsWith(".gpx")) {
    errors.push("Nur .gpx-Dateien werden akzeptiert.");
  }

  let stats = null;
  try {
    stats = parseGpxStats(gpxText);
  } catch (error) {
    errors.push(error.message || "GPX konnte nicht gelesen werden.");
  }

  if (stats) {
    if (stats.pointCount < 2) errors.push("Die GPX enthält weniger als zwei Track-/Route-Punkte.");
    if (stats.routeKm > MAX_GPX_KM) {
      errors.push(`Die Route ist ${stats.routeKm.toFixed(1)} km lang; aktuelles Limit sind ${MAX_GPX_KM} km.`);
    }
    if (stats.pointCount > 50000) {
      warnings.push("Sehr viele Punkte: der Build kann länger dauern und sollte ggf. vorher vereinfacht werden.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    fileName: cleanName,
    maxKm: MAX_GPX_KM,
    stats: stats
      ? {
          ...stats,
          routeKm: Number(stats.routeKm.toFixed(3)),
        }
      : null,
  };
}

export function haversineMeters(a, b) {
  const radius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

