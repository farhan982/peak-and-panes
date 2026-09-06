// Location capture.
//
// Three constraints shape everything here:
//   * Secure context only. Geolocation is unavailable over plain http, which
//     is why the app has to be served from https (or localhost).
//   * Foreground only. iOS gives web apps no background location, so there is
//     no way to record a passive trail. Instead a fix is taken at the moment
//     an outcome is tapped, which is exactly when the app is open.
//   * ~10m accuracy. Good enough for the street, not enough to tell one house
//     from its neighbour, so this never replaces the address field.

const CACHE_KEY = 'peak-panes-geo-cache-v1';

// Set once a request is refused, so the app stops re-prompting on every tap.
let denied = false;

export function isSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;
}

export function wasDenied() {
  return denied;
}

export function status() {
  if (!('geolocation' in navigator)) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (denied) return 'denied';
  return 'available';
}

// maximumAge lets consecutive door taps reuse a recent fix instead of waking
// the GPS every time — faster, and much easier on the battery.
export function getFix({ timeout = 8000, maximumAge = 15000 } = {}) {
  if (!isSupported() || denied) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
          at: new Date().toISOString(),
        }),
      (error) => {
        if (error && error.code === 1) denied = true; // PERMISSION_DENIED
        resolve(null);
      },
      { enableHighAccuracy: true, timeout, maximumAge }
    );
  });
}

export function errorHint() {
  if (!('geolocation' in navigator)) return 'This browser cannot report location.';
  if (!window.isSecureContext) return 'Location needs an https address. Open the installed app, not a local file.';
  if (denied) return 'Location is off for this app. Turn it on in Settings › Safari › Location.';
  return '';
}

// --- Distance --------------------------------------------------------------

const EARTH_RADIUS_M = 6371000;

export function distanceMetres(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function centroid(points) {
  const valid = points.filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number');
  if (!valid.length) return null;
  return {
    lat: valid.reduce((sum, p) => sum + p.lat, 0) / valid.length,
    lng: valid.reduce((sum, p) => sum + p.lng, 0) / valid.length,
  };
}

export function formatDistance(metres) {
  if (!isFinite(metres)) return '';
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

// --- Reverse geocoding -----------------------------------------------------
//
// Coordinates are always stored; names are a bonus resolved when there is
// signal. Lookups are keyed to a ~100m grid cell and cached permanently, so a
// street of 85 houses costs a handful of requests, not 85. Requests are also
// spaced out, because the service used is free and shared.

function cellKey(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* a full quota shouldn't break door logging */
  }
}

let queue = Promise.resolve();
const MIN_GAP_MS = 1200;

function spaced(task) {
  const run = queue.then(task);
  queue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, MIN_GAP_MS)));
  return run;
}

export function cachedPlace(lat, lng) {
  return loadCache()[cellKey(lat, lng)] || null;
}

// Resolves to {road, area, city} or null. Never throws and never blocks
// anything the user is doing.
export function resolvePlace(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return Promise.resolve(null);
  const key = cellKey(lat, lng);
  const cache = loadCache();
  if (cache[key]) return Promise.resolve(cache[key]);

  return spaced(async () => {
    const fresh = loadCache();
    if (fresh[key]) return fresh[key];
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;
      const body = await response.json();
      const a = body.address || {};
      const place = {
        road: a.road || a.pedestrian || a.footway || '',
        area: a.neighbourhood || a.suburb || a.quarter || a.city_district || '',
        city: a.city || a.town || a.municipality || '',
      };
      if (!place.road && !place.area && !place.city) return null;
      const store = loadCache();
      store[key] = place;
      saveCache(store);
      return place;
    } catch {
      return null; // offline, rate-limited, blocked — all fine, coords are kept
    }
  });
}

export function placeLabel(place) {
  if (!place) return '';
  return place.road || place.area || place.city || '';
}

// Groups doors into the streets/areas they were logged on, commonest first.
// This is what answers "where did I actually go today" without any typing.
export function areasCovered(doors) {
  const counts = new Map();
  doors.forEach((door) => {
    const label = placeLabel(door.place);
    if (!label) return;
    const entry = counts.get(label) || { label, doors: 0, area: door.place.area || '' };
    entry.doors += 1;
    counts.set(label, entry);
  });
  return [...counts.values()].sort((a, b) => b.doors - a.doors);
}
