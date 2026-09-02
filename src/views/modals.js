import * as state from '../state.js';
import * as domain from '../domain.js';
import { nowLocalDateTime, todayISO } from '../storage.js';

export function esc(value) {
  return String(value == null ? '' : value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function openSheet(buildContent) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  overlay.appendChild(sheet);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  function close() {
    overlay.remove();
  }
  document.body.appendChild(overlay);
  buildContent(sheet, close);
  return { sheet, close };
}

// A row of single-select chips. Returns a getter for the current value so
// callers don't have to re-query the DOM.
function serviceChips(sheet, selector, initial) {
  let selected = initial || domain.SERVICES[0];
  const row = sheet.querySelector(selector);
  domain.SERVICES.forEach((service) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (service === selected ? ' active' : '');
    chip.textContent = service;
    chip.addEventListener('click', () => {
      selected = service;
      row.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
    });
    row.appendChild(chip);
  });
  return () => selected;
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

// --- Territory -------------------------------------------------------------

export function openNewTerritoryModal(onCreated) {
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">New territory</p>
      <p class="sheet-sub">A neighbourhood or route you can compare against the others.</p>
      <div class="field">
        <label>Name</label>
        <input type="text" id="t-name" placeholder="Centennial" />
      </div>
      <div class="field">
        <label>Area (optional)</label>
        <input type="text" id="t-area" placeholder="Scarborough, ON" />
      </div>
      <div class="field">
        <label>Doors in this territory (optional)</label>
        <input type="number" id="t-doors" inputmode="numeric" placeholder="85" min="1" step="1" />
      </div>
      <button class="btn-primary" id="t-save">Create territory</button>
    `;
    const nameInput = sheet.querySelector('#t-name');
    sheet.querySelector('#t-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const doors = parseInt(sheet.querySelector('#t-doors').value, 10);
      const territory = state.createTerritory(
        name,
        sheet.querySelector('#t-area').value.trim(),
        doors > 0 ? doors : null
      );
      close();
      if (onCreated) onCreated(territory);
    });
  });
}

// --- Quote given -----------------------------------------------------------

export function openQuoteModal({ sessionId, territoryId, address }, onDone) {
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Quote given</p>
      <p class="sheet-sub">${address ? esc(address) : 'This door'}</p>
      <div class="field">
        <label>Customer name</label>
        <input type="text" id="q-name" placeholder="Sarah Johnson" />
      </div>
      <div class="field">
        <label>Phone (optional)</label>
        <input type="tel" id="q-phone" inputmode="tel" placeholder="416 555 0199" />
      </div>
      <div class="field">
        <label>Service</label>
        <div class="chip-row" id="q-services"></div>
      </div>
      <div class="field">
        <label>Quote amount</label>
        <div class="input-prefix">
          <span class="prefix-symbol">${domain.currencySymbol()}</span>
          <input type="number" id="q-amount" inputmode="decimal" placeholder="350" min="0" step="1" />
        </div>
      </div>
      <div class="field">
        <label>Follow up on</label>
        <input type="date" id="q-followup" value="${tomorrowISO()}" />
      </div>
      <div class="field">
        <label>Notes (optional)</label>
        <textarea id="q-note" placeholder="Wants to discuss with spouse."></textarea>
      </div>
      <button class="btn-primary" id="q-save">Log quote</button>
    `;
    const getService = serviceChips(sheet, '#q-services');
    const nameInput = sheet.querySelector('#q-name');
    sheet.querySelector('#q-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const amount = parseFloat(sheet.querySelector('#q-amount').value);
      state.logQuoteGiven({
        sessionId,
        territoryId,
        address,
        name,
        phone: sheet.querySelector('#q-phone').value.trim(),
        service: getService(),
        amount: amount > 0 ? amount : 0,
        followUpDate: sheet.querySelector('#q-followup').value || null,
        note: sheet.querySelector('#q-note').value.trim(),
      });
      close();
      if (onDone) onDone();
    });
  });
}

// --- Booked ----------------------------------------------------------------

export function openBookedModal({ sessionId, territoryId, address }, onDone) {
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Job booked</p>
      <p class="sheet-sub">Goes straight onto the Jobs schedule.</p>
      <div class="field">
        <label>Customer name</label>
        <input type="text" id="b-name" placeholder="Michael Thompson" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Phone</label>
          <input type="tel" id="b-phone" inputmode="tel" placeholder="416 555 0199" />
        </div>
        <div class="field">
          <label>Price</label>
          <div class="input-prefix">
            <span class="prefix-symbol">${domain.currencySymbol()}</span>
            <input type="number" id="b-amount" inputmode="decimal" placeholder="485" min="0" step="1" />
          </div>
        </div>
      </div>
      <div class="field">
        <label>Email (optional)</label>
        <input type="email" id="b-email" inputmode="email" placeholder="name@email.com" />
      </div>
      <div class="field">
        <label>Address</label>
        <input type="text" id="b-address" value="${esc(address || '')}" placeholder="45 Oakridge Dr" />
      </div>
      <div class="field">
        <label>Service</label>
        <div class="chip-row" id="b-services"></div>
      </div>
      <div class="field">
        <label>Scheduled for</label>
        <input type="datetime-local" id="b-when" value="${nowLocalDateTime()}" />
      </div>
      <div class="field">
        <label>Notes (optional)</label>
        <textarea id="b-note" placeholder="Back gate code 4417."></textarea>
      </div>
      <button class="btn-primary" id="b-save">Book job</button>
    `;
    const getService = serviceChips(sheet, '#b-services');
    const nameInput = sheet.querySelector('#b-name');
    sheet.querySelector('#b-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const amount = parseFloat(sheet.querySelector('#b-amount').value);
      const when = sheet.querySelector('#b-when').value;
      state.logBooked({
        sessionId,
        territoryId,
        address: sheet.querySelector('#b-address').value.trim() || address,
        name,
        phone: sheet.querySelector('#b-phone').value.trim(),
        email: sheet.querySelector('#b-email').value.trim(),
        service: getService(),
        amount: amount > 0 ? amount : 0,
        scheduledAt: when ? new Date(when).toISOString() : null,
        note: sheet.querySelector('#b-note').value.trim(),
      });
      close();
      if (onDone) onDone();
    });
  });
}

// --- Follow up -------------------------------------------------------------

export function openFollowUpModal({ sessionId, territoryId, address }, onDone) {
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Follow up</p>
      <p class="sheet-sub">Interested, but not today. Everything here is optional.</p>
      <div class="field">
        <label>Name</label>
        <input type="text" id="f-name" placeholder="Homeowner at ${esc(address || 'this door')}" />
      </div>
      <div class="field">
        <label>Come back on</label>
        <input type="date" id="f-date" value="${tomorrowISO()}" />
      </div>
      <div class="field">
        <label>Notes</label>
        <textarea id="f-note" placeholder="Interested in full exterior. Prefers weekends."></textarea>
      </div>
      <button class="btn-primary" id="f-save">Log follow-up</button>
    `;
    sheet.querySelector('#f-save').addEventListener('click', () => {
      state.logFollowUp({
        sessionId,
        territoryId,
        address,
        name: sheet.querySelector('#f-name').value.trim(),
        followUpDate: sheet.querySelector('#f-date').value || null,
        note: sheet.querySelector('#f-note').value.trim(),
      });
      close();
      if (onDone) onDone();
    });
  });
}

// --- End of session --------------------------------------------------------

export function openSessionSummaryModal(session, doors) {
  const stats = domain.doorStats(doors);
  const ms = domain.elapsedMs(session);
  const rate = domain.doorsPerHour(stats.knocked, ms);
  const test = domain.territoryTest(doors);

  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Session complete</p>
      <p class="sheet-sub">${esc(session.territoryName)} &middot; ${domain.formatDuration(ms)}</p>
      <div class="stat-strip">
        <div class="stat"><p class="stat-value">${stats.knocked}</p><p class="stat-label">Doors</p></div>
        <div class="stat"><p class="stat-value">${stats.answered}</p><p class="stat-label">Answered</p></div>
        <div class="stat"><p class="stat-value blue">${stats.quotes}</p><p class="stat-label">Quotes</p></div>
        <div class="stat"><p class="stat-value green">${stats.jobs}</p><p class="stat-label">Jobs</p></div>
        <div class="stat"><p class="stat-value gold">${domain.formatCurrency(stats.revenueBooked)}</p><p class="stat-label">Booked</p></div>
      </div>
      <div class="card">
        <div class="card-row"><span class="muted">Doors per hour</span><strong>${rate.toFixed(1)}</strong></div>
        <div class="card-row"><span class="muted">Answer rate</span><strong>${domain.formatPercent(stats.knocked ? stats.answered / stats.knocked : 0)}</strong></div>
        <div class="card-row"><span class="muted">Quote value</span><strong>${domain.formatCurrency(stats.quoteValue)}</strong></div>
        <div class="card-row"><span class="muted">Revenue per door</span><strong>${domain.formatCurrency(domain.revenuePerDoor(stats.revenueBooked, stats.knocked))}</strong></div>
      </div>
      ${
        test
          ? `<div class="test-banner ${test.level}"><div><p class="test-title">${test.title}</p><p class="test-body">Last ${domain.TEST_BLOCK} doors: ${test.stats.answered} answered, ${domain.plural(test.stats.quotes, 'quote')}, ${test.stats.jobs} booked.</p></div></div>`
          : ''
      }
      <button class="btn-primary" id="s-done">Done</button>
    `;
    sheet.querySelector('#s-done').addEventListener('click', close);
  });
}
