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
  openTerritorySheet,
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
// Explanation shown under the address field, so a filled-in address never
// looks like something the app is certain about.
let addressHint = '';
// Set when the user edits the field by hand: their typing outranks any guess
// that arrives afterwards.
let addressTouched = false;

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

// Fills the address field with the next house. The prediction from the doors
// already logged is preferred over GPS: it costs nothing, works offline, and
// on a sequential run it is more accurate than a 10m fix.
function suggestNextAddress(session) {
  const doors = domain.sessionDoors(state.getState(), session.id);
  const predicted = geo.predictNextAddress(doors);
  if (predicted) {
    currentAddress = predicted.address;
    addressHint = `Predicted from your last door — edit if it's wrong`;
  } else {
    currentAddress = '';
    addressHint = '';
  }
  addressTouched = false;
}

// GPS decides the harder question: have you turned onto a different street?
// Only then is the field re-seeded from the geocoder.
async function verifyStreet(session) {
  if (!geo.isSupported()) return;
  const fix = await geo.getFix();
  if (!fix) return;
  const resolved =
    geo.cachedAddress(fix.lat, fix.lng) || (await geo.resolveAddress(fix.lat, fix.lng));
  if (!resolved || !resolved.road) return;

  // Never yank the field out from under someone who is typing in it, and
  // never overwrite an address they entered by hand.
  const input = document.querySelector('#house-address');
  if (addressTouched || (input && document.activeElement === input)) return;

  const doors = domain.sessionDoors(state.getState(), session.id);
  const known = geo.currentStreet(doors);
  if (known && geo.sameStreet(known, resolved.road)) return; // prediction is already right

  currentAddress = geo.formatAddress(resolved.houseNumber, resolved.road);
  addressHint = resolved.houseNumber
    ? 'From GPS — accurate to about 10 m, so check the number'
    : 'Street from GPS — add the number';
  state.refresh();
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
      // Split row: the wide area selects, the dots open the territory itself.
      // Nesting a button inside a button is invalid, hence the wrapper div.
      const row = document.createElement('div');
      row.className = 'row row-split';
      if (isSelected) row.style.boxShadow = '0 0 0 2px var(--blue), var(--shadow)';

      const hit = document.createElement('button');
      hit.className = 'row-hit';
      hit.innerHTML = `
        <span class="rank-badge${worked && i === 0 ? ' top' : ''}">${worked ? i + 1 : '–'}</span>
        <span class="row-main">
          <span class="row-title">${esc(territory.name)}</span>
          <span class="row-sub">${
            worked
              ? `${domain.plural(stats.knocked, 'door')} · ${domain.plural(
                  stats.quotes,
                  'quote'
                )} · ${domain.plural(stats.jobs, 'job')}`
              : esc(territory.area || 'Not worked yet')
          }</span>
        </span>
        <span class="row-right">
          <span class="row-amount">${worked ? domain.formatCurrency(stats.revenuePerDoor) : '—'}</span>
          <span class="row-sub">per door</span>
        </span>
      `;
      hit.addEventListener('click', () => {
        selectedTerritoryId = territory.id;
        state.refresh();
      });
      row.appendChild(hit);

      const more = document.createElement('button');
      more.className = 'row-more';
      more.setAttribute('aria-label', `Manage ${territory.name}`);
      more.innerHTML = icon('more', 18);
      more.addEventListener('click', () => openTerritorySheet(territory.id));
      row.appendChild(more);

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
    addressHint = '';
    addressTouched = false;
    const session = state.startSession(selectedTerritoryId);
    detected = null;
    geo.getFix().then(async (fix) => {
      if (!fix) return;
      state.attachSessionLocation(session.id, { startedAtLat: fix.lat, startedAtLng: fix.lng });
      // Seed the first house of the session; after this the prediction takes
      // over and no further lookups are needed on the same street.
      const resolved = await geo.resolveAddress(fix.lat, fix.lng);
      const input = document.querySelector('#house-address');
      if (!resolved || addressTouched || (input && document.activeElement === input)) return;
      currentAddress = geo.formatAddress(resolved.houseNumber, resolved.road);
      addressHint = resolved.houseNumber
        ? 'From GPS — accurate to about 10 m, so check the number'
        : 'Street from GPS — add the number';
      state.refresh();
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

  // Before the first tap: an offer. After it: a readout. The button does not
  // come back, because pressing it again would only repeat what is on screen.
  if (!detected) {
    card.innerHTML = `
      <p class="card-title">Where are you?</p>
      <p class="card-sub">${
        detecting
          ? 'Getting a fix…'
          : "Find the neighbourhood you're standing in instead of picking it from the list."
      }</p>
    `;
    const action = document.createElement('button');
    action.className = 'btn-secondary';
    action.style.marginTop = '12px';
    action.disabled = detecting;
    action.textContent = detecting ? 'Locating…' : 'Use my location';
    action.addEventListener('click', detect);
    card.appendChild(action);
    return card;
  }

  const area = detected.place && detected.place.area ? detected.place.area : '';
  const heading = detected.match
    ? `You're in <strong>${esc(detected.match.territory.name)}</strong>`
    : label
    ? `You're on <strong>${esc(label)}</strong>`
    : 'Position found';
  // Inside a fix's own margin of error, a distance is noise — "0 m" reads as
  // a measurement when it only means "close".
  const proximity = !detected.match
    ? ''
    : detected.match.distance < 30
    ? 'right where you last worked it'
    : `about ${geo.formatDistance(detected.match.distance)} from where you last worked it`;
  const detail = detected.match
    ? [label, proximity].filter(Boolean).join(' · ')
    : [area, 'no territory here yet'].filter(Boolean).join(' · ');

  card.innerHTML = `
    <div class="locate-row">
      <span class="locate-pin">${icon('navigate', 18)}</span>
      <div class="row-main">
        <p class="locate-title">${heading}</p>
        <p class="card-sub">${esc(detail)}</p>
      </div>
    </div>
  `;

  if (!detected.match) {
    const create = document.createElement('button');
    create.className = 'btn-primary';
    create.style.marginTop = '12px';
    create.textContent = 'Create territory here';
    create.addEventListener('click', () => {
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
    card.appendChild(create);
  }

  return card;
}

async function detect() {
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
    <div class="house-input-row">
      <input class="house-input" id="house-address" type="text"
        placeholder="123 Pinecrest Ave" value="${esc(currentAddress)}" />
      <button class="house-locate" id="house-locate" aria-label="Detect this address">${icon('navigate', 19)}</button>
    </div>
    ${addressHint ? `<p class="house-hint">${addressHint}</p>` : ''}
  `;
  const addressInput = house.querySelector('#house-address');
  addressInput.addEventListener('input', () => {
    currentAddress = addressInput.value;
    addressTouched = true;
  });
  house.querySelector('#house-locate').addEventListener('click', async () => {
    const btn = house.querySelector('#house-locate');
    btn.disabled = true;
    const fix = await geo.getFix({ maximumAge: 0 });
    const resolved = fix ? await geo.resolveAddress(fix.lat, fix.lng) : null;
    btn.disabled = false;
    if (!resolved) {
      window.alert(geo.errorHint() || 'Could not work out an address here. Type it in.');
      return;
    }
    currentAddress = geo.formatAddress(resolved.houseNumber, resolved.road);
    addressHint = resolved.houseNumber
      ? 'From GPS — accurate to about 10 m, so check the number'
      : 'Street from GPS — add the number';
    addressTouched = false;
    state.refresh();
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
    // The door the sheet just created is the session's most recent one.
    stampDoor(state.latestDoorId(session.id));
    suggestNextAddress(session);
    state.refresh();
    verifyStreet(session);
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
    const door = state.logDoor({ ...context, outcome });
    stampDoor(door.id);
    suggestNextAddress(session);
    state.refresh();
    verifyStreet(session);
  }
}
