import * as state from '../state.js';
import * as domain from '../domain.js';
import * as geo from '../geo.js';
import { nowLocalDateTime, todayISO, localDay, daysFromToday } from '../storage.js';

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

function serviceLinesField(sheet, chipSelector, priceSelector, initial, initialTotal) {
  const chipRow = sheet.querySelector(chipSelector);
  const priceBox = sheet.querySelector(priceSelector);
  let selected =
    initial && initial.length
      ? initial.map((l) => ({ service: l.service, amount: l.amount || 0 }))
      : [{ service: domain.SERVICES[0], amount: 0 }];

  // null means "no deal — they pay the subtotal". The field is left EMPTY in
  // that state with the subtotal as its placeholder, rather than pre-filled:
  // a pre-filled value had to be cleared before a lower one could be typed,
  // and clearing it put the subtotal straight back, so it fought every
  // keystroke. Nothing to clear, nothing to fight.
  let agreed = null;

  const options = [...domain.SERVICES];
  selected.forEach((l) => {
    if (!options.includes(l.service)) options.unshift(l.service);
  });

  const symbol = domain.currencySymbol();
  // A price of zero shows as an empty box, not as "0" that has to be deleted
  // before a real number can be typed. Leaving it blank still saves as zero.
  const priceInput = (id, value) =>
    `<div class="input-prefix"><span class="prefix-symbol">${symbol}</span>` +
    `<input type="number" id="${id}" inputmode="decimal" min="0" step="1" value="${
      value ? value : ''
    }" /></div>`;

  const subtotal = () => domain.linesTotal(selected);
  const payable = () => (agreed === null ? subtotal() : Math.max(0, agreed));

  // Only treat a saved total as a deal when it actually differs from what the
  // services add up to; otherwise the field stays empty.
  if (typeof initialTotal === 'number' && initialTotal !== subtotal()) agreed = initialTotal;

  function dealText() {
    if (agreed === null) return '<span class="deal-up">Leave blank to charge the full subtotal</span>';
    const gap = subtotal() - payable();
    if (!gap) return '<span class="deal-up">Same as the subtotal</span>';
    return gap > 0
      ? `<span class="deal-off">${domain.formatCurrency(gap)} off the list price</span>`
      : `<span class="deal-up">${domain.formatCurrency(-gap)} above list price</span>`;
  }

  function refreshTotals() {
    const sub = priceBox.querySelector('#sl-subtotal');
    if (sub) sub.textContent = domain.formatCurrency(subtotal());
    // The deal field is never written to programmatically — only its hint
    // moves, so typing into it is never interrupted.
    const dealInput = priceBox.querySelector('#sl-total');
    if (dealInput) dealInput.placeholder = String(subtotal() || '');
    const deal = priceBox.querySelector('#sl-deal');
    if (deal) deal.innerHTML = dealText();
  }

  function draw() {
    chipRow.innerHTML = '';
    options.forEach((name) => {
      const on = selected.some((l) => l.service === name);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (on ? ' active' : '');
      chip.textContent = name;
      chip.addEventListener('click', () => {
        const i = selected.findIndex((l) => l.service === name);
        if (i >= 0 && selected.length > 1) selected.splice(i, 1);
        else if (i < 0) selected.push({ service: name, amount: 0 });
        // A deal struck on two services means nothing once it is one, and
        // nothing for a service that has just been added.
        agreed = null;
        draw();
      });
      chipRow.appendChild(chip);
    });

    if (selected.length === 1) {
      priceBox.innerHTML = `<label>Price</label>${priceInput('sl-0', selected[0].amount)}`;
    } else {
      priceBox.innerHTML =
        '<label>Price per service</label>' +
        selected
          .map(
            (line, i) =>
              `<div class="line-row"><span class="line-name">${esc(line.service)}</span>${priceInput(
                `sl-${i}`,
                line.amount
              )}</div>`
          )
          .join('') +
        `<div class="line-row line-sub"><span class="line-name">Subtotal</span>` +
        `<strong id="sl-subtotal">${domain.formatCurrency(subtotal())}</strong></div>` +
        `<div class="line-row line-total"><span class="line-name">Bundle deal</span>` +
        `<div class="input-prefix"><span class="prefix-symbol">${symbol}</span>` +
        `<input type="number" id="sl-total" inputmode="decimal" min="0" step="1" ` +
        `placeholder="${subtotal() || ''}" value="${agreed === null ? '' : agreed}" /></div></div>` +
        `<p class="deal-note" id="sl-deal">${dealText()}</p>`;
    }

    selected.forEach((line, i) => {
      const input = priceBox.querySelector(`#sl-${i}`);
      input.addEventListener('input', () => {
        const value = parseFloat(input.value);
        line.amount = value > 0 ? value : 0;
        refreshTotals();
      });
    });

    const paysInput = priceBox.querySelector('#sl-total');
    if (paysInput) {
      paysInput.addEventListener('input', () => {
        // Empty means no deal: they pay the subtotal. A typed zero is a
        // deliberate free job and is respected.
        if (paysInput.value === '') {
          agreed = null;
        } else {
          const value = parseFloat(paysInput.value);
          agreed = isNaN(value) ? null : Math.max(0, value);
        }
        refreshTotals();
      });
    }
  }

  draw();

  return () => {
    const lines = selected.map((l) => ({ service: l.service, amount: l.amount || 0 }));
    return {
      service: domain.formatServiceSummary(lines),
      // Lines keep list prices; the total is what was actually agreed.
      amount: lines.length > 1 ? payable() : domain.linesTotal(lines),
      lines: lines.length > 1 ? lines : null,
    };
  };
}

function tomorrowISO() {
  return daysFromToday(1);
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
        <label>Service &mdash; tap more than one to price them separately</label>
        <div class="chip-row" id="q-services"></div>
      </div>
      <div class="field" id="q-prices"></div>
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
    const getServices = serviceLinesField(sheet, '#q-services', '#q-prices');
    const nameInput = sheet.querySelector('#q-name');
    sheet.querySelector('#q-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const picked = getServices();
      state.logQuoteGiven({
        sessionId,
        territoryId,
        address,
        name,
        phone: sheet.querySelector('#q-phone').value.trim(),
        service: picked.service,
        amount: picked.amount,
        lines: picked.lines,
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
      <div class="field">
        <label>Phone</label>
        <input type="tel" id="b-phone" inputmode="tel" placeholder="416 555 0199" />
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
        <label>Service &mdash; tap more than one to price them separately</label>
        <div class="chip-row" id="b-services"></div>
      </div>
      <div class="field" id="b-prices"></div>
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
    const getServices = serviceLinesField(sheet, '#b-services', '#b-prices');
    const nameInput = sheet.querySelector('#b-name');
    sheet.querySelector('#b-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const picked = getServices();
      const when = sheet.querySelector('#b-when').value;
      state.logBooked({
        sessionId,
        territoryId,
        address: sheet.querySelector('#b-address').value.trim() || address,
        name,
        phone: sheet.querySelector('#b-phone').value.trim(),
        email: sheet.querySelector('#b-email').value.trim(),
        service: picked.service,
        amount: picked.amount,
        lines: picked.lines,
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

// --- Interested ------------------------------------------------------------

export function openInterestedModal({ sessionId, territoryId, address }, onDone) {
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Interested</p>
      <p class="sheet-sub">They might call you. Give a name and it joins your open
        list, ready to book in one tap when they say yes.</p>
      <div class="field">
        <label>Name</label>
        <input type="text" id="i-name" placeholder="Homeowner at ${esc(address || 'this door')}" />
      </div>
      <div class="field">
        <label>Check back on (optional)</label>
        <input type="date" id="i-date" />
      </div>
      <div class="field">
        <label>Notes</label>
        <textarea id="i-note" placeholder="Took a card. Thinking about spring."></textarea>
      </div>
      <button class="btn-primary" id="i-save">Log interested</button>
    `;
    sheet.querySelector('#i-save').addEventListener('click', () => {
      state.logInterested({
        sessionId,
        territoryId,
        address,
        name: sheet.querySelector('#i-name').value.trim(),
        followUpDate: sheet.querySelector('#i-date').value || null,
        note: sheet.querySelector('#i-note').value.trim(),
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
        ${
          job.lines && job.lines.length > 1
            ? job.lines
                .map((l) => detailLine(`&nbsp;&nbsp;${esc(l.service)}`, domain.formatCurrency(l.amount)))
                .join('') +
              (domain.bundleDiscount(job)
                ? detailLine(
                    '&nbsp;&nbsp;Bundle deal',
                    `&minus;${domain.formatCurrency(domain.bundleDiscount(job))}`
                  )
                : '')
            : ''
        }
        ${detailLine('Price', domain.formatCurrency(job.amount))}
        ${detailLine('Scheduled', job.scheduledAt ? domain.formatDateTime(job.scheduledAt) : 'Not scheduled')}
        ${done ? detailLine('Completed', domain.formatDate(job.completedAt)) : ''}
        ${done ? detailLine('Payment', job.paymentReceived ? esc(job.paymentMethod) : 'Not received') : ''}
        ${job.note ? detailNote(esc(job.note)) : ''}
      </div>
      <div id="job-actions"></div>
    `;

    const actions = sheet.querySelector('#job-actions');
    if (!done) {
      actions.appendChild(
        button('btn-primary', 'Mark complete', () => {
          close();
          openCompleteJobSheet(job.id);
        })
      );
    } else if (!job.paymentReceived) {
      actions.appendChild(
        button('btn-primary', 'Record payment', () => {
          close();
          openPaymentSheet(job.id);
        })
      );
    }

    const secondary = document.createElement('div');
    secondary.className = 'btn-row';
    secondary.style.marginTop = '10px';
    secondary.appendChild(
      button('btn-secondary', 'Edit job', () => {
        close();
        openEditJobModal(job.id);
      })
    );
    if (done) {
      secondary.appendChild(
        button('btn-secondary', 'Reopen job', () => {
          const wording = job.paymentReceived
            ? `Put this job back on the schedule? The ${domain.formatCurrency(
                job.amount
              )} payment recorded against it is cleared, and comes off your collected revenue.`
            : 'Put this job back on the schedule?';
          if (window.confirm(wording)) {
            state.reopenJob(job.id);
            close();
          }
        })
      );
    }
    actions.appendChild(secondary);

    actions.appendChild(
      button('btn-danger', 'Delete job', () => {
        let message = `Delete this ${domain.formatCurrency(job.amount)} job for ${
          customer ? customer.name : 'this customer'
        }?`;
        if (job.paymentReceived) {
          message += `\n\n${domain.formatCurrency(job.amount)} will come off your collected revenue.`;
        }
        message += `\n\n${
          customer ? customer.name : 'The customer'
        } is kept, along with any door you logged. This cannot be undone.`;
        if (window.confirm(message)) {
          state.deleteJob(job.id);
          close();
        }
      }, { marginTop: '10px' })
    );
  });
}

function button(className, label, onClick, style = {}) {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = label;
  Object.assign(btn.style, style);
  btn.addEventListener('click', onClick);
  return btn;
}

export function openEditJobModal(jobId) {
  const job = state.getJobs().find((j) => j.id === jobId);
  if (!job) return;
  openSheet((sheet, close) => {
    const scheduled = job.scheduledAt ? toLocalInput(job.scheduledAt) : nowLocalDateTime();
    sheet.innerHTML = `
      <p class="sheet-title">Edit job</p>
      <p class="sheet-sub">${
        job.paymentReceived
          ? 'This job is paid — changing the price changes your collected revenue.'
          : 'The customer and any door logged for it stay as they are.'
      }</p>
      <div class="field">
        <label>Service &mdash; tap more than one to price them separately</label>
        <div class="chip-row" id="e-services"></div>
      </div>
      <div class="field" id="e-prices"></div>
      <div class="field">
        <label>Scheduled for</label>
        <input type="datetime-local" id="e-when" value="${scheduled}" />
      </div>
      ${
        job.status === 'completed'
          ? `<div class="field">
        <label>Date the work was done</label>
        <input type="date" id="e-done" value="${defaultCompletedDate(job)}" max="${todayISO()}" />
      </div>`
          : ''
      }
      <div class="field">
        <label>Notes</label>
        <textarea id="e-note">${esc(job.note || '')}</textarea>
      </div>
      <button class="btn-primary" id="e-save">Save changes</button>
    `;
    const getServices = serviceLinesField(sheet, '#e-services', '#e-prices', domain.serviceList(job), job.amount);
    sheet.querySelector('#e-save').addEventListener('click', () => {
      const picked = getServices();
      const when = sheet.querySelector('#e-when').value;
      const doneField = sheet.querySelector('#e-done');
      state.updateJob(jobId, {
        service: picked.service,
        amount: picked.amount,
        lines: picked.lines,
        scheduledAt: when ? new Date(when).toISOString() : null,
        ...(doneField ? { completedAt: dateToStamp(doneField.value) } : {}),
        note: sheet.querySelector('#e-note').value.trim(),
      });
      close();
    });
  });
}

// A job marked complete days later was almost certainly done when it was
// scheduled, so that is the better default than today.
function defaultCompletedDate(job) {
  const today = todayISO();
  if (job.completedAt) return localDay(job.completedAt);
  if (job.scheduledAt) {
    const day = localDay(job.scheduledAt);
    if (day <= today) return day;
  }
  return today;
}

// Stored at midday so the date cannot slip either side of a timezone boundary.
function dateToStamp(value) {
  if (!value) return new Date().toISOString();
  return new Date(`${value}T12:00:00`).toISOString();
}

// datetime-local wants local wall-clock time, not the stored UTC string.
function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

const NOT_PAID = 'Not paid yet';

function paymentChoice(container, initial) {
  let selected = initial || domain.PAYMENT_METHODS[0];
  [...domain.PAYMENT_METHODS, NOT_PAID].forEach((method) => {
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
  return () => ({
    paymentReceived: selected !== NOT_PAID,
    paymentMethod: selected === NOT_PAID ? null : selected,
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
        <label>Date the work was done</label>
        <input type="date" id="done-on" value="${defaultCompletedDate(job)}" max="${todayISO()}" />
      </div>
      <div class="field">
        <label>Payment method</label>
        <div class="chip-row" id="pay-methods"></div>
      </div>
      <button class="btn-primary" id="paid">Complete &amp; mark paid</button>
      <button class="btn-secondary" id="unpaid" style="margin-top:10px">Complete — not paid yet</button>
    `;
    const getMethod = paymentChips(sheet.querySelector('#pay-methods'));
    const doneOn = () => dateToStamp(sheet.querySelector('#done-on').value);
    sheet.querySelector('#paid').addEventListener('click', () => {
      state.completeJob(jobId, { paymentReceived: true, paymentMethod: getMethod(), completedAt: doneOn() });
      close();
    });
    sheet.querySelector('#unpaid').addEventListener('click', () => {
      state.completeJob(jobId, { paymentReceived: false, completedAt: doneOn() });
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
  const open = quote.status === 'open';
  const lead = domain.isLead(quote);
  const STATUS = { open: ['Open', 'gold'], accepted: ['Accepted', 'green'], declined: ['Declined', 'orange'] };
  const [statusLabel, statusTone] = lead ? ['Lead', 'purple'] : STATUS[quote.status] || STATUS.open;

  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">${esc(customer ? customer.name : 'Customer')}</p>
      <p class="sheet-sub">${esc(customer && customer.address ? customer.address : 'No address on file')}</p>
      <span class="pill ${statusTone}" style="margin-bottom:14px">${statusLabel}</span>
      ${linkActions(customer)}
      <div class="card">
        ${detailLine('Service', quote.service ? esc(quote.service) : 'Not priced yet')}
        ${
          quote.lines && quote.lines.length > 1
            ? quote.lines
                .map((l) => detailLine(`&nbsp;&nbsp;${esc(l.service)}`, domain.formatCurrency(l.amount)))
                .join('') +
              (domain.bundleDiscount(quote)
                ? detailLine(
                    '&nbsp;&nbsp;Bundle deal',
                    `&minus;${domain.formatCurrency(domain.bundleDiscount(quote))}`
                  )
                : '')
            : ''
        }
        ${lead ? detailLine('Quoted', 'No price given') : detailLine('Quoted', domain.formatCurrency(quote.amount))}
        ${detailLine('Follow up', quote.followUpDate ? domain.relativeDay(quote.followUpDate) : 'No date')}
        ${quote.note ? detailNote(esc(quote.note)) : ''}
      </div>
      <div class="field" id="won-when" hidden>
        <label>Schedule the job for</label>
        <input type="datetime-local" id="q-when" value="${nowLocalDateTime()}" />
      </div>
      <div id="quote-actions"></div>
    `;

    const actions = sheet.querySelector('#quote-actions');

    if (open && lead) {
      // A lead has no number on it, so "accepted" needs the price before it
      // can become a job. One sheet does both rather than forcing an edit
      // first and an accept second.
      actions.appendChild(
        button('btn-primary', 'Book this job', () => {
          close();
          openBookLeadSheet(quoteId);
        })
      );
      actions.appendChild(
        button('btn-secondary', 'Not interested after all', () => {
          if (window.confirm('Mark this lead declined? It will leave your open list.')) {
            state.declineQuote(quoteId);
            close();
          }
        }, { marginTop: '10px' })
      );
    } else if (open) {
      // First tap reveals the date, second confirms — so a stray tap on
      // "accepted" can't silently put a job on the calendar.
      const when = sheet.querySelector('#won-when');
      const acceptBtn = button('btn-primary', 'Mark accepted', () => {
        if (when.hidden) {
          when.hidden = false;
          acceptBtn.textContent = 'Book this job';
          return;
        }
        const value = sheet.querySelector('#q-when').value;
        state.acceptQuote(quoteId, value ? new Date(value).toISOString() : null);
        close();
      });
      actions.appendChild(acceptBtn);
      actions.appendChild(
        button('btn-secondary', 'Mark declined', () => {
          if (window.confirm('Mark this quote declined? It will leave your open quotes.')) {
            state.declineQuote(quoteId);
            close();
          }
        }, { marginTop: '10px' })
      );
    }

    const secondary = document.createElement('div');
    secondary.className = 'btn-row';
    secondary.style.marginTop = '10px';
    secondary.appendChild(
      button('btn-secondary', 'Edit quote', () => {
        close();
        openEditQuoteModal(quoteId);
      })
    );
    if (!open) {
      secondary.appendChild(
        button('btn-secondary', 'Reopen quote', () => {
          const wording =
            quote.status === 'accepted'
              ? 'Put this quote back in your open list? The job it created stays on your schedule — delete that separately if it is not happening.'
              : 'Put this quote back in your open list?';
          if (window.confirm(wording)) {
            state.reopenQuote(quoteId);
            close();
          }
        })
      );
    }
    actions.appendChild(secondary);

    actions.appendChild(
      button('btn-danger', 'Delete quote', () => {
        const message = `Delete this ${domain.formatCurrency(quote.amount)} quote for ${
          customer ? customer.name : 'this customer'
        }?\n\n${
          customer ? customer.name : 'The customer'
        } is kept, along with any door you logged${
          quote.status === 'accepted' ? ', and the job it created stays on your schedule' : ''
        }. This cannot be undone.`;
        if (window.confirm(message)) {
          state.deleteQuote(quoteId);
          close();
        }
      }, { marginTop: '10px' })
    );
  });
}

// Turns an interested door into a booked job without re-entering the
// customer: price it, schedule it, done.
export function openBookLeadSheet(quoteId) {
  const quote = state.getQuotes().find((q) => q.id === quoteId);
  if (!quote) return;
  const customer = state.getCustomer(quote.customerId);
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Book ${esc(customer ? customer.name : 'this job')}</p>
      <p class="sheet-sub">${esc(
        customer && customer.address ? customer.address : 'Their details carry over.'
      )}</p>
      <div class="field">
        <label>Service &mdash; tap more than one to price them separately</label>
        <div class="chip-row" id="bl-services"></div>
      </div>
      <div class="field" id="bl-prices"></div>
      <div class="field">
        <label>Scheduled for</label>
        <input type="datetime-local" id="bl-when" value="${nowLocalDateTime()}" />
      </div>
      <button class="btn-primary" id="bl-save">Book job</button>
    `;
    const getServices = serviceLinesField(
      sheet,
      '#bl-services',
      '#bl-prices',
      quote.service ? domain.serviceList(quote) : null
    );
    sheet.querySelector('#bl-save').addEventListener('click', () => {
      const picked = getServices();
      const when = sheet.querySelector('#bl-when').value;
      // Price the quote first so the job it creates carries the breakdown.
      state.updateQuote(quoteId, {
        service: picked.service,
        amount: picked.amount,
        lines: picked.lines,
      });
      state.acceptQuote(quoteId, when ? new Date(when).toISOString() : null);
      close();
    });
  });
}

export function openEditQuoteModal(quoteId) {
  const quote = state.getQuotes().find((q) => q.id === quoteId);
  if (!quote) return;
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Edit quote</p>
      <p class="sheet-sub">The customer and any door logged for it stay as they are.</p>
      <div class="field">
        <label>Service &mdash; tap more than one to price them separately</label>
        <div class="chip-row" id="eq-services"></div>
      </div>
      <div class="field" id="eq-prices"></div>
      <div class="field">
        <label>Follow up on</label>
        <input type="date" id="eq-followup" value="${quote.followUpDate || ''}" />
      </div>
      <div class="field">
        <label>Notes</label>
        <textarea id="eq-note">${esc(quote.note || '')}</textarea>
      </div>
      <button class="btn-primary" id="eq-save">Save changes</button>
    `;
    const getServices = serviceLinesField(sheet, '#eq-services', '#eq-prices', domain.serviceList(quote), quote.amount);
    sheet.querySelector('#eq-save').addEventListener('click', () => {
      const picked = getServices();
      state.updateQuote(quoteId, {
        service: picked.service,
        amount: picked.amount,
        lines: picked.lines,
        followUpDate: sheet.querySelector('#eq-followup').value || null,
        note: sheet.querySelector('#eq-note').value.trim(),
      });
      close();
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
      <div class="field">
        <label>Phone</label>
        <input type="tel" id="n-phone" inputmode="tel" placeholder="416 555 0199" />
      </div>
      <div class="field">
        <label>Address</label>
        <input type="text" id="n-address" placeholder="123 Pinecrest Ave" />
      </div>
      <div class="field">
        <label>Service &mdash; tap more than one to price them separately</label>
        <div class="chip-row" id="n-services"></div>
      </div>
      <div class="field" id="n-prices"></div>
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
    const getServices = serviceLinesField(sheet, '#n-services', '#n-prices');
    const nameInput = sheet.querySelector('#n-name');
    sheet.querySelector('#n-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const picked = getServices();
      state.createQuoteDirect({
        name,
        phone: sheet.querySelector('#n-phone').value.trim(),
        address: sheet.querySelector('#n-address').value.trim(),
        service: picked.service,
        amount: picked.amount,
        lines: picked.lines,
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
      <div class="field">
        <label>Phone</label>
        <input type="tel" id="n-phone" inputmode="tel" placeholder="416 555 0199" />
      </div>
      <div class="field">
        <label>Address</label>
        <input type="text" id="n-address" placeholder="45 Oakridge Dr" />
      </div>
      <div class="field">
        <label>Service &mdash; tap more than one to price them separately</label>
        <div class="chip-row" id="n-services"></div>
      </div>
      <div class="field" id="n-prices"></div>
      <div class="field">
        <label>When</label>
        <div class="chip-row" id="n-mode"></div>
      </div>
      <div id="n-when-box"></div>
      <div class="field">
        <label>Notes (optional)</label>
        <textarea id="n-note"></textarea>
      </div>
      <button class="btn-primary" id="n-save">Add job</button>
    `;
    const getServices = serviceLinesField(sheet, '#n-services', '#n-prices');
    const nameInput = sheet.querySelector('#n-name');

    // Work is often entered after it was done. Saying so here is the only way
    // it lands in the right week — otherwise both dates default to now and
    // last Thursday's job counts as this week's revenue.
    let mode = 'scheduled';
    let getPayment = null;
    const modeRow = sheet.querySelector('#n-mode');
    const whenBox = sheet.querySelector('#n-when-box');

    function drawMode() {
      modeRow.innerHTML = '';
      [
        ['scheduled', 'Scheduled'],
        ['done', 'Already done'],
      ].forEach(([key, label]) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip' + (mode === key ? ' active' : '');
        chip.textContent = label;
        chip.addEventListener('click', () => {
          mode = key;
          drawMode();
        });
        modeRow.appendChild(chip);
      });

      if (mode === 'scheduled') {
        getPayment = null;
        whenBox.innerHTML = `
          <div class="field">
            <label>Scheduled for</label>
            <input type="datetime-local" id="n-when" value="${nowLocalDateTime()}" />
          </div>
        `;
      } else {
        whenBox.innerHTML = `
          <div class="field">
            <label>Date the work was done</label>
            <input type="date" id="n-done" value="${todayISO()}" max="${todayISO()}" />
          </div>
          <div class="field">
            <label>Payment</label>
            <div class="chip-row" id="n-payment"></div>
          </div>
        `;
        getPayment = paymentChoice(whenBox.querySelector('#n-payment'));
      }
    }
    drawMode();

    sheet.querySelector('#n-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const picked = getServices();
      const note = sheet.querySelector('#n-note').value.trim();
      const base = {
        name,
        phone: sheet.querySelector('#n-phone').value.trim(),
        address: sheet.querySelector('#n-address').value.trim(),
        service: picked.service,
        amount: picked.amount,
        lines: picked.lines,
        note,
      };

      if (mode === 'done') {
        const stamp = dateToStamp(sheet.querySelector('#n-done').value);
        const job = state.createJobDirect({ ...base, scheduledAt: stamp });
        state.completeJob(job.id, { ...getPayment(), completedAt: stamp });
      } else {
        const when = sheet.querySelector('#n-when').value;
        state.createJobDirect({ ...base, scheduledAt: when ? new Date(when).toISOString() : null });
      }
      close();
      if (onDone) onDone();
    });
  });
}

// --- Goals -----------------------------------------------------------------

function plusDays(days) {
  return daysFromToday(days);
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

export function openCustomerSheet(customerId) {
  const customer = state.getCustomer(customerId);
  if (!customer) return;
  const summary = domain.customerSummary(state.getState(), customerId);
  const [label, tone] = domain.customerStageLabel(state.getState(), customer);

  openSheet((sheet, close) => {
    const due = domain.repeatDue(state.getState()).filter((d) => d.customer.id === customerId);
    sheet.innerHTML = `
      <p class="sheet-title">${esc(customer.name)}</p>
      <p class="sheet-sub">${esc(customer.address || 'No address on file')}</p>
      <span class="pill ${tone}" style="margin-bottom:14px">${label}</span>
      ${
        due.length
          ? `<div class="due-banner">
              <div class="row-main">
                <p class="reminder-title">Due again</p>
                <p class="reminder-body">${due
                  .map((d) => `${esc(d.service)} — ${domain.plural(d.months, 'month')} ago`)
                  .join('<br>')}</p>
              </div>
              <button class="reminder-dismiss" id="cust-snooze" aria-label="Remind me in three months">&times;</button>
            </div>`
          : ''
      }
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

    const snooze = sheet.querySelector('#cust-snooze');
    if (snooze) {
      snooze.addEventListener('click', () => {
        state.snoozeRepeat(customerId, 3);
        close();
      });
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

// --- Territory -------------------------------------------------------------

export function openTerritorySheet(territoryId) {
  const territory = state.getTerritory(territoryId);
  if (!territory) return;
  const s = state.getState();
  const stats = domain.territoryStats(s, territoryId);
  const visited = domain.lastVisited(s, territoryId);
  const sessions = s.sessions.filter((x) => x.territoryId === territoryId).length;

  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">${esc(territory.name)}</p>
      <p class="sheet-sub">${esc(territory.area || 'No area set')}</p>
      <div class="stat-card" style="margin-bottom:12px">
        <div class="stat-cell"><p class="stat-name">Doors</p><p class="stat-num">${stats.knocked}</p></div>
        <div class="stat-cell"><p class="stat-name">Answered</p><p class="stat-num">${stats.answered}</p></div>
        <div class="stat-cell"><p class="stat-name">Quotes</p><p class="stat-num">${stats.quotes}</p></div>
        <div class="stat-cell"><p class="stat-name">Booked</p><p class="stat-num">${stats.jobsBooked}</p></div>
        <div class="stat-cell highlight"><p class="stat-name">Jobs done</p><p class="stat-num">${stats.jobsCompleted}</p></div>
      </div>
      <div class="card">
        ${detailLine('Collected', domain.formatCurrency(stats.collected))}
        ${detailLine('Revenue per door', stats.knocked ? domain.formatCurrency(stats.revenuePerDoor) : '—')}
        ${detailLine('Answer rate', stats.knocked ? domain.formatPercent(stats.answered / stats.knocked) : '—')}
        ${detailLine('Quote rate', stats.knocked ? domain.formatPercent(stats.quoteRate) : '—')}
        ${detailLine(
          'Revenue per hour',
          stats.hours > 0.05 ? domain.formatCurrency(stats.revenueBooked / stats.hours) : '—'
        )}
        ${detailLine('Doors in territory', territory.doorTarget ? `${stats.knocked} of ${territory.doorTarget}` : 'Not set')}
        ${detailLine('Sessions', sessions ? domain.plural(sessions, 'session') : 'None yet')}
        ${detailLine('Last worked', visited ? domain.formatDate(visited) : 'Never')}
      </div>
      <div id="terr-actions"></div>
    `;

    const actions = sheet.querySelector('#terr-actions');
    actions.appendChild(
      button('btn-secondary', 'Edit territory', () => {
        close();
        openEditTerritoryModal(territoryId);
      })
    );
    actions.appendChild(
      button('btn-danger', 'Delete territory', () => {
        let message = `Delete ${territory.name}?`;
        if (stats.knocked) {
          const one = stats.knocked === 1;
          message += `\n\nThe ${domain.plural(stats.knocked, 'door')} you knocked there ${
            one ? 'stays' : 'stay'
          } in your history and still ${
            one ? 'counts' : 'count'
          } towards your funnel — only the territory and its ranking go.`;
        }
        message += '\n\nThis cannot be undone.';
        if (!window.confirm(message)) return;
        if (!state.deleteTerritory(territoryId)) {
          window.alert('End the session running in this territory first.');
          return;
        }
        close();
      }, { marginTop: '10px' })
    );
  });
}

export function openEditTerritoryModal(territoryId) {
  const territory = state.getTerritory(territoryId);
  if (!territory) return;
  openSheet((sheet, close) => {
    sheet.innerHTML = `
      <p class="sheet-title">Edit territory</p>
      <p class="sheet-sub">Renaming it does not touch the doors already logged there.</p>
      <div class="field">
        <label>Name</label>
        <input type="text" id="et-name" value="${esc(territory.name)}" />
      </div>
      <div class="field">
        <label>Area (optional)</label>
        <input type="text" id="et-area" value="${esc(territory.area || '')}" placeholder="Scarborough, ON" />
      </div>
      <div class="field">
        <label>Doors in this territory (optional)</label>
        <input type="number" id="et-doors" inputmode="numeric" min="1" step="1"
          value="${territory.doorTarget || ''}" placeholder="85" />
      </div>
      <button class="btn-primary" id="et-save">Save changes</button>
    `;
    const nameInput = sheet.querySelector('#et-name');
    sheet.querySelector('#et-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const doors = parseInt(sheet.querySelector('#et-doors').value, 10);
      state.updateTerritory(territoryId, {
        name,
        area: sheet.querySelector('#et-area').value.trim(),
        doorTarget: doors > 0 ? doors : null,
      });
      close();
    });
  });
}
