import * as state from '../state.js';
import * as domain from '../domain.js';
import * as geo from '../geo.js';
import { buildScreen } from './header.js';
import { openJobSheet, openQuoteSheet, esc } from './modals.js';

const FILTERS = [
  ['all', 'All'],
  ['open', 'Open'],
  ['booked', 'Booked'],
  ['completed', 'Completed'],
];

// Module scope so the filter survives the app-wide re-render, same as the
// Jobs tabs.
let filter = 'all';
let mapInstance = null;
let leafletPromise = null;

export function setMapFilter(next) {
  filter = next;
}

// Leaflet is vendored rather than pulled from a CDN, and loaded only when the
// map is first opened — it is 147KB that most sessions never need.
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = './assets/vendor/leaflet.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = './assets/vendor/leaflet.js';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Leaflet failed to load'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function matches(point) {
  if (filter === 'all') return true;
  if (filter === 'open') return point.status === 'open' || point.status === 'lead';
  return point.status === filter;
}

export function renderMap(root) {
  // A previous instance is attached to a container that is about to be thrown
  // away; Leaflet keeps listeners on the window until it is told otherwise.
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  const s = state.getState();
  const page = buildScreen(root, {
    title: 'Map',
    subtitle: 'Where the work is.',
    seg: FILTERS.map(([key, label]) => ({
      label,
      active: filter === key,
      onSelect: () => {
        filter = key;
        state.refresh();
      },
    })),
  });

  const all = domain.mapPoints(s);
  const points = all.filter(matches);

  if (!all.length) {
    page.appendChild(
      note('Nothing to map yet', 'Quotes and jobs appear here once you have some on the books.')
    );
    return;
  }
  if (!points.length) {
    page.appendChild(note('Nothing in this filter', 'Try All to see everything you have.'));
    return;
  }

  const card = document.createElement('div');
  card.className = 'card flush';
  const holder = document.createElement('div');
  holder.className = 'map-holder';
  holder.innerHTML = '<p class="map-loading">Loading map…</p>';
  card.appendChild(holder);
  page.appendChild(card);
  page.appendChild(buildLegend(points));

  draw(holder, points, s);
}

async function draw(holder, points, s) {
  let L;
  try {
    L = await loadLeaflet();
  } catch {
    holder.innerHTML = '<p class="map-loading">The map could not load.</p>';
    return;
  }

  // Positions come from the door that produced the record; anything booked by
  // phone has only an address and is looked up in the background.
  const located = [];
  const pending = [];
  points.forEach((point) => {
    const fix = point.fix || geo.cachedGeocode(point.address);
    if (fix) located.push({ ...point, fix });
    else if (point.address) pending.push(point);
  });

  if (!located.length && !pending.length) {
    holder.innerHTML =
      '<p class="map-loading">None of these have a position yet. Addresses are looked up when you are online.</p>';
    return;
  }

  holder.innerHTML = '';
  const centre = located[0] ? located[0].fix : domain.workingCentre(s) || { lat: 43.77, lng: -79.25 };
  mapInstance = L.map(holder, { attributionControl: true }).setView([centre.lat, centre.lng], 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(mapInstance);

  const layer = L.layerGroup().addTo(mapInstance);
  const plot = (list) => {
    layer.clearLayers();
    list.forEach((point) => {
      const [, colour] = domain.MAP_STATUSES[point.status];
      L.circleMarker([point.fix.lat, point.fix.lng], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: colour,
        fillOpacity: 0.95,
      })
        .addTo(layer)
        .bindPopup(popupHtml(point))
        .on('popupopen', (e) => {
          const link = e.popup.getElement().querySelector('.map-open');
          if (link) {
            link.addEventListener('click', () => {
              if (point.kind === 'job') openJobSheet(point.id);
              else openQuoteSheet(point.id);
            });
          }
        });
    });
    if (list.length > 1) {
      mapInstance.fitBounds(list.map((p) => [p.fix.lat, p.fix.lng]), { padding: [30, 30], maxZoom: 16 });
    }
  };
  plot(located);

  // Fill in the missing ones as the lookups come back, without re-rendering
  // the screen underneath the map.
  if (pending.length) {
    const near = domain.workingCentre(s);
    for (const point of pending) {
      // eslint-disable-next-line no-await-in-loop -- the lookups are queued anyway
      const fix = await geo.geocodeAddress(point.address, near);
      if (!mapInstance) return; // navigated away mid-lookup
      if (fix) {
        located.push({ ...point, fix });
        plot(located);
      }
    }
  }
}

function popupHtml(point) {
  const [label] = domain.MAP_STATUSES[point.status];
  return `
    <p class="map-pop-title">${esc(point.name)}</p>
    <p class="map-pop-sub">${esc(point.address || 'No address')}</p>
    <p class="map-pop-sub">${label}${point.service ? ` · ${esc(point.service)}` : ''}${
      point.amount ? ` · ${domain.formatCurrency(point.amount)}` : ''
    }</p>
    <button class="map-open">Open</button>
  `;
}

function buildLegend(points) {
  const counts = {};
  points.forEach((p) => {
    counts[p.status] = (counts[p.status] || 0) + 1;
  });
  const legend = document.createElement('div');
  legend.className = 'card map-legend';
  legend.innerHTML = Object.entries(domain.MAP_STATUSES)
    .filter(([key]) => counts[key])
    .map(
      ([key, [label, colour]]) =>
        `<span><i class="map-dot" style="background:${colour}"></i>${label} · ${counts[key]}</span>`
    )
    .join('');
  return legend;
}

function note(title, body) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<p class="card-title">${title}</p><p class="card-sub">${body}</p>`;
  return card;
}
