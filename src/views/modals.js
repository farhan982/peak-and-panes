import * as state from '../state.js';
import * as domain from '../domain.js';
import * as geo from '../geo.js';
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

export function openNewTerritoryModal(onCreated, prefill = {}) {
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">New territory</p>
      <p class="sheet-sub">${
        prefill.origin
          ? 'Named from where you are standing. Change anything that looks wrong.'
          : 'A neighbourhood or route you can compare against the others.'
      }</p>
      <div class="field">
        <label>Name</label>
        <input type="text" id="t-name" placeholder="Centennial" value="${esc(prefill.name || '')}" />
      </div>
      <div class="field">
        <label>Area (optional)</label>
        <input type="text" id="t-area" placeholder="Scarborough, ON" value="${esc(prefill.area || '')}" />
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
        doors > 0 ? doors : null,
        prefill.origin || null
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
        <div class="card-row"><span class="muted">Doors per hour</span><strong>${rate ? rate.toFixed(1) : '—'}</strong></div>
        <div class="card-row"><span class="muted">Answer rate</span><strong>${domain.formatPercent(stats.knocked ? stats.answered / stats.knocked : 0)}</strong></div>
        <div class="card-row"><span class="muted">Quote value</span><strong>${domain.formatCurrency(stats.quoteValue)}</strong></div>
        <div class="card-row"><span class="muted">Revenue per door</span><strong>${domain.formatCurrency(domain.revenuePerDoor(stats.revenueBooked, stats.knocked))}</strong></div>
      </div>
      <div id="areas"></div>
      ${
        test
          ? `<div class="test-banner ${test.level}"><div><p class="test-title">${test.title}</p><p class="test-body">Last ${domain.TEST_BLOCK} doors: ${test.stats.answered} answered, ${domain.plural(test.stats.quotes, 'quote')}, ${test.stats.jobs} booked.</p></div></div>`
          : ''
      }
      <button class="btn-primary" id="s-done">Done</button>
    `;
    // Where you actually walked, derived from the doors themselves — the whole
    // point of stamping them, so none of this has to be typed at day's end.
    const areas = geo.areasCovered(doors);
    if (areas.length) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        '<p class="card-title" style="margin-bottom:8px">Where you covered</p>' +
        areas
          .map(
            (a) =>
              `<div class="card-row" style="padding:6px 0"><span>${esc(a.label)}${
                a.area ? `<span class="muted"> · ${esc(a.area)}</span>` : ''
              }</span><strong>${domain.plural(a.doors, 'door')}</strong></div>`
          )
          .join('');
      sheet.querySelector('#areas').appendChild(card);
    } else if (doors.some((d) => typeof d.lat === 'number')) {
      const note = document.createElement('p');
      note.className = 'card-sub';
      note.style.margin = '0 0 12px';
      note.textContent = 'Positions saved. Street names will fill in next time you have signal.';
      sheet.querySelector('#areas').appendChild(note);
    }

    sheet.querySelector('#s-done').addEventListener('click', close);
  });
}

// --- Job detail ------------------------------------------------------------

function detailLine(label, value) {
  return `<div class="card-row" style="padding:7px 0"><span class="muted">${label}</span><strong>${value}</strong></div>`;
}

// Free text does not belong in the right-hand column of a label/value row.
function detailNote(value) {
  return `<div style="padding:7px 0"><p class="muted" style="margin:0 0 2px">Notes</p><p style="margin:0;font-weight:600">${value}</p></div>`;
}

// tel: and a maps query both work without an API key, and open the native app
// on a phone. Nothing here needs a network round trip of our own.
function linkActions(customer) {
  const phone = customer && customer.phone ? customer.phone.replace(/[^\d+]/g, '') : '';
  const address = customer && customer.address ? customer.address : '';
  if (!phone && !address) return '';
  return `<div class="btn-row" style="margin-bottom:12px">
    ${phone ? `<a class="btn-secondary" href="tel:${phone}">Call</a>` : ''}
    ${address ? `<a class="btn-secondary" href="https://maps.apple.com/?q=${encodeURIComponent(address)}" target="_blank" rel="noopener">Navigate</a>` : ''}
  </div>`;
}

export function openJobSheet(jobId) {
  const job = state.getJobs().find((j) => j.id === jobId);
  if (!job) return;
  const customer = state.getCustomer(job.customerId);

  openSheet((sheet, close) => {
    const done = job.status === 'completed';
    sheet.innerHTML = `
      <p class="sheet-title">${esc(customer ? customer.name : 'Customer')}</p>
      <p class="sheet-sub">${esc(customer && customer.address ? customer.address : 'No address on file')}</p>
      ${linkActions(customer)}
      <div class="card">
        ${detailLine('Service', esc(job.service))}
        ${detailLine('Price', domain.formatCurrency(job.amount))}
        ${detailLine('Scheduled', job.scheduledAt ? domain.formatDateTime(job.scheduledAt) : 'Not scheduled')}
        ${done ? detailLine('Completed', domain.formatDateTime(job.completedAt)) : ''}
        ${done ? detailLine('Payment', job.paymentReceived ? esc(job.paymentMethod) : 'Not received') : ''}
        ${job.note ? detailNote(esc(job.note)) : ''}
      </div>
      <div id="job-actions"></div>
    `;

    const actions = sheet.querySelector('#job-actions');
    if (!done) {
      const complete = document.createElement('button');
      complete.className = 'btn-primary';
      complete.textContent = 'Mark complete';
      complete.addEventListener('click', () => {
        close();
        openCompleteJobSheet(job.id);
      });
      actions.appendChild(complete);
    } else if (!job.paymentReceived) {
      const pay = document.createElement('button');
      pay.className = 'btn-primary';
      pay.textContent = 'Record payment';
      pay.addEventListener('click', () => {
        close();
        openPaymentSheet(job.id);
      });
      actions.appendChild(pay);
    }
  });
}

function paymentChips(container) {
  let selected = domain.PAYMENT_METHODS[0];
  domain.PAYMENT_METHODS.forEach((method) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (method === selected ? ' active' : '');
    chip.textContent = method;
    chip.addEventListener('click', () => {
      selected = method;
      container.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
    });
    container.appendChild(chip);
  });
  return () => selected;
}

export function openCompleteJobSheet(jobId) {
  const job = state.getJobs().find((j) => j.id === jobId);
  if (!job) return;
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Job complete</p>
      <p class="sheet-sub">${domain.formatCurrency(job.amount)} &middot; ${esc(job.service)}</p>
      <div class="field">
        <label>Payment method</label>
        <div class="chip-row" id="pay-methods"></div>
      </div>
      <button class="btn-primary" id="paid">Complete &amp; mark paid</button>
      <button class="btn-secondary" id="unpaid" style="margin-top:10px">Complete — not paid yet</button>
    `;
    const getMethod = paymentChips(sheet.querySelector('#pay-methods'));
    sheet.querySelector('#paid').addEventListener('click', () => {
      state.completeJob(jobId, { paymentReceived: true, paymentMethod: getMethod() });
      close();
    });
    sheet.querySelector('#unpaid').addEventListener('click', () => {
      state.completeJob(jobId, { paymentReceived: false });
      close();
    });
  });
}

export function openPaymentSheet(jobId) {
  const job = state.getJobs().find((j) => j.id === jobId);
  if (!job) return;
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Record payment</p>
      <p class="sheet-sub">${domain.formatCurrency(job.amount)} &middot; ${esc(job.service)}</p>
      <div class="field">
        <label>Payment method</label>
        <div class="chip-row" id="pay-methods"></div>
      </div>
      <button class="btn-primary" id="save">Mark paid</button>
    `;
    const getMethod = paymentChips(sheet.querySelector('#pay-methods'));
    sheet.querySelector('#save').addEventListener('click', () => {
      state.recordPayment(jobId, getMethod());
      close();
    });
  });
}

// --- Quote detail ----------------------------------------------------------

export function openQuoteSheet(quoteId) {
  const quote = state.getQuotes().find((q) => q.id === quoteId);
  if (!quote) return;
  const customer = state.getCustomer(quote.customerId);

  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">${esc(customer ? customer.name : 'Customer')}</p>
      <p class="sheet-sub">${esc(customer && customer.address ? customer.address : 'No address on file')}</p>
      ${linkActions(customer)}
      <div class="card">
        ${detailLine('Service', esc(quote.service))}
        ${detailLine('Quoted', domain.formatCurrency(quote.amount))}
        ${detailLine('Follow up', quote.followUpDate ? domain.relativeDay(quote.followUpDate) : 'No date')}
        ${quote.note ? detailNote(esc(quote.note)) : ''}
      </div>
      <div class="field" id="won-when" hidden>
        <label>Schedule the job for</label>
        <input type="datetime-local" id="q-when" value="${nowLocalDateTime()}" />
      </div>
      <button class="btn-primary" id="accept">Mark accepted</button>
      <button class="btn-secondary" id="decline" style="margin-top:10px">Mark declined</button>
    `;

    // First tap reveals the date, second confirms — so a stray tap on
    // "accepted" can't silently put a job on the calendar.
    const when = sheet.querySelector('#won-when');
    const acceptBtn = sheet.querySelector('#accept');
    acceptBtn.addEventListener('click', () => {
      if (when.hidden) {
        when.hidden = false;
        acceptBtn.textContent = 'Book this job';
        return;
      }
      const value = sheet.querySelector('#q-when').value;
      state.acceptQuote(quoteId, value ? new Date(value).toISOString() : null);
      close();
    });
    sheet.querySelector('#decline').addEventListener('click', () => {
      if (window.confirm('Mark this quote declined? It will leave your open quotes.')) {
        state.declineQuote(quoteId);
        close();
      }
    });
  });
}

// --- Standalone quote and job ----------------------------------------------
//
// The door flows above create a customer, a record and a door in one go. These
// two are the same forms without the door, for work that comes in by phone or
// referral rather than by knocking.

export function openNewQuoteModal(onDone) {
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">New quote</p>
      <p class="sheet-sub">For a lead that didn't come from a door.</p>
      <div class="field">
        <label>Customer name</label>
        <input type="text" id="n-name" placeholder="Sarah Johnson" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Phone</label>
          <input type="tel" id="n-phone" inputmode="tel" placeholder="416 555 0199" />
        </div>
        <div class="field">
          <label>Amount</label>
          <div class="input-prefix">
            <span class="prefix-symbol">${domain.currencySymbol()}</span>
            <input type="number" id="n-amount" inputmode="decimal" placeholder="350" min="0" step="1" />
          </div>
        </div>
      </div>
      <div class="field">
        <label>Address</label>
        <input type="text" id="n-address" placeholder="123 Pinecrest Ave" />
      </div>
      <div class="field">
        <label>Service</label>
        <div class="chip-row" id="n-services"></div>
      </div>
      <div class="field">
        <label>Follow up on</label>
        <input type="date" id="n-followup" value="${todayISO()}" />
      </div>
      <div class="field">
        <label>Notes (optional)</label>
        <textarea id="n-note"></textarea>
      </div>
      <button class="btn-primary" id="n-save">Save quote</button>
    `;
    const getService = serviceChips(sheet, '#n-services');
    const nameInput = sheet.querySelector('#n-name');
    sheet.querySelector('#n-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const amount = parseFloat(sheet.querySelector('#n-amount').value);
      state.createQuoteDirect({
        name,
        phone: sheet.querySelector('#n-phone').value.trim(),
        address: sheet.querySelector('#n-address').value.trim(),
        service: getService(),
        amount: amount > 0 ? amount : 0,
        followUpDate: sheet.querySelector('#n-followup').value || null,
        note: sheet.querySelector('#n-note').value.trim(),
      });
      close();
      if (onDone) onDone();
    });
  });
}

export function openNewJobModal(onDone) {
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Add job</p>
      <p class="sheet-sub">Straight onto the schedule.</p>
      <div class="field">
        <label>Customer name</label>
        <input type="text" id="n-name" placeholder="Michael Thompson" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Phone</label>
          <input type="tel" id="n-phone" inputmode="tel" placeholder="416 555 0199" />
        </div>
        <div class="field">
          <label>Price</label>
          <div class="input-prefix">
            <span class="prefix-symbol">${domain.currencySymbol()}</span>
            <input type="number" id="n-amount" inputmode="decimal" placeholder="485" min="0" step="1" />
          </div>
        </div>
      </div>
      <div class="field">
        <label>Address</label>
        <input type="text" id="n-address" placeholder="45 Oakridge Dr" />
      </div>
      <div class="field">
        <label>Service</label>
        <div class="chip-row" id="n-services"></div>
      </div>
      <div class="field">
        <label>Scheduled for</label>
        <input type="datetime-local" id="n-when" value="${nowLocalDateTime()}" />
      </div>
      <div class="field">
        <label>Notes (optional)</label>
        <textarea id="n-note"></textarea>
      </div>
      <button class="btn-primary" id="n-save">Add job</button>
    `;
    const getService = serviceChips(sheet, '#n-services');
    const nameInput = sheet.querySelector('#n-name');
    sheet.querySelector('#n-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const amount = parseFloat(sheet.querySelector('#n-amount').value);
      const when = sheet.querySelector('#n-when').value;
      state.createJobDirect({
        name,
        phone: sheet.querySelector('#n-phone').value.trim(),
        address: sheet.querySelector('#n-address').value.trim(),
        service: getService(),
        amount: amount > 0 ? amount : 0,
        scheduledAt: when ? new Date(when).toISOString() : null,
        note: sheet.querySelector('#n-note').value.trim(),
      });
      close();
      if (onDone) onDone();
    });
  });
}

// --- Goals -----------------------------------------------------------------

function plusDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

// One form for both editing the running goal and starting the next one.
export function openGoalModal(existing, onDone) {
  const goal = existing || null;
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">${goal ? 'Edit goal' : 'New goal'}</p>
      <p class="sheet-sub">${
        goal
          ? 'Only money collected inside this window counts towards it.'
          : 'Starts fresh. Everything you have already collected stays in your all-time total.'
      }</p>
      <div class="field">
        <label>Goal amount</label>
        <div class="input-prefix">
          <span class="prefix-symbol">${domain.currencySymbol()}</span>
          <input type="number" id="gl-amount" inputmode="decimal" min="0" step="100"
            value="${goal ? goal.amount : 20000}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Starts</label>
          <input type="date" id="gl-start" value="${goal ? goal.startDate : todayISO()}" />
        </div>
        <div class="field">
          <label>Ends</label>
          <input type="date" id="gl-end" value="${goal ? goal.endDate : plusDays(90)}" />
        </div>
      </div>
      <div class="field">
        <label>Weekly target</label>
        <div class="input-prefix">
          <span class="prefix-symbol">${domain.currencySymbol()}</span>
          <input type="number" id="gl-weekly" inputmode="decimal" min="0" step="50"
            value="${goal ? goal.weeklyTarget : 2500}" />
        </div>
      </div>
      <p class="card-sub" id="gl-warn" hidden></p>
      <button class="btn-primary" id="gl-save">${goal ? 'Save goal' : 'Start this goal'}</button>
    `;

    const warn = sheet.querySelector('#gl-warn');
    sheet.querySelector('#gl-save').addEventListener('click', () => {
      const amount = parseFloat(sheet.querySelector('#gl-amount').value);
      const weekly = parseFloat(sheet.querySelector('#gl-weekly').value);
      const startDate = sheet.querySelector('#gl-start').value;
      const endDate = sheet.querySelector('#gl-end').value;
      if (!(amount > 0)) {
        warn.textContent = 'Give the goal an amount above zero.';
        warn.hidden = false;
        return;
      }
      if (!startDate || !endDate || endDate <= startDate) {
        warn.textContent = 'The end date has to come after the start date.';
        warn.hidden = false;
        return;
      }
      const fields = { amount, weeklyTarget: weekly > 0 ? weekly : 0, startDate, endDate };
      if (goal) {
        // Moving the start date has to move the counting boundary with it,
        // unless the day is unchanged (then keep the original moment).
        if (startDate !== goal.startDate) fields.startAt = `${startDate}T00:00:00.000Z`;
        state.updateGoal(goal.id, fields);
      }
      else state.createGoal(fields);
      close();
      if (onDone) onDone();
    });
  });
}

// --- Customer --------------------------------------------------------------

const CUSTOMER_STATUS = {
  lead: ['Lead', ''],
  quote_sent: ['Quoted', 'blue'],
  follow_up: ['Follow up', 'purple'],
  booked: ['Booked', 'green'],
  declined: ['Declined', 'orange'],
};

export function openCustomerSheet(customerId) {
  const customer = state.getCustomer(customerId);
  if (!customer) return;
  const summary = domain.customerSummary(state.getState(), customerId);
  const [label, tone] = CUSTOMER_STATUS[customer.status] || CUSTOMER_STATUS.lead;

  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">${esc(customer.name)}</p>
      <p class="sheet-sub">${esc(customer.address || 'No address on file')}</p>
      <span class="pill ${tone}" style="margin-bottom:14px">${label}</span>
      ${linkActions(customer)}
      <div class="card">
        ${detailLine('Collected', domain.formatCurrency(summary.collected))}
        ${summary.booked !== summary.collected ? detailLine('Booked', domain.formatCurrency(summary.booked)) : ''}
        ${customer.phone ? detailLine('Phone', esc(customer.phone)) : ''}
        ${customer.email ? detailLine('Email', esc(customer.email)) : ''}
        ${detailLine('Source', esc(customer.source || 'Other'))}
        ${detailLine('Added', domain.formatDate(customer.createdAt))}
        ${customer.note ? detailNote(esc(customer.note)) : ''}
      </div>
      <div id="cust-history"></div>
      <button class="btn-secondary" id="cust-edit">Edit customer</button>
      <button class="btn-danger" id="cust-delete" style="margin-top:10px">Delete customer</button>
    `;

    // Their history, newest first, each row opening its own sheet.
    const history = [
      ...summary.jobs.map((j) => ({ kind: 'job', at: j.completedAt || j.scheduledAt || j.createdAt, record: j })),
      ...summary.quotes.map((q) => ({ kind: 'quote', at: q.createdAt, record: q })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

    if (history.length) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<p class="card-title" style="margin-bottom:6px">History</p>';
      history.forEach(({ kind, record }) => {
        const row = document.createElement('button');
        row.className = 'agenda-row';
        const done = kind === 'job' && record.status === 'completed';
        row.innerHTML = `
          <span class="agenda-main">
            <span class="agenda-title">${esc(record.service)}</span>
            <span class="agenda-sub">${
              kind === 'job'
                ? done
                  ? `Completed ${domain.formatDate(record.completedAt)}`
                  : `Scheduled ${record.scheduledAt ? domain.formatDate(record.scheduledAt) : '—'}`
                : `Quoted ${domain.formatDate(record.createdAt)}`
            }</span>
          </span>
          <span class="row-right">
            <span class="row-amount">${domain.formatCurrency(record.amount)}</span>
            <span class="pill ${
              kind === 'job' ? (record.paymentReceived ? 'green' : 'blue') : record.status === 'open' ? 'gold' : ''
            }">${
              kind === 'job'
                ? record.paymentReceived
                  ? 'Paid'
                  : done
                  ? 'Unpaid'
                  : 'Scheduled'
                : record.status === 'open'
                ? 'Open'
                : record.status === 'accepted'
                ? 'Accepted'
                : 'Declined'
            }</span>
          </span>
        `;
        row.addEventListener('click', () => {
          close();
          if (kind === 'job') openJobSheet(record.id);
          else openQuoteSheet(record.id);
        });
        card.appendChild(row);
      });
      sheet.querySelector('#cust-history').appendChild(card);
    }

    sheet.querySelector('#cust-edit').addEventListener('click', () => {
      close();
      openEditCustomerModal(customerId);
    });

    sheet.querySelector('#cust-delete').addEventListener('click', () => {
      // Deleting a paid job quietly lowers collected revenue and can change
      // goal progress, so the confirmation names the money involved.
      const parts = [];
      if (summary.quotes.length) {
        parts.push(`${domain.plural(summary.quotes.length, 'quote')} worth ${domain.formatCurrency(summary.quoteValue)}`);
      }
      if (summary.jobs.length) {
        parts.push(`${domain.plural(summary.jobs.length, 'job')} worth ${domain.formatCurrency(summary.booked)}`);
      }
      let message = `Delete ${customer.name}?`;
      if (parts.length) message += `\n\nThis also removes ${parts.join(' and ')}.`;
      if (summary.collected) {
        message += `\n\n${domain.formatCurrency(summary.collected)} will come off your collected revenue.`;
      }
      if (summary.doors.length) {
        message += `\n\nThe ${domain.plural(summary.doors.length, 'door')} you knocked stays in your canvassing history.`;
      }
      message += '\n\nThis cannot be undone.';
      if (window.confirm(message)) {
        state.deleteCustomer(customerId);
        close();
      }
    });
  });
}

export function openEditCustomerModal(customerId) {
  const customer = state.getCustomer(customerId);
  if (!customer) return;
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Edit customer</p>
      <p class="sheet-sub">Their quotes and jobs stay attached.</p>
      <div class="field">
        <label>Name</label>
        <input type="text" id="c-name" value="${esc(customer.name)}" />
      </div>
      <div class="field">
        <label>Phone</label>
        <input type="tel" id="c-phone" inputmode="tel" value="${esc(customer.phone || '')}" placeholder="416 555 0199" />
      </div>
      <div class="field">
        <label>Email</label>
        <input type="email" id="c-email" inputmode="email" value="${esc(customer.email || '')}" placeholder="name@email.com" />
      </div>
      <div class="field">
        <label>Address</label>
        <input type="text" id="c-address" value="${esc(customer.address || '')}" placeholder="123 Pinecrest Ave" />
      </div>
      <div class="field">
        <label>Found you through</label>
        <div class="chip-row" id="c-sources"></div>
      </div>
      <div class="field">
        <label>Notes</label>
        <textarea id="c-note" placeholder="Back gate code 4417.">${esc(customer.note || '')}</textarea>
      </div>
      <button class="btn-primary" id="c-save">Save changes</button>
    `;

    // A source saved before this list existed is kept as an option rather than
    // silently reassigned.
    const options = domain.SOURCES.includes(customer.source || '')
      ? domain.SOURCES
      : [customer.source, ...domain.SOURCES].filter(Boolean);
    let selected = customer.source || 'Other';
    const row = sheet.querySelector('#c-sources');
    options.forEach((source) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (source === selected ? ' active' : '');
      chip.textContent = source;
      chip.addEventListener('click', () => {
        selected = source;
        row.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
      });
      row.appendChild(chip);
    });

    const nameInput = sheet.querySelector('#c-name');
    sheet.querySelector('#c-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      state.updateCustomer(customerId, {
        name,
        phone: sheet.querySelector('#c-phone').value.trim(),
        email: sheet.querySelector('#c-email').value.trim(),
        address: sheet.querySelector('#c-address').value.trim(),
        source: selected,
        note: sheet.querySelector('#c-note').value.trim(),
      });
      close();
    });
  });
}
