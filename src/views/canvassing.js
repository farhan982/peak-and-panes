import * as state from '../state.js';
import * as domain from '../domain.js';
import * as geo from '../geo.js';
import { icon } from '../icons.js';
import { buildScreen } from './header.js';
import {
  openNewTerritoryModal,
  openQuoteModal,
  openBookedModal,
  openFollowUpModal,
  openSessionSummaryModal,
  esc,
} from './modals.js';

// Module scope on purpose: the whole app re-renders on every state change, so
// anything that should survive logging a door has to live outside the render.
let selectedTerritoryId = null;
let currentAddress = '';
let dismissedTestBlock = 0;
let timerHandle = null;
// Result of the last "use my location" tap on the picker. View-local: it is a
// reading, not data, so it is deliberately not persisted.
let detected = null;
let detecting = false;

// The icon and colour for each outcome tile, in the order they are laid out.
const TILE_STYLE = {
  no_answer: { icon: 'door', tone: 'blue' },
  not_interested: { icon: 'xCircle', tone: 'orange' },
  quote_given: { icon: 'doc', tone: 'blue' },
  booked: { icon: 'checkCircle', tone: 'green' },
  follow_up: { icon: 'clock', tone: 'purple' },
};

// setInterval rather than requestAnimationFrame: rAF is fully paused in a
// backgrounded tab, and one tick a second is all the timer needs anyway.
function startTimer(session, el) {
  stopTimer();
  const tick = () => {
    el.textContent = domain.formatDuration(domain.elapsedMs(session));
  };
  tick();
  timerHandle = setInterval(tick, 1000);
}

export function stopTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

// Coordinates are attached after the fact so the tap itself is never delayed
// by the GPS. Nothing on screen shows them, so no re-render is needed.
async function stampDoor(doorId) {
  if (!doorId || !geo.isSupported()) return;
  const fix = await geo.getFix();
  if (!fix) return;
  state.attachDoorLocation(doorId, { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy });

  const cached = geo.cachedPlace(fix.lat, fix.lng);
  if (cached) {
    state.attachDoorLocation(doorId, { place: cached });
    return;
  }
  const place = await geo.resolvePlace(fix.lat, fix.lng);
  if (place) state.attachDoorLocation(doorId, { place });
}

// A territory is "here" if the middle of its logged doors — or where it was
// created, before it has any — is within a few hundred metres.
const NEARBY_METRES = 400;

function locateTerritory(fix) {
  const s = state.getState();
  const scored = state
    .getTerritories()
    .map((territory) => {
      const doors = s.doors.filter((d) => d.territoryId === territory.id && typeof d.lat === 'number');
      const point = geo.centroid(doors) || territory.origin;
      return { territory, distance: geo.distanceMetres(fix, point) };
    })
    .filter((entry) => isFinite(entry.distance))
    .sort((a, b) => a.distance - b.distance);
  const best = scored[0];
  return best && best.distance <= NEARBY_METRES ? best : null;
}

export function renderCanvassing(root) {
  stopTimer();
  const session = state.getActiveSession();
  if (session) {
    renderActiveSession(root, session);
  } else {
    renderTerritoryPicker(root);
  }
}

// ---------------------------------------------------------------------------
// No session running
// ---------------------------------------------------------------------------

function renderTerritoryPicker(root) {
  const s = state.getState();
  const territories = state.getTerritories();
  const page = buildScreen(root, {
    title: 'Canvassing',
    subtitle: 'Pick a territory and start knocking.',
  });

  page.appendChild(buildLocationCard(page));

  if (!territories.length) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = `
      <p class="card-title">No territories yet</p>
      <p class="card-sub">Add the first neighbourhood you plan to work. Every door you
        log gets attributed to it, so you can compare them later.</p>
    `;
    page.appendChild(empty);
  } else {
    // Ranked by revenue per door — the number that actually answers "where
    // should I go today". Territories with no doors yet sort last.
    const ranked = territories
      .map((t) => ({ territory: t, stats: domain.territoryStats(s, t.id) }))
      .sort((a, b) => b.stats.revenuePerDoor - a.stats.revenuePerDoor);

    const title = document.createElement('p');
    title.className = 'section-title';
    title.textContent = 'Territories';
    page.appendChild(title);

    ranked.forEach(({ territory, stats }, i) => {
      const worked = stats.knocked > 0;
      const isSelected = territory.id === selectedTerritoryId;
      const row = document.createElement('button');
      row.className = 'row';
      if (isSelected) row.style.boxShadow = '0 0 0 2px var(--blue), var(--shadow)';
      row.innerHTML = `
        <div class="rank-badge${worked && i === 0 ? ' top' : ''}">${worked ? i + 1 : '–'}</div>
        <div class="row-main">
          <p class="row-title">${esc(territory.name)}</p>
          <p class="row-sub">${
            worked
              ? `${domain.plural(stats.knocked, 'door')} · ${domain.plural(
                  stats.quotes,
                  'quote'
                )} · ${domain.plural(stats.jobs, 'job')}`
              : esc(territory.area || 'Not worked yet')
          }</p>
        </div>
        <div class="row-right">
          <p class="row-amount">${worked ? domain.formatCurrency(stats.revenuePerDoor) : '—'}</p>
          <p class="row-sub">per door</p>
        </div>
      `;
      row.addEventListener('click', () => {
        selectedTerritoryId = territory.id;
        state.refresh();
      });
      page.appendChild(row);
    });
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-secondary';
  addBtn.textContent = '+ New territory';
  addBtn.style.marginBottom = '10px';
  addBtn.addEventListener('click', () =>
    openNewTerritoryModal((territory) => {
      // createTerritory already re-rendered; this only pre-selects it.
      selectedTerritoryId = territory.id;
      state.refresh();
    })
  );
  page.appendChild(addBtn);

  const selected = selectedTerritoryId ? state.getTerritory(selectedTerritoryId) : null;
  const start = document.createElement('button');
  start.className = 'btn-primary';
  start.disabled = !selected;
  start.textContent = selected ? `Start session — ${selected.name}` : 'Select a territory to start';
  start.addEventListener('click', () => {
    if (!selectedTerritoryId) return;
    currentAddress = '';
    dismissedTestBlock = 0;
    const session = state.startSession(selectedTerritoryId);
    detected = null;
    geo.getFix().then((fix) => {
      if (fix) state.attachSessionLocation(session.id, { startedAtLat: fix.lat, startedAtLng: fix.lng });
    });
  });
  page.appendChild(start);

  const past = state.getSessions().filter((x) => x.endedAt);
  if (past.length) {
    const title = document.createElement('p');
    title.className = 'section-title';
    title.textContent = 'Recent sessions';
    page.appendChild(title);

    past.slice(0, 5).forEach((session) => {
      const stats = domain.doorStats(domain.sessionDoors(s, session.id));
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="row-main">
          <p class="row-title">${esc(session.territoryName)}</p>
          <p class="row-sub">${domain.formatDateTime(session.startedAt)} · ${domain.formatDuration(
            domain.elapsedMs(session)
          )}</p>
        </div>
        <div class="row-right">
          <p class="row-amount">${domain.plural(stats.knocked, 'door')}</p>
          <p class="row-sub">${domain.plural(stats.quotes, 'quote')} · ${domain.plural(
            stats.jobs,
            'job'
          )}</p>
        </div>
      `;
      page.appendChild(row);
    });
  }
}

function buildLocationCard() {
  const card = document.createElement('div');
  card.className = 'card';

  if (!geo.isSupported()) {
    card.innerHTML = `
      <p class="card-title">Location unavailable</p>
      <p class="card-sub">${geo.errorHint()}</p>
    `;
    return card;
  }

  const label = detected && detected.place ? geo.placeLabel(detected.place) : '';
  card.innerHTML = `
    <p class="card-title">Where are you?</p>
    <p class="card-sub">${
      detecting
        ? 'Getting a fix…'
        : detected
        ? detected.match
          ? `You're in <strong>${esc(detected.match.territory.name)}</strong>, about ${geo.formatDistance(
              detected.match.distance
            )} from where you last worked it.`
          : label
          ? `You're on <strong>${esc(label)}</strong>${
              detected.place.area ? `, ${esc(detected.place.area)}` : ''
            }. No territory here yet.`
          : 'Got your position, but no territory here yet.'
        : "Find the neighbourhood you're standing in instead of picking it from the list."
    }</p>
  `;

  const action = document.createElement('button');
  action.className = detected && !detected.match ? 'btn-primary' : 'btn-secondary';
  action.style.marginTop = '12px';
  action.disabled = detecting;

  if (detected && !detected.match) {
    action.textContent = label ? `Create territory here` : 'Create territory here';
    action.addEventListener('click', () => {
      openNewTerritoryModal(
        (territory) => {
          selectedTerritoryId = territory.id;
          detected = null;
          state.refresh();
        },
        {
          name: detected.place ? detected.place.area || detected.place.road : '',
          area: detected.place ? detected.place.city : '',
          origin: { lat: detected.fix.lat, lng: detected.fix.lng },
        }
      );
    });
  } else {
    action.textContent = detecting ? 'Locating…' : 'Use my location';
    action.addEventListener('click', async () => {
      detecting = true;
      state.refresh();
      const fix = await geo.getFix();
      detecting = false;
      if (!fix) {
        detected = null;
        state.refresh();
        window.alert(geo.errorHint() || 'Could not get a location fix. Try again outdoors.');
        return;
      }
      const match = locateTerritory(fix);
      if (match) selectedTerritoryId = match.territory.id;
      detected = { fix, match, place: geo.cachedPlace(fix.lat, fix.lng) };
      state.refresh();
      if (!detected.place) {
        const place = await geo.resolvePlace(fix.lat, fix.lng);
        if (place && detected && detected.fix === fix) {
          detected.place = place;
          state.refresh();
        }
      }
    });
  }
  card.appendChild(action);
  return card;
}

// ---------------------------------------------------------------------------
// Session running
// ---------------------------------------------------------------------------

function renderActiveSession(root, session) {
  const s = state.getState();
  const doors = domain.sessionDoors(s, session.id);
  const stats = domain.doorStats(doors);
  const territory = state.getTerritory(session.territoryId);

  const timerChip = document.createElement('div');
  timerChip.className = 'timer-chip';
  timerChip.innerHTML = `${icon('clock', 17)}<span id="timer-value">00:00:00</span>`;

  const page = buildScreen(root, {
    title: 'Canvassing Session',
    subtitle: esc(session.territoryName),
    subtitleGold: true,
    right: timerChip,
  });

  const rate = domain.doorsPerHour(stats.knocked, domain.elapsedMs(session));
  const statCard = document.createElement('div');
  statCard.className = 'stat-card';
  statCard.innerHTML = `
    <div class="stat-cell">
      <p class="stat-name">Doors Knocked</p>
      <p class="stat-num">${stats.knocked}</p>
      <p class="stat-foot grey">${rate ? `${rate.toFixed(0)}/hr` : '—'}</p>
    </div>
    <div class="stat-cell">
      <p class="stat-name">Answered</p>
      <p class="stat-num">${stats.answered}</p>
      <p class="stat-foot">${domain.formatPercent(stats.knocked ? stats.answered / stats.knocked : 0)}</p>
    </div>
    <div class="stat-cell">
      <p class="stat-name">Quotes</p>
      <p class="stat-num">${stats.quotes}</p>
      <p class="stat-foot">${domain.formatCurrency(stats.quoteValue)}</p>
    </div>
    <div class="stat-cell">
      <p class="stat-name">Jobs</p>
      <p class="stat-num">${stats.jobs}</p>
      <p class="stat-foot green">${domain.formatCurrency(stats.revenueBooked)}</p>
    </div>
    <div class="stat-cell highlight">
      <p class="stat-name">Revenue Booked</p>
      <p class="stat-num small">${domain.formatCurrency(stats.revenueBooked)}</p>
      <p class="stat-foot grey">Session</p>
    </div>
  `;
  page.appendChild(statCard);

  const test = domain.territoryTest(doors);
  if (test && test.blockIndex > dismissedTestBlock) {
    const banner = document.createElement('div');
    banner.className = `test-banner ${test.level}`;
    banner.innerHTML = `
      <div>
        <p class="test-title">${test.title}</p>
        <p class="test-body">Doors ${(test.blockIndex - 1) * domain.TEST_BLOCK + 1}–${
          test.blockIndex * domain.TEST_BLOCK
        }: ${test.stats.answered} answered, ${domain.plural(
          test.stats.quotes,
          'quote'
        )}, ${test.stats.jobs} booked, ${domain.formatCurrency(test.stats.revenueBooked)} revenue.</p>
      </div>
      <button class="test-dismiss" aria-label="Dismiss">&times;</button>
    `;
    banner.querySelector('.test-dismiss').addEventListener('click', () => {
      dismissedTestBlock = test.blockIndex;
      banner.remove();
    });
    page.appendChild(banner);
  }

  const territoryDoors = territory ? s.doors.filter((d) => d.territoryId === territory.id).length : 0;
  const house = document.createElement('div');
  house.className = 'card';
  house.innerHTML = `
    <div class="house-head">
      <p>Current House</p>
      ${
        territory && territory.doorTarget
          ? `<span class="house-count">${territoryDoors} of ${territory.doorTarget}</span>`
          : ''
      }
    </div>
    <input class="house-input" id="house-address" type="text"
      placeholder="123 Pinecrest Ave" value="${esc(currentAddress)}" />
  `;
  const addressInput = house.querySelector('#house-address');
  addressInput.addEventListener('input', () => {
    currentAddress = addressInput.value;
  });
  page.appendChild(house);

  // Three tiles then two, matching the design's layout weighting.
  page.appendChild(buildTiles(['no_answer', 'not_interested', 'quote_given'], 'three', session, addressInput));
  page.appendChild(buildTiles(['booked', 'follow_up'], 'two', session, addressInput));

  if (territory && territory.doorTarget) {
    page.appendChild(buildRouteProgress(territoryDoors, territory.doorTarget));
  }

  if (doors.length) {
    const title = document.createElement('p');
    title.className = 'section-title';
    title.textContent = 'This session';
    page.appendChild(title);

    [...doors]
      .reverse()
      .slice(0, 6)
      .forEach((door, i) => {
        const tone = { booked: 'green', quote_given: 'blue', follow_up: 'purple', not_interested: 'orange' }[
          door.outcome
        ];
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `
          <div class="row-main">
            <p class="row-title">${esc(door.address || 'Unnamed door')}</p>
            <p class="row-sub">${new Date(door.at).toLocaleTimeString('en-CA', {
              hour: 'numeric',
              minute: '2-digit',
            })}${door.amount ? ` · ${domain.formatCurrency(door.amount)}` : ''}</p>
          </div>
          <span class="pill ${tone || ''}">${domain.outcomeLabel(door.outcome)}</span>
        `;
        // Undo is offered on the most recent door only — that's the mis-tap
        // you actually need to fix, and it keeps the row from getting busy.
        if (i === 0) {
          const undo = document.createElement('button');
          undo.className = 'link-btn';
          undo.textContent = 'Undo';
          undo.style.marginLeft = '4px';
          undo.addEventListener('click', () => state.undoDoor(door.id));
          row.appendChild(undo);
        }
        page.appendChild(row);
      });
  }

  const end = document.createElement('button');
  end.className = 'btn-secondary';
  end.style.marginTop = '6px';
  end.textContent = 'End session';
  end.addEventListener('click', () => {
    if (!doors.length) {
      // Nothing was logged, so there is no history worth keeping.
      state.discardSession(session.id);
      return;
    }
    const snapshot = { ...session, endedAt: new Date().toISOString() };
    state.endSession(session.id);
    openSessionSummaryModal(snapshot, doors);
  });
  page.appendChild(end);

  startTimer(session, timerChip.querySelector('#timer-value'));
}

function buildTiles(keys, size, session, addressInput) {
  const grid = document.createElement('div');
  grid.className = `tile-grid ${size}`;
  keys.forEach((key) => {
    const style = TILE_STYLE[key];
    const btn = document.createElement('button');
    btn.className = 'tile';
    btn.innerHTML = `<span class="tile-icon ${style.tone}">${icon(style.icon, 24)}</span><span>${domain.outcomeLabel(
      key
    )}</span>`;
    btn.addEventListener('click', () => handleOutcome(key, session, addressInput.value.trim()));
    grid.appendChild(btn);
  });
  return grid;
}

const STEPS = 8;

function buildRouteProgress(done, total) {
  const pct = Math.min(1, done / total);
  const filled = Math.min(STEPS, Math.round(pct * STEPS));

  const card = document.createElement('div');
  card.className = 'card';
  let stepper = '';
  for (let i = 0; i < STEPS; i++) {
    if (i > 0) stepper += `<div class="step-line${i <= filled ? ' done' : ''}"></div>`;
    const cls = i < filled ? 'done' : i === filled ? 'current' : '';
    stepper += `<div class="step-node ${cls}">${i < filled ? icon('checkCircle', 11) : ''}</div>`;
  }
  card.innerHTML = `
    <div class="house-head">
      <p>Route Progress</p>
      <span class="house-count">${done} of ${total} doors</span>
    </div>
    <div class="stepper">${stepper}</div>
    <div class="step-labels"><span>Start</span><span>You are here</span><span>Finish</span></div>
  `;
  return card;
}

function handleOutcome(outcome, session, address) {
  const context = { sessionId: session.id, territoryId: session.territoryId, address };
  // The sheet flows save (and therefore re-render) before this runs, so the
  // address field has to be cleared with a second render of its own.
  const afterSheet = () => {
    currentAddress = '';
    // The door the sheet just created is the session's most recent one.
    stampDoor(state.latestDoorId(session.id));
    state.refresh();
  };
  if (outcome === 'quote_given') {
    openQuoteModal(context, afterSheet);
  } else if (outcome === 'booked') {
    openBookedModal(context, afterSheet);
  } else if (outcome === 'follow_up') {
    openFollowUpModal(context, afterSheet);
  } else {
    // No Answer and Not Interested need no extra information, so they stay
    // true one-tap actions. Clearing before the log means the re-render that
    // logDoor triggers already shows an empty field.
    currentAddress = '';
    const door = state.logDoor({ ...context, outcome });
    stampDoor(door.id);
  }
}
