const MANUAL_CACHE_NAME = "raid-radar-hamburg-backyard-manual-offline-v1";
const OFFLINE_MAP_PACK_KEY_PREFIX = "offlineMapPackStatus:";
const LAST_OFFLINE_CHECK_KEY = "lastOfflineCheck";
const CORE_OFFLINE_ASSETS = [
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
];
const MAP_PACK_STYLE = {
  motorway: { color: "#d27b38", weight: 3.5, opacity: 0.82 },
  major: { color: "#d49a4a", weight: 2.9, opacity: 0.78 },
  medium: { color: "#c5aa70", weight: 2.2, opacity: 0.74 },
  minor: { color: "#c9c9b5", weight: 1.5, opacity: 0.7 },
  path: { color: "#8fa777", weight: 1.2, opacity: 0.68, dashArray: "5 5" },
  railway: { color: "#8f8f94", weight: 1.3, opacity: 0.58, dashArray: "6 5" },
  waterway: { color: "#75b7c8", weight: 1.5, opacity: 0.78 },
  water: { color: "#75b7c8", weight: 1, fillColor: "#bde4ec", fillOpacity: 0.46, opacity: 0.8 },
  place: { color: "#75867c", weight: 1, opacity: 0.72 },
};

const state = {
  route: null,
  pois: [],
  gaps: [],
  segments: [],
  meta: null,
  selectedPoi: null,
  current: null,
  previousFix: null,
  watchId: null,
  raceDay: localStorage.getItem("raceDay") || "thu",
  filter: "critical",
  search: "",
  centerOnRider: true,
  pins: new Set(JSON.parse(localStorage.getItem("pins") || "[]")),
  visited: new Set(JSON.parse(localStorage.getItem("visited") || "[]")),
  markerImage: new Image(),
  leaflet: null,
  mapPack: null,
  offline: {
    mapPack: { status: "missing" },
    lastCheck: localStorage.getItem(LAST_OFFLINE_CHECK_KEY) || "",
    snapshot: null,
  },
};

const els = {};
const BRAND_CLAIM = "Raid Before You Bonk";

function loadMapPackStatus() {
  try {
    return JSON.parse(localStorage.getItem(mapPackStorageKey()) || '{"status":"missing"}');
  } catch {
    return { status: "missing" };
  }
}

function saveMapPackStatus(status) {
  state.offline.mapPack = {
    ...status,
    route_source: state.meta?.route_source || "",
    pack_url: state.meta?.offline_map_pack?.url || "",
  };
  localStorage.setItem(mapPackStorageKey(), JSON.stringify(state.offline.mapPack));
}

function mapPackStorageKey() {
  const routeId = state.meta?.route_source || state.meta?.app_name || location.pathname;
  const packUrl = state.meta?.offline_map_pack?.url || "no-pack";
  return `${OFFLINE_MAP_PACK_KEY_PREFIX}${routeId}:${packUrl}`;
}

const fallbackDemoPositions = [
  { label: "Start", km: 0.2 },
  { label: "Schwerin", km: 178.8 },
  { label: "Malchin", km: 323.3 },
  { label: "Checkpoint", km: 362.1 },
  { label: "Wismar", km: 523.3 },
  { label: "Lübeck", km: 612.7 },
  { label: "Virtual Finish", km: 680.4 },
  { label: "RBO", km: 701.2 },
];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  state.markerImage.src = "./assets/rider-marker.png";
  state.markerImage.onload = drawMap;
  const [route, pois, gaps, segments, meta] = await Promise.all([
    fetchJson("./data/route.json"),
    fetchJson("./data/pois.json"),
    fetchJson("./data/gaps.json"),
    fetchJson("./data/segments.json"),
    fetchJson("./data/app-meta.json"),
  ]);
  state.route = route;
  state.pois = pois;
  state.gaps = gaps;
  state.segments = segments;
  state.meta = meta;
  state.offline.mapPack = loadMapPackStatus();
  configureAppShell();
  await loadOfflineMapPack({ quiet: true });
  setupLeafletMap();
  const firstDemo = getDemoPositions()[0] || { label: "Start", km: 0 };
  setDemoPosition(firstDemo.km, `Demo ${firstDemo.label}`);
  bindEvents();
  renderAll();
  registerServiceWorker();
}

function cacheElements() {
  for (const id of [
    "offlineBadge",
    "metricKm",
    "metricRemaining",
    "metricOffRoute",
    "metricGps",
    "nextCritical",
    "nextFood",
    "nextFuel",
    "leafletMap",
    "routeCanvas",
    "gpsButton",
    "centerButton",
    "mapHint",
    "selectedPoi",
    "filters",
    "stopSearch",
    "stopList",
    "gapList",
    "cacheCoreButton",
    "checkOfflineButton",
    "downloadMapPackButton",
    "offlineSummary",
    "offlineStatusGrid",
    "installCheckButton",
    "raceDaySelect",
    "demoButtons",
    "statusLog",
  ]) {
    els[id] = document.getElementById(id);
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url}`);
  return response.json();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab));
  });
  els.gpsButton.addEventListener("click", toggleGps);
  els.centerButton.addEventListener("click", () => {
    state.centerOnRider = true;
    drawMap();
  });
  els.routeCanvas.addEventListener("click", onMapClick);
  window.addEventListener("resize", drawMap);
  els.filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    document.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    renderStops();
    drawMap();
  });
  els.stopSearch.addEventListener("input", () => {
    state.search = els.stopSearch.value.trim().toLowerCase();
    renderStops();
  });
  els.cacheCoreButton.addEventListener("click", cacheCoreAssets);
  els.checkOfflineButton.addEventListener("click", () => checkOfflineReadiness());
  els.downloadMapPackButton.addEventListener("click", downloadMapPack);
  els.installCheckButton.addEventListener("click", runOfflineCheck);
  window.addEventListener("online", () => {
    setBadge("Cached", "ready");
    renderOfflinePanel();
  });
  window.addEventListener("offline", () => {
    setBadge("Offline", "ready");
    renderOfflinePanel();
  });
  els.raceDaySelect.value = state.raceDay;
  els.raceDaySelect.addEventListener("change", () => {
    state.raceDay = els.raceDaySelect.value;
    localStorage.setItem("raceDay", state.raceDay);
    renderAll();
  });
  els.demoButtons.innerHTML = getDemoPositions()
    .map(({ label, km }) => `<button class="control" data-km="${km}" type="button">${escapeHtml(label)}</button>`)
    .join("");
  els.demoButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-km]");
    if (!button) return;
    setDemoPosition(Number(button.dataset.km), button.textContent.trim());
    renderAll();
  });
}

function configureAppShell() {
  const appName = state.meta?.app_name || "Offline Race";
  const routeName = state.meta?.route_name || appName;
  const brandName = state.meta?.brand_name || "Raid Radar";
  document.title = `${brandName} · ${routeName}`;
  const heading = document.querySelector(".topbar h1");
  if (heading) heading.textContent = routeName;
  const eyebrow = document.querySelector(".topbar .eyebrow");
  if (eyebrow) eyebrow.textContent = state.meta?.brand_tagline || BRAND_CLAIM;
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute("content", brandName);
  const brand = document.querySelector(".brand-name");
  if (brand) brand.textContent = brandName;
  if (els.mapHint && state.meta?.basemap?.status) {
    els.mapHint.textContent = basemapLabel(state.meta.basemap.status);
  }
  const days = raceDays();
  const keys = Object.keys(days);
  els.raceDaySelect.innerHTML = keys
    .map((key) => `<option value="${escapeHtml(key)}">${escapeHtml(days[key].label || key)}</option>`)
    .join("");
  if (!days[state.raceDay]) {
    state.raceDay = keys[0] || "thu";
    localStorage.setItem("raceDay", state.raceDay);
  }
}

function basemapLabel(status) {
  if (status === "online-osm") return "Online OSM basemap · Route/POIs cached";
  if (status === "pmtiles") return "Offline PMTiles basemap";
  if (status === "corridor-vector") return "Offline corridor map · Route/POIs cached";
  return `Offline schematic basemap · ${status === "pending" ? "PMTiles pending" : status}`;
}

function setupLeafletMap() {
  if (!window.L || !els.leafletMap || !state.route) return;
  const shell = els.leafletMap.closest(".map-shell");
  shell?.classList.add("has-leaflet");
  const map = L.map(els.leafletMap, {
    zoomControl: false,
    preferCanvas: true,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  if (navigator.onLine) {
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
  } else if (els.mapHint) {
    els.mapHint.textContent = state.mapPack ? "Offline-Kartenpack aktiv · ohne Online-Tiles" : "Offline: Route/POIs ohne Basemap";
  }
  map.createPane("offlineMapPane");
  map.getPane("offlineMapPane").style.zIndex = 350;
  const offlineMapLayer = L.layerGroup().addTo(map);
  renderLeafletMapPack(offlineMapLayer);
  const routeLatLngs = state.route.points.map(([lat, lon]) => [lat, lon]);
  const routeLine = L.polyline(routeLatLngs, {
    color: "#2e6b4e",
    weight: 5,
    opacity: 0.95,
  }).addTo(map);
  const milestoneLayer = L.layerGroup().addTo(map);
  const poiLayer = L.layerGroup().addTo(map);
  const detourLayer = L.layerGroup().addTo(map);
  for (const marker of state.route.milestones || []) {
    L.circleMarker([marker.lat, marker.lon], {
      radius: 6,
      color: "#ffffff",
      weight: 2,
      fillColor: milestoneColor(marker.id),
      fillOpacity: 1,
    })
      .bindTooltip(`${marker.name} · km ${Number(marker.km).toFixed(1)}`)
      .addTo(milestoneLayer);
  }
  map.fitBounds(routeLine.getBounds(), { padding: [24, 24] });
  state.leaflet = { map, routeLine, milestoneLayer, poiLayer, detourLayer, offlineMapLayer, riderMarker: null, accuracyCircle: null };
  requestAnimationFrame(() => map.invalidateSize());
}

function milestoneColor(id) {
  if (["checkpoint", "albispass", "buchenegg"].includes(id)) return "#d07a2d";
  if (id === "virtual_finish") return "#7a3e8f";
  return "#15392c";
}

function getDemoPositions() {
  const total = state.route?.total_km || 0;
  return (state.meta?.demo_positions || fallbackDemoPositions).map((pos) => ({
    label: pos.label,
    km: Math.max(0, Math.min(Number(pos.km) || 0, total)),
  }));
}

function configuredMapPackUrl() {
  return state.meta?.offline_map_pack?.url || "";
}

function coreOfflineAssets() {
  const mapPackUrl = configuredMapPackUrl();
  return mapPackUrl ? [...CORE_OFFLINE_ASSETS, mapPackUrl] : [...CORE_OFFLINE_ASSETS];
}

async function loadOfflineMapPack({ quiet = false, force = false } = {}) {
  const url = configuredMapPackUrl();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: force ? "reload" : "default", credentials: "same-origin" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    state.mapPack = await response.json();
    if (els.mapHint && state.meta?.basemap?.status === "corridor-vector") {
      els.mapHint.textContent = "Offline corridor map · Route/POIs cached";
    }
    if (state.leaflet?.offlineMapLayer) {
      renderLeafletMapPack(state.leaflet.offlineMapLayer);
      state.leaflet.map.invalidateSize();
    }
    drawMap();
    return state.mapPack;
  } catch (error) {
    if (!quiet) logStatus(`Kartenpack konnte nicht geladen werden: ${error.message}`);
    state.mapPack = null;
    return null;
  }
}

function renderLeafletMapPack(layer) {
  if (!window.L || !layer || !state.mapPack?.features?.length) return;
  layer.clearLayers();
  const maxFeatures = 6000;
  for (const feature of state.mapPack.features.slice(0, maxFeatures)) {
    const style = leafletMapPackStyle(feature);
    if (feature.type === "point") {
      L.circleMarker([feature.lat, feature.lon], {
        pane: "offlineMapPane",
        radius: feature.kind === "place" ? 3 : 2,
        color: style.color,
        weight: 1,
        fillColor: style.color,
        fillOpacity: 0.55,
        opacity: style.opacity,
        interactive: false,
      }).addTo(layer);
      continue;
    }
    const latLngs = (feature.points || []).map(([lat, lon]) => [lat, lon]);
    if (latLngs.length < 2) continue;
    if (feature.type === "polygon" && latLngs.length >= 4) {
      L.polygon(latLngs, { ...style, pane: "offlineMapPane", interactive: false }).addTo(layer);
    } else {
      L.polyline(latLngs, { ...style, pane: "offlineMapPane", interactive: false }).addTo(layer);
    }
  }
}

function leafletMapPackStyle(feature) {
  const style = mapPackStyle(feature);
  return {
    color: style.color,
    weight: style.weight,
    opacity: style.opacity,
    dashArray: style.dashArray,
    fillColor: style.fillColor,
    fillOpacity: style.fillOpacity,
  };
}

function mapPackStyle(feature) {
  return MAP_PACK_STYLE[feature.kind] || MAP_PACK_STYLE.minor;
}

function activateTab(tabName) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === `panel-${tabName}`));
  if (tabName === "map") requestAnimationFrame(drawMap);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    setBadge("No SW", "warn");
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    setBadge(navigator.onLine ? "Cached" : "Offline", "ready");
    logStatus(`Service Worker ready: ${registration.scope}`);
    checkOfflineReadiness({ quiet: true });
  } catch (error) {
    setBadge("SW fail", "warn");
    logStatus(`Service Worker error: ${error.message}`);
    renderOfflinePanel();
  }
}

function setBadge(text, mode = "") {
  els.offlineBadge.textContent = text;
  els.offlineBadge.className = `badge ${mode}`.trim();
}

function toggleGps() {
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
    els.gpsButton.textContent = "GPS starten";
    logStatus("GPS stopped.");
    return;
  }
  if (!navigator.geolocation) {
    logStatus("Geolocation is not available in this browser.");
    return;
  }
  state.watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 12000,
  });
  els.gpsButton.textContent = "GPS stoppen";
  logStatus("GPS watch started. iPhone will ask for location permission.");
}

function onPosition(position) {
  const coords = position.coords;
  const fix = {
    lat: coords.latitude,
    lon: coords.longitude,
    accuracy: coords.accuracy || null,
    speed: coords.speed || 0,
    heading: Number.isFinite(coords.heading) ? coords.heading : null,
    label: "GPS",
    ts: Date.now(),
  };
  if (fix.heading === null) {
    fix.heading = deriveHeading(state.current?.fix || state.previousFix, fix);
  }
  updateCurrentFromFix(fix);
  state.previousFix = fix;
  renderAll();
}

function onPositionError(error) {
  logStatus(`GPS error: ${error.message}`);
}

function setDemoPosition(km, label) {
  const point = routePointAtKm(km);
  const total = state.route?.total_km || km;
  const heading = bearingBetween(routePointAtKm(Math.max(0, km - 0.2)), routePointAtKm(Math.min(total, km + 0.2)));
  updateCurrentFromFix(
    {
    lat: point.lat,
    lon: point.lon,
    accuracy: 12,
    speed: 5,
    heading,
    label,
    ts: Date.now(),
    },
    { distance_m: 0, km: point.km, lat: point.lat, lon: point.lon, segment_index: null },
  );
}

function updateCurrentFromFix(fix, forcedSnap = null) {
  const snap = forcedSnap || snapToRoute(fix.lat, fix.lon, state.current?.snap?.km ?? null);
  state.current = {
    fix,
    snap,
    heading: fix.heading,
    headingWeak: fix.heading === null || (fix.speed || 0) < 0.8,
  };
}

function routePointAtKm(km) {
  const pts = state.route.points;
  if (!pts || !pts.length) return { lat: 0, lon: 0, km: 0 };
  if (km <= pts[0][2]) return { lat: pts[0][0], lon: pts[0][1], km: pts[0][2] };
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    if (cur[2] >= km) {
      const span = cur[2] - prev[2] || 1;
      const t = (km - prev[2]) / span;
      return { lat: prev[0] + (cur[0] - prev[0]) * t, lon: prev[1] + (cur[1] - prev[1]) * t, km };
    }
  }
  const last = pts[pts.length - 1];
  return { lat: last[0], lon: last[1], km: last[2] };
}

function snapToRoute(lat, lon, preferredKm = null) {
  const pts = state.route.points;
  const lat0 = toRad(lat);
  let best = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const ax = (a[1] - lon) * 111320 * Math.cos(lat0);
    const ay = (a[0] - lat) * 111320;
    const bx = (b[1] - lon) * 111320 * Math.cos(lat0);
    const by = (b[0] - lat) * 111320;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const px = ax + t * dx;
    const py = ay + t * dy;
    const distance = Math.hypot(px, py);
    const km = a[2] + (b[2] - a[2]) * t;
    const continuityPenalty = preferredKm === null ? 0 : Math.abs(km - preferredKm) * 15;
    const score = distance + continuityPenalty;
    if (!best || score < best.score || (Math.abs(score - best.score) < 0.001 && km < best.km)) {
      best = {
        score,
        distance_m: distance,
        km,
        lat: a[0] + (b[0] - a[0]) * t,
        lon: a[1] + (b[1] - a[1]) * t,
        segment_index: i - 1,
      };
    }
  }
  return best;
}

function renderAll() {
  renderCockpit();
  renderNextCards();
  renderStops();
  renderGaps();
  renderStatus();
  renderOfflinePanel();
  drawMap();
}

function renderCockpit() {
  const km = state.current?.snap?.km ?? 0;
  const raceFinishKm = state.meta?.race_finish_km || state.route.total_km;
  const receptionKm = state.meta?.reception_km || state.route.total_km;
  const raceFinishLabel = state.meta?.race_finish_label || "Ziel";
  const receptionLabel = state.meta?.reception_label || "RBO";
  const remainingToRace = Math.max(0, raceFinishKm - km);
  const remainingToRbo = Math.max(0, receptionKm - km);
  const off = state.current?.snap?.distance_m ?? null;
  els.metricKm.textContent = `${km.toFixed(1)}`;
  els.metricRemaining.textContent =
    km < raceFinishKm ? `${remainingToRace.toFixed(0)} km ${raceFinishLabel}` : `${remainingToRbo.toFixed(0)} km ${receptionLabel}`;
  els.metricOffRoute.textContent = off === null ? "--" : off > 1000 ? `${(off / 1000).toFixed(1)} km` : `${Math.round(off)} m`;
  els.metricGps.textContent = state.current?.fix?.accuracy ? `±${Math.round(state.current.fix.accuracy)} m` : "--";
}

function renderNextCards() {
  const km = state.current?.snap?.km ?? 0;
  const nextCritical =
    nextPoi((poi) => poi.critical && poi.route_km >= km && isLikelyAvailableAtArrival(poi)) ||
    nextPoi((poi) => poi.critical && poi.route_km >= km);
  const nextFood =
    nextPoi(
      (poi) =>
        isFoodPoi(poi) &&
        poi.route_km >= km &&
        (poi.critical || poi.source_status !== "unverified") &&
        isLikelyAvailableAtArrival(poi),
    ) ||
    nextPoi((poi) => isFoodPoi(poi) && poi.route_km >= km);
  const nextFuel =
    nextPoi(
      (poi) =>
        poi.category === "fuel" &&
        poi.route_km >= km &&
        (poi.critical || poi.source_status !== "unverified") &&
        isLikelyAvailableAtArrival(poi),
    ) ||
    nextPoi((poi) => poi.category === "fuel" && poi.route_km >= km);
  renderNextCard(els.nextCritical, "Next Raid", nextCritical);
  renderNextCard(els.nextFood, "Food Raid", nextFood);
  renderNextCard(els.nextFuel, "Tankstellen Raid", nextFuel);
}

function nextPoi(predicate) {
  return state.pois.find(predicate) || null;
}

function renderNextCard(el, title, poi) {
  if (!poi) {
    el.innerHTML = `<span>${title}</span><strong>Nichts mehr zu raiden</strong><small>Route fast durch.</small>`;
    el.onclick = null;
    return;
  }
  const delta = Math.max(0, poi.route_km - (state.current?.snap?.km ?? 0));
  const availability = availabilityAtArrival(poi);
  el.innerHTML = `<span>${title}</span><strong>${escapeHtml(poi.name)}</strong><small>in ${delta.toFixed(1)} km · ${availability.label}</small>`;
  el.onclick = () => selectPoi(poi.id, true);
}

function renderStops() {
  const rows = filteredPois().slice(0, 160);
  els.stopList.innerHTML = rows.map(stopCardHtml).join("");
  els.stopList.querySelectorAll("[data-poi]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("[data-action]")) return;
      selectPoi(card.dataset.poi, true);
      activateTab("map");
    });
  });
  els.stopList.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLocalState(button.dataset.action, button.dataset.poi);
    });
  });
}

function filteredPois() {
  const km = state.current?.snap?.km ?? 0;
  return state.pois.filter((poi) => {
    if (poi.route_km + 1 < km) return false;
    if (state.search) {
      const hay = `${poi.name} ${poi.address} ${poi.segment}`.toLowerCase();
      if (!hay.includes(state.search)) return false;
    }
    if (state.filter === "critical" && !poi.critical) return false;
    if (state.filter === "supermarket" && !isFoodPoi(poi)) return false;
    if (state.filter === "fuel" && poi.category !== "fuel") return false;
    if (state.filter === "24h" && !Object.values(poi.hours).some((h) => String(h).includes("24h"))) return false;
    if (state.filter === "open" && !isLikelyAvailableAtArrival(poi)) return false;
    if (state.filter === "uncertain" && !["osm-fallback", "unverified"].includes(poi.source_status)) return false;
    return true;
  });
}

function stopCardHtml(poi) {
  const delta = poi.route_km - (state.current?.snap?.km ?? 0);
  const selected = state.selectedPoi?.id === poi.id ? " selected" : "";
  const pinned = state.pins.has(poi.id) ? " active" : "";
  const visited = state.visited.has(poi.id) ? " active" : "";
  return `<article class="list-card${selected}" data-poi="${poi.id}">
    <h3>${escapeHtml(poi.name)}</h3>
    <div class="list-meta">${poi.category} · km ${poi.route_km.toFixed(1)} · ${delta >= 0 ? `in ${delta.toFixed(1)} km` : `${Math.abs(delta).toFixed(1)} km zurück`} · ${poi.distance_from_route_m} m von GPX</div>
    <div class="list-meta">${escapeHtml(availabilityAtArrival(poi).label)} · Quelle: ${escapeHtml(poi.source_status)}</div>
    <div class="card-actions">
      <button class="mini${pinned}" data-action="pin" data-poi="${poi.id}" type="button">Pin</button>
      <button class="mini${visited}" data-action="visited" data-poi="${poi.id}" type="button">Visited</button>
    </div>
  </article>`;
}

function toggleLocalState(action, id) {
  const target = action === "pin" ? state.pins : state.visited;
  if (target.has(id)) target.delete(id);
  else target.add(id);
  localStorage.setItem(action === "pin" ? "pins" : "visited", JSON.stringify([...target]));
  renderStops();
}

function renderGaps() {
  const km = state.current?.snap?.km ?? 0;
  els.gapList.innerHTML = state.gaps
    .map((gap) => {
      const active = km >= gap.km_range[0] - 10 && km <= gap.km_range[1] + 10;
      return `<article class="list-card${active ? " selected" : ""}">
        <h3>${escapeHtml(gap.section)}</h3>
        <div class="list-meta">km ${gap.km_range[0]}-${gap.km_range[1]}</div>
        <p><strong>Letzter sicherer Stop:</strong> ${escapeHtml(gap.last_reliable_stop)}</p>
        <p><strong>Backup:</strong> ${escapeHtml(gap.backup)}</p>
        <p><strong>Mitnehmen:</strong> ${escapeHtml(gap.carry)}</p>
      </article>`;
    })
    .join("");
}

function selectPoi(id, center = false) {
  state.selectedPoi = state.pois.find((poi) => poi.id === id) || null;
  if (center) state.centerOnRider = false;
  renderSelectedPoi();
  renderStops();
  drawMap();
}

function renderSelectedPoi() {
  const poi = state.selectedPoi;
  if (!poi) {
    els.selectedPoi.className = "detail empty";
    els.selectedPoi.textContent = "Tippe einen Stop an oder nutze die Demo-Positionen.";
    return;
  }
  const delta = poi.route_km - (state.current?.snap?.km ?? 0);
  const availability = availabilityAtArrival(poi);
  const warnings = [];
  if (availability.state !== "open") warnings.push(`Verfügbarkeit: ${availability.label}. Nicht blind als sicheren Stop planen.`);
  if (poi.source_status !== "official") warnings.push(`Quelle ist ${poi.source_status}. In der Rennwoche final prüfen.`);
  els.selectedPoi.className = "detail";
  els.selectedPoi.innerHTML = `<h2>${escapeHtml(poi.name)}</h2>
    <div class="list-meta">${escapeHtml(poi.address)}</div>
    <div class="detail-grid">
      <span class="pill">km ${poi.route_km.toFixed(1)}</span>
      <span class="pill">${delta >= 0 ? `in ${delta.toFixed(1)} km` : `${Math.abs(delta).toFixed(1)} km zurück`}</span>
      <span class="pill">${poi.distance_from_route_m} m off GPX</span>
    </div>
    <p><strong>Geplante Ankunft:</strong> ${escapeHtml(availability.arrivalLabel)} · ${escapeHtml(availability.label)}</p>
    <p><strong>Leave Point:</strong> km ${poi.gpx_exit_km.toFixed(1)} · ${escapeHtml(poi.access_note)}.</p>
    <p>${escapeHtml(poi.race_use_note || "Routennahe Option.")}</p>
    ${warnings.map((w) => `<div class="warning">${escapeHtml(w)}</div>`).join("")}
    <p><a href="${poi.google_maps_place_link}" target="_blank" rel="noreferrer">Google Maps online öffnen</a></p>`;
}

function renderStatus() {
  const online = navigator.onLine ? "online" : "offline";
  const current = state.current;
  const finishLabel = state.meta.race_finish_label || "Ziel";
  const receptionLabel = state.meta.reception_label || "RBO";
  const routeLine =
    Math.abs((state.meta.race_finish_km || 0) - (state.meta.reception_km || 0)) < 0.05
      ? `Route: ${state.route.total_km.toFixed(1)} km · ${finishLabel} ${state.meta.reception_km.toFixed(1)} km`
      : `Route: ${state.route.total_km.toFixed(1)} km · ${finishLabel} ${state.meta.race_finish_km.toFixed(1)} km · ${receptionLabel} ${state.meta.reception_km.toFixed(1)} km`;
  const lines = [
    `${state.meta.app_name}`,
    `Build: ${state.meta.build_time_utc}`,
    `Network: ${online}`,
    routeLine,
    `POIs: ${state.meta.verified_poi_count} verified · ${state.meta.critical_poi_count} critical`,
    `Basemap: ${state.meta.basemap.status} · ${state.meta.basemap.note}`,
    current ? `Position: ${current.fix.label} · snapped km ${current.snap.km.toFixed(1)} · off-route ${Math.round(current.snap.distance_m)} m` : "Position: none",
    current ? `Heading: ${current.heading === null ? "unknown" : `${Math.round(current.heading)}°`} ${current.headingWeak ? "(weak)" : ""}` : "",
    "Offline test: first load once online, then airplane mode and relaunch from Home Screen.",
  ];
  els.statusLog.textContent = lines.filter(Boolean).join("\n");
  renderSelectedPoi();
}

async function runOfflineCheck() {
  const snapshot = await checkOfflineReadiness();
  const missing = snapshot.core.missing.length ? `Missing: ${snapshot.core.missing.join(", ")}` : "Alle Kern-Dateien im Cache.";
  logStatus(`Offline-Check: ${snapshot.core.cachedCount}/${snapshot.core.total} Kern-Dateien cached.\n${missing}`);
  activateTab("offline");
}

async function cacheCoreAssets() {
  if (!("caches" in window)) {
    logStatus("Cache API ist in diesem Browser nicht verfügbar.");
    renderOfflinePanel();
    return;
  }
  els.cacheCoreButton.disabled = true;
  els.cacheCoreButton.textContent = "Speichere...";
  let ok = 0;
  const failures = [];
  const assets = coreOfflineAssets();
  try {
    const cache = await caches.open(MANUAL_CACHE_NAME);
    for (const url of assets) {
      try {
        const response = await fetch(url, { cache: "reload", credentials: "same-origin" });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        await cache.put(url, response.clone());
        ok += 1;
      } catch (error) {
        failures.push(`${url}: ${error.message}`);
      }
    }
  } finally {
    els.cacheCoreButton.disabled = false;
    els.cacheCoreButton.textContent = "Kern offline speichern";
  }
  await loadOfflineMapPack({ quiet: true });
  const snapshot = await checkOfflineReadiness({ quiet: true });
  logStatus(
    failures.length
      ? `Kern-Cache: ${ok}/${assets.length} gespeichert.\n${failures.join("\n")}`
      : `Kern-Cache: ${ok}/${assets.length} Dateien gespeichert.`,
  );
  state.offline.snapshot = snapshot;
  renderOfflinePanel();
}

async function checkOfflineReadiness({ quiet = false } = {}) {
  const checkedAt = new Date().toISOString();
  const core = await checkCacheUrls(coreOfflineAssets());
  const storage = await storageEstimate();
  const mapPackUrl = configuredMapPackUrl();
  const mapPack = normalizeMapPackStatus({
    cached: Boolean(mapPackUrl && core.cached.has(mapPackUrl)),
    loaded: Boolean(state.mapPack),
  });
  const serviceWorkerSupported = "serviceWorker" in navigator;
  const snapshot = {
    checkedAt,
    online: navigator.onLine,
    serviceWorker: {
      supported: serviceWorkerSupported,
      controlled: Boolean(navigator.serviceWorker?.controller),
    },
    core,
    storage,
    routeReady: core.cached.has("./data/route.json"),
    poisReady: core.cached.has("./data/pois.json"),
    markerReady: core.cached.has("./assets/rider-marker.png") && core.cached.has("./assets/rider-marker@2x.png"),
    leafletReady: core.cached.has("./vendor/leaflet/leaflet.css") && core.cached.has("./vendor/leaflet/leaflet.js"),
    mapPack,
  };
  state.offline.lastCheck = checkedAt;
  state.offline.snapshot = snapshot;
  localStorage.setItem(LAST_OFFLINE_CHECK_KEY, checkedAt);
  renderOfflinePanel(snapshot);
  if (!quiet) {
    logStatus(`Offline bereit: ${snapshot.core.cachedCount}/${snapshot.core.total} Kern-Dateien cached.`);
  }
  return snapshot;
}

async function checkCacheUrls(urls) {
  if (!("caches" in window)) {
    return { total: urls.length, cachedCount: 0, cached: new Set(), missing: [...urls], unsupported: true };
  }
  const cached = new Set();
  const missing = [];
  for (const url of urls) {
    try {
      const match = await caches.match(url, { ignoreSearch: true });
      if (match) cached.add(url);
      else missing.push(url);
    } catch {
      missing.push(url);
    }
  }
  return { total: urls.length, cachedCount: cached.size, cached, missing, unsupported: false };
}

async function storageEstimate() {
  if (!navigator.storage?.estimate) return { supported: false };
  try {
    const estimate = await navigator.storage.estimate();
    return {
      supported: true,
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  } catch {
    return { supported: false };
  }
}

function normalizeMapPackStatus({ cached = false, loaded = false } = {}) {
  const configured = state.meta?.offline_map_pack || {};
  if (!configured.url) {
    return {
      status: "missing",
      label: configured.label || "Offline-Kartenpack",
      note: configured.note || "PMTiles-Kartenpack ist noch nicht hinterlegt. Route, POIs und GPS funktionieren trotzdem offline.",
    };
  }
  const savedStatus = state.offline.mapPack?.status || "available";
  const impliedStatus = cached && isMapPackRenderable(configured) ? "cached" : savedStatus;
  const status = impliedStatus === "cached" && !isMapPackRenderable(configured) ? "stored" : impliedStatus;
  return {
    status,
    label: configured.label || "Offline-Kartenpack",
    url: configured.url,
    size: state.offline.mapPack?.size || configured.expected_size_mb || null,
    note:
      status === "cached" && loaded
        ? "Offline-Kartenpack ist gecached und als Basemap aktiv."
        : status === "cached"
          ? "Offline-Kartenpack ist gecached und wird beim nächsten Laden angezeigt."
          : status === "stored"
        ? "Kartenpack ist gespeichert; die Basemap-Anzeige folgt mit dem PMTiles-Renderer."
        : state.offline.mapPack?.note || configured.note || "Kartenpack kann lokal gespeichert werden.",
    updatedAt: state.offline.mapPack?.updatedAt || "",
    renderable: isMapPackRenderable(configured),
    loaded,
  };
}

function isMapPackRenderable(configured = state.meta?.offline_map_pack || {}) {
  return ["corridor-vector", "leaflet-pmtiles", "pmtiles-leaflet"].includes(configured.renderer || configured.display || "");
}

async function downloadMapPack() {
  const configured = state.meta?.offline_map_pack || {};
  if (!configured.url) {
    saveMapPackStatus({
      status: "missing",
      updatedAt: new Date().toISOString(),
      note: "PMTiles noch nicht hinterlegt. Für Hamburg bauen wir als nächsten Schritt ein Route-Korridor-Pack.",
    });
    renderOfflinePanel();
    logStatus("Kartenpack: PMTiles ist noch nicht hinterlegt. Kern-App bleibt offline nutzbar.");
    return;
  }
  if (!("caches" in window)) {
    logStatus("Kartenpack kann nicht gespeichert werden: Cache API fehlt.");
    return;
  }
  els.downloadMapPackButton.disabled = true;
  els.downloadMapPackButton.textContent = "Lade...";
  try {
    const response = await fetch(configured.url, { cache: "reload" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const cache = await caches.open(MANUAL_CACHE_NAME);
    await cache.put(configured.url, response.clone());
    await loadOfflineMapPack({ quiet: true });
    const length = response.headers.get("content-length");
    const renderable = isMapPackRenderable(configured);
    saveMapPackStatus({
      status: renderable ? "cached" : "stored",
      url: configured.url,
      size: length ? Number(length) : configured.expected_size_mb || null,
      updatedAt: new Date().toISOString(),
      note: renderable
        ? "Offline-Kartenpack ist im Browser-Cache gespeichert und als Basemap aktiv."
        : "PMTiles-Kartenpack ist gespeichert; die Anzeige als Basemap folgt mit dem PMTiles-Renderer.",
    });
    logStatus(renderable ? "Kartenpack gespeichert." : "Kartenpack gespeichert, Basemap-Renderer noch nicht aktiv.");
  } catch (error) {
    saveMapPackStatus({
      status: "error",
      url: configured.url,
      updatedAt: new Date().toISOString(),
      note: error.message,
    });
    logStatus(`Kartenpack-Fehler: ${error.message}`);
  } finally {
    els.downloadMapPackButton.disabled = false;
    els.downloadMapPackButton.textContent = "Kartenpack laden";
    checkOfflineReadiness({ quiet: true });
  }
}

function renderOfflinePanel(snapshot = state.offline.snapshot) {
  if (!els.offlineSummary || !els.offlineStatusGrid) return;
  const mapPack = snapshot?.mapPack || normalizeMapPackStatus({ loaded: Boolean(state.mapPack) });
  const expectedAssets = coreOfflineAssets();
  const core = snapshot?.core || { total: expectedAssets.length, cachedCount: 0, missing: expectedAssets, cached: new Set() };
  const serviceWorkerReady = snapshot?.serviceWorker?.supported && snapshot?.serviceWorker?.controlled;
  const mapPackUsable = mapPack.status === "cached" && mapPack.renderable;
  const ready =
    core.cachedCount === core.total &&
    serviceWorkerReady &&
    (snapshot?.routeReady ?? false) &&
    (snapshot?.poisReady ?? false) &&
    (snapshot?.markerReady ?? false) &&
    (snapshot?.leafletReady ?? false);
  els.offlineSummary.innerHTML = `<strong>${ready ? "Kern-App offline bereit" : "Offline-Kern noch prüfen"}</strong>
    ${ready ? "App-Shell, Service Worker, Route, POIs, Marker und Leaflet sind gecached." : "Tippe zuerst auf Kern offline speichern, dann auf Offline prüfen. Wenn Service Worker noch nicht aktiv ist: einmal neu laden."}
    ${mapPackUsable ? " Kartenpack ist gespeichert und als Basemap vorbereitet." : mapPack.status === "stored" ? " Kartenpack ist gespeichert, aber die Basemap-Anzeige folgt noch." : " Vollständige Offline-Basemap folgt über PMTiles."}`;
  const lastCheck = snapshot?.checkedAt || state.offline.lastCheck || "noch nicht geprüft";
  const storage = snapshot?.storage;
  const storageText =
    storage?.supported && storage.quota
      ? `${formatBytes(storage.usage)} genutzt von ${formatBytes(storage.quota)} verfügbar`
      : "Storage-Schätzung in diesem Browser nicht verfügbar";
  const cards = [
    offlineCard("App Shell", core.cachedCount >= 6 ? "ready" : "warn", `${core.cachedCount}/${core.total} Kern-Dateien im Cache`),
    offlineCard("Route", snapshot?.routeReady ? "ready" : "missing", snapshot?.routeReady ? `${state.route?.total_km?.toFixed(1) || "--"} km Route cached` : "route.json fehlt im Cache"),
    offlineCard("POIs", snapshot?.poisReady ? "ready" : "missing", snapshot?.poisReady ? `${state.pois.length} Stops offline verfügbar` : "pois.json fehlt im Cache"),
    offlineCard("Rider Marker", snapshot?.markerReady ? "ready" : "missing", snapshot?.markerReady ? "Foto-Marker cached" : "Marker-Bilder fehlen im Cache"),
    offlineCard("Map Library", snapshot?.leafletReady ? "ready" : "missing", snapshot?.leafletReady ? "Leaflet lokal cached" : "Leaflet fehlt im Cache"),
    offlineCard("Service Worker", serviceWorkerReady ? "ready" : "warn", serviceWorkerReady ? "aktiv und kontrolliert diese App" : "noch nicht aktiv kontrollierend; App einmal neu laden"),
    offlineCard("Offline Map Pack", mapPackUsable ? "ready" : mapPack.status === "error" ? "missing" : "warn", mapPack.note),
    offlineCard("Speicher", "ready", storageText),
    offlineCard("Letzter Check", snapshot ? "ready" : "warn", formatCheckTime(lastCheck)),
  ];
  els.offlineStatusGrid.innerHTML = cards.join("");
}

function offlineCard(title, status, body) {
  return `<article class="offline-card ${status}">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
  </article>`;
}

function formatCheckTime(value) {
  if (!value || value === "noch nicht geprüft") return "noch nicht geprüft";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString("de-DE")} ${date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit <= 1 ? 0 : 1)} ${units[unit]}`;
}

function logStatus(message) {
  const before = els.statusLog.textContent ? `${els.statusLog.textContent}\n\n` : "";
  els.statusLog.textContent = `${before}${message}`;
}

function drawMap() {
  if (!state.route || !els.routeCanvas) return;
  if (state.leaflet) {
    updateLeafletMap();
    return;
  }
  const canvas = els.routeCanvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.max(320, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  const viewport = getViewport(width, height);

  drawBackground(ctx, width, height);
  drawOfflineMapPack(ctx, viewport);
  drawRoute(ctx, viewport);
  drawMilestones(ctx, viewport);
  drawPois(ctx, viewport);
  drawSelectedDetour(ctx, viewport);
  drawRider(ctx, viewport);
}

function drawOfflineMapPack(ctx, viewport) {
  if (!state.mapPack?.features?.length) return;
  ctx.save();
  for (const feature of state.mapPack.features.slice(0, 6000)) {
    const style = mapPackStyle(feature);
    ctx.globalAlpha = style.opacity ?? 0.7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (feature.type === "point") {
      const p = viewport.project(feature.lat, feature.lon);
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, feature.kind === "place" ? 2.5 : 1.8, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const points = feature.points || [];
    if (points.length < 2) continue;
    ctx.beginPath();
    points.forEach(([lat, lon], index) => {
      const p = viewport.project(lat, lon);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    if (feature.type === "polygon" && points.length >= 4) {
      ctx.fillStyle = style.fillColor || style.color;
      ctx.globalAlpha = style.fillOpacity ?? 0.35;
      ctx.fill();
      ctx.globalAlpha = style.opacity ?? 0.7;
    }
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.weight || 1;
    if (style.dashArray) ctx.setLineDash(style.dashArray.split(" ").map(Number));
    else ctx.setLineDash([]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function updateLeafletMap() {
  const bundle = state.leaflet;
  if (!bundle) return;
  const { map, poiLayer, detourLayer } = bundle;
  poiLayer.clearLayers();
  detourLayer.clearLayers();
  for (const poi of state.pois) {
    if (!matchesMapFilter(poi)) continue;
    const isSelected = state.selectedPoi?.id === poi.id;
    L.circleMarker([poi.lat, poi.lon], {
      radius: isSelected ? 9 : poi.critical ? 6 : 4,
      color: "#ffffff",
      weight: isSelected ? 3 : 1.5,
      fillColor: poiColor(poi),
      fillOpacity: poi.critical || isSelected ? 0.95 : 0.7,
    })
      .on("click", () => selectPoi(poi.id, true))
      .bindTooltip(`${poi.name} · km ${poi.route_km.toFixed(1)}`)
      .addTo(poiLayer);
  }
  if (state.selectedPoi) {
    const poi = state.selectedPoi;
    L.polyline(
      [
        [poi.gpx_exit_lat, poi.gpx_exit_lon],
        [poi.lat, poi.lon],
      ],
      { color: "#a63d2d", weight: 3, dashArray: "8 6" },
    ).addTo(detourLayer);
    L.circleMarker([poi.gpx_exit_lat, poi.gpx_exit_lon], {
      radius: 5,
      color: "#ffffff",
      weight: 2,
      fillColor: "#a63d2d",
      fillOpacity: 1,
    }).addTo(detourLayer);
  }
  updateLeafletRider();
  if (state.centerOnRider && state.current) {
    map.setView([state.current.fix.lat, state.current.fix.lon], Math.max(map.getZoom(), 15), { animate: false });
  } else if (state.selectedPoi && state.current) {
    map.fitBounds(
      [
        [state.current.fix.lat, state.current.fix.lon],
        [state.selectedPoi.gpx_exit_lat, state.selectedPoi.gpx_exit_lon],
        [state.selectedPoi.lat, state.selectedPoi.lon],
      ],
      { padding: [34, 34], maxZoom: 16 },
    );
  }
  requestAnimationFrame(() => map.invalidateSize());
}

function updateLeafletRider() {
  const bundle = state.leaflet;
  if (!bundle || !state.current) return;
  const pos = [state.current.fix.lat, state.current.fix.lon];
  const icon = L.divIcon({
    className: "",
    iconSize: [54, 54],
    iconAnchor: [27, 27],
    html: `<div class="rider-leaflet-marker"><div class="heading-nose" style="transform: rotate(${Number(state.current.heading || 0).toFixed(0)}deg)"></div><img alt="" src="./assets/rider-marker.png"></div>`,
  });
  if (bundle.riderMarker) {
    bundle.riderMarker.setLatLng(pos);
    bundle.riderMarker.setIcon(icon);
  } else {
    bundle.riderMarker = L.marker(pos, { icon, interactive: false, zIndexOffset: 1000 }).addTo(bundle.map);
  }
  if (state.current.fix.accuracy) {
    if (bundle.accuracyCircle) {
      bundle.accuracyCircle.setLatLng(pos);
      bundle.accuracyCircle.setRadius(state.current.fix.accuracy);
    } else {
      bundle.accuracyCircle = L.circle(pos, {
        radius: state.current.fix.accuracy,
        color: "#2e6b4e",
        weight: 1,
        fillColor: "#2e6b4e",
        fillOpacity: 0.13,
      }).addTo(bundle.map);
    }
  }
}

function getViewport(width, height) {
  const bounds = state.route.bounds;
  let minLat = bounds.min_lat;
  let maxLat = bounds.max_lat;
  let minLon = bounds.min_lon;
  let maxLon = bounds.max_lon;
  if (state.centerOnRider && state.current) {
    const center = state.current.snap;
    const spanLat = Math.max(0.025, (bounds.max_lat - bounds.min_lat) * 0.22);
    const spanLon = Math.max(0.05, (bounds.max_lon - bounds.min_lon) * 0.22);
    minLat = center.lat - spanLat / 2;
    maxLat = center.lat + spanLat / 2;
    minLon = center.lon - spanLon / 2;
    maxLon = center.lon + spanLon / 2;
  } else if (state.selectedPoi) {
    minLat = Math.min(state.selectedPoi.lat, state.selectedPoi.gpx_exit_lat) - 0.015;
    maxLat = Math.max(state.selectedPoi.lat, state.selectedPoi.gpx_exit_lat) + 0.015;
    minLon = Math.min(state.selectedPoi.lon, state.selectedPoi.gpx_exit_lon) - 0.025;
    maxLon = Math.max(state.selectedPoi.lon, state.selectedPoi.gpx_exit_lon) + 0.025;
  }
  const midLat = toRad((minLat + maxLat) / 2);
  const pad = 24;
  const xSpan = (maxLon - minLon) * Math.cos(midLat) || 1;
  const ySpan = maxLat - minLat || 1;
  const scale = Math.min((width - pad * 2) / xSpan, (height - pad * 2) / ySpan);
  const renderWidth = xSpan * scale;
  const renderHeight = ySpan * scale;
  const offsetX = (width - renderWidth) / 2;
  const offsetY = (height - renderHeight) / 2;
  return {
    width,
    height,
    pad,
    minLat,
    minLon,
    maxLat,
    maxLon,
    midLat,
    scale,
    offsetX,
    offsetY,
    project(lat, lon) {
      const x = offsetX + (lon - minLon) * Math.cos(midLat) * scale;
      const y = offsetY + (maxLat - lat) * scale;
      return { x, y };
    },
    metersToPx(meters) {
      const degreeLat = meters / 111320;
      return degreeLat * scale;
    },
  };
}

function drawBackground(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#eef5f1";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(46, 107, 78, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawRoute(ctx, viewport) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  state.route.display_points.forEach(([lat, lon], index) => {
    const p = viewport.project(lat, lon);
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = "#2e6b4e";
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawMilestones(ctx, viewport) {
  for (const marker of state.route.milestones) {
    const p = viewport.project(marker.lat, marker.lon);
    ctx.fillStyle = marker.id === "checkpoint" ? "#d07a2d" : marker.id === "virtual_finish" ? "#7a3e8f" : "#15392c";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPois(ctx, viewport) {
  for (const poi of state.pois) {
    if (!matchesMapFilter(poi)) continue;
    const p = viewport.project(poi.lat, poi.lon);
    const isSelected = state.selectedPoi?.id === poi.id;
    const r = isSelected ? 8 : poi.critical ? 5 : 3;
    ctx.fillStyle = poiColor(poi);
    ctx.globalAlpha = poi.critical || isSelected ? 0.95 : 0.45;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawSelectedDetour(ctx, viewport) {
  const poi = state.selectedPoi;
  if (!poi) return;
  const exit = viewport.project(poi.gpx_exit_lat, poi.gpx_exit_lon);
  const dest = viewport.project(poi.lat, poi.lon);
  ctx.strokeStyle = "rgba(166, 61, 45, 0.8)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(exit.x, exit.y);
  ctx.lineTo(dest.x, dest.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#a63d2d";
  ctx.beginPath();
  ctx.arc(exit.x, exit.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawRider(ctx, viewport) {
  if (!state.current) return;
  const pos = viewport.project(state.current.fix.lat, state.current.fix.lon);
  if (state.current.fix.accuracy) {
    const radius = Math.min(110, Math.max(12, viewport.metersToPx(state.current.fix.accuracy)));
    ctx.fillStyle = "rgba(46, 107, 78, 0.13)";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.current.heading !== null && !state.current.headingWeak) {
    drawHeadingArrow(ctx, pos.x, pos.y, state.current.heading);
  }
  const size = 48;
  if (state.markerImage.complete) {
    ctx.drawImage(state.markerImage, pos.x - size / 2, pos.y - size / 2, size, size);
  } else {
    ctx.fillStyle = "#15392c";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 13, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeadingArrow(ctx, x, y, heading) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(toRad(heading));
  ctx.fillStyle = "#15392c";
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -38);
  ctx.lineTo(10, -21);
  ctx.lineTo(0, -26);
  ctx.lineTo(-10, -21);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

function onMapClick(event) {
  const rect = els.routeCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const viewport = getViewport(rect.width, rect.height);
  let best = null;
  for (const poi of state.pois.filter(matchesMapFilter)) {
    const p = viewport.project(poi.lat, poi.lon);
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist < 22 && (!best || dist < best.dist)) best = { poi, dist };
  }
  if (best) selectPoi(best.poi.id);
}

function hoursFor(poi) {
  return poi.hours[state.raceDay] || "unverified";
}

function matchesMapFilter(poi) {
  if (state.filter === "critical") return poi.critical;
  if (state.filter === "supermarket") return isFoodPoi(poi);
  if (state.filter === "fuel") return poi.category === "fuel";
  if (state.filter === "24h") return Object.values(poi.hours).some((h) => String(h).includes("24h"));
  if (state.filter === "open") return isLikelyAvailableAtArrival(poi);
  if (state.filter === "uncertain") return ["osm-fallback", "unverified"].includes(poi.source_status);
  return true;
}

function isFoodPoi(poi) {
  return ["supermarket", "restaurant", "cafe", "fast_food", "bakery", "convenience"].includes(poi.category);
}

function poiColor(poi) {
  if (poi.category === "fuel") return "#2f6fbb";
  if (poi.category === "drinking_water") return "#1e9ab0";
  return "#d07a2d";
}

function isLikelyAvailableAtArrival(poi) {
  return availabilityAtArrival(poi).state === "open";
}

function availabilityAtArrival(poi) {
  const km = state.current?.snap?.km ?? 0;
  const deltaKm = Math.max(0, poi.route_km - km);
  const arrival = estimatedArrival(deltaKm);
  const dayKey = raceDayFromDate(arrival) || state.raceDay;
  const hours = poi.hours[dayKey] || "unverified";
  const stateName = openingState(hours, arrival);
  return {
    state: stateName,
    label: `${raceDayLabel(dayKey)} ${formatTime(arrival)} · ${humanOpeningState(stateName, hours)}`,
    arrivalLabel: `${raceDayLabel(dayKey)} ${formatTime(arrival)}`,
    hours,
  };
}

function estimatedArrival(deltaKm) {
  const base = baseRaceDate(state.raceDay);
  const now = new Date();
  base.setHours(now.getHours(), now.getMinutes(), 0, 0);
  base.setMinutes(base.getMinutes() + Math.round((deltaKm / 20) * 60));
  return base;
}

function baseRaceDate(dayKey) {
  const day = raceDays()[dayKey];
  if (day?.date) {
    const [year, month, date] = day.date.split("-").map(Number);
    return new Date(year, month - 1, date, 7, 0, 0, 0);
  }
  return new Date(2026, 5, 25, 7, 0, 0, 0);
}

function raceDayFromDate(date) {
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return Object.entries(raceDays()).find(([, value]) => value.date === iso)?.[0] || null;
}

function openingState(hours, date) {
  const raw = String(hours || "").trim();
  const lower = raw.toLowerCase();
  if (!raw || lower.includes("unverified")) return "unverified";
  if (lower.includes("geschlossen") || lower.includes("closed") || lower === "off") return "closed";
  if (lower.includes("24h") || lower.includes("24/7")) return "open";
  const minutes = date.getHours() * 60 + date.getMinutes();
  const matches = [...raw.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)];
  if (!matches.length) return "unknown";
  for (const match of matches) {
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    if (end >= start && minutes >= start && minutes <= end) return "open";
    if (end < start && (minutes >= start || minutes <= end)) return "open";
  }
  return "closed";
}

function humanOpeningState(stateName, hours) {
  if (stateName === "open") return `likely open (${hours})`;
  if (stateName === "closed") return `closed (${hours})`;
  if (stateName === "unverified") return "unverified";
  return `check (${hours})`;
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function raceDayLabel(dayKey = state.raceDay) {
  return raceDays()[dayKey]?.label || dayKey;
}

function raceDays() {
  return (
    state.meta?.race_days || {
      thu: { label: "Do 25.06", date: "2026-06-25" },
      fri: { label: "Fr 26.06", date: "2026-06-26" },
      sat: { label: "Sa 27.06", date: "2026-06-27" },
      sun: { label: "So 28.06", date: "2026-06-28" },
    }
  );
}

function deriveHeading(previous, current) {
  if (!previous) return null;
  const dist = distanceMeters(previous.lat, previous.lon, current.lat, current.lon);
  if (dist < 8) return null;
  return bearingBetween(previous, current);
}

function bearingBetween(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const radius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
