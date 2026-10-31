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
let leafletPromise = null;

// Every live map, so the app can tear them down before the root is cleared.
// Leaflet keeps window listeners until it is told to let go.
const instances = [];

export function setMapFilter(next) {
  filter = next;
}

export function destroyMaps() {
  while (instances.length) {
    const map = instances.pop();
    try {
      map.remove();
    } catch {
      /* already gone */
    }
  }
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

export function filterPoints(points, which) {
  if (which === 'all') return points;
  if (which === 'open') return points.filter((p) => p.status === 'open' || p.status === 'lead');
  return points.filter((p) => p.status === which);
}

// One panel, used both inline under the Jobs tabs and as the full screen.
// `height` is the only thing that differs.
export function buildMapPanel(points, { height, extra } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'map-panel';

  const card = document.createElement('div');
  card.className = 'card flush';
  const holder = document.createElement('div');
  holder.className = 'map-holder';
  // min-height in the stylesheet would otherwise override a shorter inline
  // panel, so both are set together.
  if (height) {
    holder.style.height = height;
    holder.style.minHeight = height;
  }
  holder.innerHTML = '<p class="map-loading">Loading map…</p>';
  card.appendChild(holder);
  wrap.appendChild(card);
  wrap.appendChild(buildLegend(points, extra));

  draw(holder, points, state.getState());
  return wrap;
}

export function renderMap(root) {
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
  const points = filterPoints(all, filter);

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

  page.appendChild(buildMapPanel(points, { height: '58vh' }));
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

  // The screen may have been re-rendered while Leaflet was loading.
  if (!holder.isConnected) return;

  holder.innerHTML = '';
  const centre = located[0] ? located[0].fix : domain.workingCentre(s) || { lat: 43.77, lng: -79.25 };
  const map = L.map(holder, { attributionControl: true }).setView([centre.lat, centre.lng], 14);
  instances.push(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  const layer = L.layerGroup().addTo(map);
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
      // No zoom animation: navigating away mid-transition left Leaflet's
      // transition-end handler reading a pane that remove() had already torn
      // down, which threw on _leaflet_pos. Fitting instantly also feels
      // better on a panel that is only on screen for a glance.
      map.fitBounds(list.map((p) => [p.fix.lat, p.fix.lng]), {
        padding: [30, 30],
        maxZoom: 16,
        animate: false,
      });
    }
  };
  plot(located);

  // Fill in the missing ones as the lookups come back, without re-rendering
  // the screen underneath the map.
  const unplaced = points.filter((p) => !p.fix && !p.address).length;
  let unresolved = 0;
  if (pending.length) {
    const near = domain.workingCentre(s);
    for (const point of pending) {
      // eslint-disable-next-line no-await-in-loop -- the lookups are queued anyway
      const fix = await geo.geocodeAddress(point.address, near);
      if (!holder.isConnected) return; // navigated away mid-lookup
      if (fix) {
        located.push({ ...point, fix });
        plot(located);
      } else {
        unresolved += 1;
      }
    }
  }

  // An address the geocoder could not place near you gets no pin at all,
  // which would otherwise look like the job had simply vanished.
  const missing = unplaced + unresolved;
  if (missing && holder.isConnected) {
    const panel = holder.closest('.map-panel');
    const legend = panel && panel.querySelector('.map-legend');
    if (legend && !legend.querySelector('.map-missing')) {
      const note = document.createElement('span');
      note.className = 'map-missing';
      note.textContent = `${missing} not placed`;
      legend.insertBefore(note, legend.querySelector('.map-full-link') || null);
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

function buildLegend(points, extra) {
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
  if (extra) legend.appendChild(extra);
  return legend;
}

function note(title, body) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<p class="card-title">${title}</p><p class="card-sub">${body}</p>`;
  return card;
}
