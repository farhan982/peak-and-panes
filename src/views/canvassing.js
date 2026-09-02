import * as state from '../state.js';
import * as domain from '../domain.js';
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

// setInterval rather than requestAnimationFrame: rAF is fully paused in a
// backgrounded tab, and one tick a second is all the timer needs anyway.
function startTimer(session, el, rateEl, doorCount) {
  stopTimer();
  const tick = () => {
    const ms = domain.elapsedMs(session);
    el.textContent = domain.formatDuration(ms);
    const rate = domain.doorsPerHour(doorCount, ms);
    if (!doorCount) {
      rateEl.textContent = 'No doors logged yet';
      return;
    }
    // The rate is meaningless in the first minute, so only show it once it is.
    rateEl.textContent = rate
      ? `${domain.plural(doorCount, 'door')} · ${rate.toFixed(1)} per hour`
      : domain.plural(doorCount, 'door');
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

  const header = document.createElement('div');
  header.className = 'app-header';
  header.innerHTML = `
    <div class="brand">
      <div class="brand-mark">&#9650;</div>
      <div>
        <p class="page-title">Canvassing</p>
        <p class="page-subtitle">Pick a territory and start knocking.</p>
      </div>
    </div>
  `;
  root.appendChild(header);

  if (!territories.length) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = `
      <p class="card-title">No territories yet</p>
      <p class="card-sub">Add the first neighbourhood you plan to work. Every door you
        log gets attributed to it, so you can compare them later.</p>
    `;
    root.appendChild(empty);
  } else {
    // Ranked by revenue per door — the number that actually answers "where
    // should I go today". Territories with no doors yet sort last.
    const ranked = territories
      .map((t) => ({ territory: t, stats: domain.territoryStats(s, t.id) }))
      .sort((a, b) => b.stats.revenuePerDoor - a.stats.revenuePerDoor);

    const title = document.createElement('p');
    title.className = 'section-title';
    title.textContent = 'Territories';
    root.appendChild(title);

    ranked.forEach(({ territory, stats }, i) => {
      const row = document.createElement('button');
      const isSelected = territory.id === selectedTerritoryId;
      row.className = 'list-row';
      if (isSelected) row.style.borderColor = 'var(--blue)';
      const worked = stats.knocked > 0;
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
      root.appendChild(row);
    });
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-secondary';
  addBtn.textContent = '+ New territory';
  addBtn.style.marginBottom = '12px';
  addBtn.addEventListener('click', () =>
    openNewTerritoryModal((territory) => {
      // createTerritory already re-rendered; this only pre-selects it.
      selectedTerritoryId = territory.id;
      state.refresh();
    })
  );
  root.appendChild(addBtn);

  const start = document.createElement('button');
  start.className = 'btn-primary';
  const selected = selectedTerritoryId ? state.getTerritory(selectedTerritoryId) : null;
  start.disabled = !selected;
  start.textContent = selected ? `Start session — ${selected.name}` : 'Select a territory to start';
  start.addEventListener('click', () => {
    if (!selectedTerritoryId) return;
    currentAddress = '';
    dismissedTestBlock = 0;
    state.startSession(selectedTerritoryId);
  });
  root.appendChild(start);

  const past = state.getSessions().filter((x) => x.endedAt);
  if (past.length) {
    const title = document.createElement('p');
    title.className = 'section-title';
    title.textContent = 'Recent sessions';
    root.appendChild(title);

    past.slice(0, 5).forEach((session) => {
      const doors = domain.sessionDoors(s, session.id);
      const stats = domain.doorStats(doors);
      const row = document.createElement('div');
      row.className = 'list-row';
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
      root.appendChild(row);
    });
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

  const header = document.createElement('div');
  header.className = 'app-header';
  header.innerHTML = `
    <div class="brand">
      <div class="brand-mark">&#9650;</div>
      <div>
        <p class="page-title">Canvassing</p>
        <p class="page-subtitle">Session live</p>
      </div>
    </div>
    <button class="link-btn" id="end-session">End</button>
  `;
  header.querySelector('#end-session').addEventListener('click', () => {
    if (!doors.length) {
      // Nothing was logged, so there is no history worth keeping.
      state.discardSession(session.id);
      return;
    }
    const snapshot = { ...session, endedAt: new Date().toISOString() };
    state.endSession(session.id);
    openSessionSummaryModal(snapshot, doors);
  });
  root.appendChild(header);

  const timer = document.createElement('div');
  timer.className = 'timer-card';
  timer.innerHTML = `
    <p class="timer-territory">${esc(session.territoryName)}</p>
    <p class="timer-value" id="timer-value">00:00:00</p>
    <p class="timer-rate" id="timer-rate"></p>
  `;
  root.appendChild(timer);

  const strip = document.createElement('div');
  strip.className = 'stat-strip';
  strip.innerHTML = `
    <div class="stat"><p class="stat-value">${stats.knocked}</p><p class="stat-label">Doors</p></div>
    <div class="stat"><p class="stat-value">${stats.answered}</p><p class="stat-label">Answered</p></div>
    <div class="stat"><p class="stat-value blue">${stats.quotes}</p><p class="stat-label">Quotes</p></div>
    <div class="stat"><p class="stat-value green">${stats.jobs}</p><p class="stat-label">Jobs</p></div>
    <div class="stat"><p class="stat-value gold">${domain.formatCurrency(stats.revenueBooked)}</p><p class="stat-label">Booked</p></div>
  `;
  root.appendChild(strip);

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
    root.appendChild(banner);
  }

  const house = document.createElement('div');
  house.className = 'house-card';
  house.innerHTML = `
    <p class="house-label">Current house</p>
    <input class="house-input" id="house-address" type="text"
      placeholder="123 Pinecrest Ave" value="${esc(currentAddress)}" />
  `;
  const addressInput = house.querySelector('#house-address');
  addressInput.addEventListener('input', () => {
    currentAddress = addressInput.value;
  });

  // Route progress against the territory's door count, if one was set.
  const territoryDoors = territory ? s.doors.filter((d) => d.territoryId === territory.id).length : 0;
  if (territory && territory.doorTarget) {
    const pct = Math.min(1, territoryDoors / territory.doorTarget);
    const progress = document.createElement('div');
    progress.innerHTML = `
      <div class="progress-line">
        <span>Route progress</span>
        <span>${territoryDoors} of ${territory.doorTarget} doors</span>
      </div>
      <div class="progress-track"><div class="progress-fill"></div></div>
    `;
    house.appendChild(progress);
    const fill = progress.querySelector('.progress-fill');
    setTimeout(() => {
      fill.style.width = `${pct * 100}%`;
    }, 30);
  }
  root.appendChild(house);

  const grid = document.createElement('div');
  grid.className = 'outcome-grid';
  domain.OUTCOMES.forEach((outcome) => {
    const btn = document.createElement('button');
    btn.className = `outcome-btn ${outcome.tone}` + (outcome.key === 'booked' ? ' wide' : '');
    btn.textContent = outcome.label;
    btn.addEventListener('click', () => handleOutcome(outcome.key, session, addressInput.value.trim()));
    grid.appendChild(btn);
  });
  root.appendChild(grid);

  if (doors.length) {
    const title = document.createElement('p');
    title.className = 'section-title';
    title.textContent = 'This session';
    root.appendChild(title);

    [...doors]
      .reverse()
      .slice(0, 6)
      .forEach((door, i) => {
        const row = document.createElement('div');
        row.className = 'list-row';
        const toneClass = {
          booked: 'green',
          quote_given: 'blue',
          follow_up: 'purple',
          not_interested: 'orange',
          no_answer: '',
        }[door.outcome];
        row.innerHTML = `
          <div class="row-main">
            <p class="row-title">${esc(door.address || 'Unnamed door')}</p>
            <p class="row-sub">${new Date(door.at).toLocaleTimeString('en-CA', {
              hour: 'numeric',
              minute: '2-digit',
            })}${door.amount ? ` · ${domain.formatCurrency(door.amount)}` : ''}</p>
          </div>
          <span class="pill ${toneClass}">${domain.outcomeLabel(door.outcome)}</span>
        `;
        // Undo is offered on the most recent door only — that's the mis-tap
        // you actually need to fix, and it keeps the row from getting busy.
        if (i === 0) {
          const undo = document.createElement('button');
          undo.className = 'link-btn';
          undo.textContent = 'Undo';
          undo.style.marginLeft = '10px';
          undo.addEventListener('click', () => state.undoDoor(door.id));
          row.appendChild(undo);
        }
        root.appendChild(row);
      });
  }

  startTimer(session, timer.querySelector('#timer-value'), timer.querySelector('#timer-rate'), stats.knocked);
}

function handleOutcome(outcome, session, address) {
  const context = { sessionId: session.id, territoryId: session.territoryId, address };
  // The sheet flows save (and therefore re-render) before this runs, so the
  // address field has to be cleared with a second render of its own.
  const afterSheet = () => {
    currentAddress = '';
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
    state.logDoor({ ...context, outcome });
  }
}
