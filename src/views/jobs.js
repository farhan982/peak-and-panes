import * as state from '../state.js';
import * as domain from '../domain.js';
import { icon } from '../icons.js';
import { todayISO } from '../storage.js';
import { buildScreen } from './header.js';
import { esc, openJobSheet, openQuoteSheet, openRescheduleSheet } from './modals.js';
import { attachSearch } from './search.js';
import { setMapFilter, buildMapPanel, filterPoints } from './map.js';

// Filter survives the app-wide re-render, same reason as the canvassing state.
let tab = 'upcoming';
// The inline map is a glance, not the main event, so it can be folded away
// when you just want to work the list.
let showMap = true;

export function setJobsTab(next) {
  tab = next;
}

const TAB_FILTER = { upcoming: 'booked', completed: 'completed', quotes: 'open' };

export function renderJobs(root) {
  const mapBtn = document.createElement('button');
  mapBtn.className = 'band-action';
  mapBtn.textContent = showMap ? 'Hide map' : 'Show map';
  mapBtn.addEventListener('click', () => {
    showMap = !showMap;
    state.refresh();
  });

  const page = buildScreen(root, {
    title: 'Jobs',
    subtitle: 'Everything booked at the door lands here.',
    right: mapBtn,
    seg: [
      ['upcoming', 'Upcoming'],
      ['completed', 'Completed'],
      ['quotes', 'Open'],
    ].map(([key, label]) => ({
      label,
      active: tab === key,
      onSelect: () => {
        tab = key;
        state.refresh();
      },
    })),
  });

  // The map sits between the tabs and the list, showing exactly what the tab
  // below it is showing.
  if (showMap) {
    const points = filterPoints(domain.mapPoints(state.getState()), TAB_FILTER[tab]);
    if (points.length) {
      const full = document.createElement('button');
      full.className = 'map-full-link';
      full.textContent = 'Full map ›';
      full.addEventListener('click', () => {
        setMapFilter('all');
        location.hash = '#/map';
      });
      // Short enough that the list it belongs to is still on screen under it.
      page.appendChild(buildMapPanel(points, { height: '210px', extra: full }));
    }
  }

  if (tab === 'quotes') {
    renderQuotes(page);
  } else {
    renderJobList(page, tab);
  }
}

function renderJobList(page, which) {
  const jobs = state
    .getJobs()
    .filter((j) => (which === 'completed' ? j.status === 'completed' : j.status !== 'completed'))
    .sort((a, b) => {
      const av = a.scheduledAt || a.createdAt;
      const bv = b.scheduledAt || b.createdAt;
      return which === 'completed' ? bv.localeCompare(av) : av.localeCompare(bv);
    });

  if (!jobs.length) {
    page.appendChild(
      emptyCard(
        which === 'completed' ? 'No completed jobs yet' : 'Nothing scheduled',
        which === 'completed'
          ? 'Jobs move here once they are marked complete.'
          : 'Tap Booked during a canvassing session and the job appears here.'
      )
    );
    return;
  }

  if (which === 'completed') {
    const collected = domain.revenueCollected(jobs);
    const owed = domain.revenueBooked(jobs) - collected;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-row">
        <div>
          <p class="card-title">${domain.plural(jobs.length, 'job')} completed</p>
          <p class="card-sub">${owed ? `${domain.formatCurrency(owed)} still owed` : 'All paid'}</p>
        </div>
        <div style="text-align:right">
          <p class="row-amount" style="color: var(--green); font-size: 22px">${domain.formatCurrency(collected)}</p>
          <p class="card-sub">collected</p>
        </div>
      </div>
    `;
    page.appendChild(card);
  } else {
    page.appendChild(
      summaryCard(
        domain.plural(jobs.length, 'job'),
        'Scheduled',
        domain.revenueBooked(jobs),
        'gold'
      )
    );
  }

  const searchable = [];
  jobs.forEach((job) => {
    const customer = state.getCustomer(job.customerId);
    const done = job.status === 'completed';
    // A date that has already gone past on a job still open is worth saying
    // out loud — the row used to call it Scheduled either way.
    const late = !done && job.scheduledAt && job.scheduledAt.slice(0, 10) < todayISO();
    // A job still to do gets a reschedule button beside it, which means the
    // row can no longer be one big button — a button inside a button is not
    // something a browser will lay out.
    const row = document.createElement(done ? 'button' : 'div');
    row.className = 'row';
    const main = done ? row : document.createElement('button');
    if (done) row.addEventListener('click', () => openJobSheet(job.id));
    else {
      main.className = 'row-tap';
      main.addEventListener('click', () => openJobSheet(job.id));
    }
    main.innerHTML = `
      <span class="status-dot${done ? ' hollow' : ''}"></span>
      <div class="row-main">
        <p class="row-title">${esc(customer ? customer.name : 'Customer')}</p>
        <p class="row-sub">${esc(customer && customer.address ? customer.address : 'No address')}</p>
        <p class="row-sub link">${esc(job.service)}</p>
      </div>
      <div class="row-right">
        <p class="row-amount">${domain.formatCurrency(job.amount)}</p>
        <span class="pill ${done ? (job.paymentReceived ? 'green' : 'orange') : late ? 'orange' : 'blue'}">${
          done ? (job.paymentReceived ? 'Paid' : 'Unpaid') : late ? 'Overdue' : 'Scheduled'
        }</span>
        <p class="row-sub">${job.scheduledAt ? domain.formatWhen(job.scheduledAt) : 'Unscheduled'}</p>
      </div>
    `;
    if (!done) {
      row.appendChild(main);
      const later = document.createElement('button');
      later.className = 'row-later';
      later.textContent = 'Move';
      later.setAttribute('aria-label', 'Reschedule this job');
      later.addEventListener('click', () => openRescheduleSheet(job.id));
      row.appendChild(later);
    }
    page.appendChild(row);
    searchable.push({
      el: row,
      text: [customer && customer.name, customer && customer.address, job.service].filter(Boolean).join(' '),
    });
  });

  attachSearch(page, {
    placeholder: 'Search name, address or service',
    rows: searchable,
    emptyText: 'No job matches that.',
  });
}

function renderQuotes(page) {
  const quotes = state
    .getQuotes()
    .filter((q) => q.status === 'open')
    .sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999'));

  if (!quotes.length) {
    page.appendChild(
      emptyCard(
        'Nothing open',
        'Quotes given at the door show up here with their follow-up date, along with anyone you marked Interested.'
      )
    );
    return;
  }

  // Leads carry no price, so they are counted but kept out of the pipeline
  // figure — otherwise "in play" would quietly understate what is quoted.
  const leads = quotes.filter((q) => domain.isLead(q));
  const priced = quotes.filter((q) => !domain.isLead(q));
  page.appendChild(
    summaryCard(
      domain.plural(quotes.length, 'open item'),
      leads.length
        ? `${domain.plural(priced.length, 'quote')} · ${domain.plural(leads.length, 'lead')}`
        : 'Pipeline value',
      priced.reduce((sum, q) => sum + (q.amount || 0), 0),
      'blue'
    )
  );

  const today = todayISO();
  const searchable = [];
  quotes.forEach((quote) => {
    const customer = state.getCustomer(quote.customerId);
    const due = quote.followUpDate && quote.followUpDate <= today;
    const lead = domain.isLead(quote);
    const row = document.createElement('button');
    row.className = 'row';
    row.addEventListener('click', () => openQuoteSheet(quote.id));
    row.innerHTML = `
      <span class="status-dot${due ? '' : ' hollow'}"></span>
      <div class="row-main">
        <p class="row-title">${esc(customer ? customer.name : 'Customer')}</p>
        <p class="row-sub link">${quote.service ? esc(quote.service) : 'Interested — not priced yet'}</p>
        <p class="row-sub">${
          quote.followUpDate ? `Follow up ${domain.relativeDay(quote.followUpDate)}` : 'No follow-up date'
        }</p>
      </div>
      <div class="row-right">
        <p class="row-amount">${lead ? '—' : domain.formatCurrency(quote.amount)}</p>
        <span class="pill ${lead ? 'purple' : due ? 'orange' : 'gold'}">${
          lead ? 'Lead' : due ? 'Due' : 'Open'
        }</span>
      </div>
    `;
    page.appendChild(row);
    searchable.push({
      el: row,
      text: [customer && customer.name, customer && customer.address, quote.service, lead ? 'lead' : '']
        .filter(Boolean)
        .join(' '),
    });
  });

  attachSearch(page, {
    placeholder: 'Search name, address or service',
    rows: searchable,
    emptyText: 'Nothing matches that.',
  });
}

function summaryCard(title, sub, amount, tone) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-row">
      <div>
        <p class="card-title">${title}</p>
        <p class="card-sub">${sub}</p>
      </div>
      <p class="row-amount" style="color: var(--${tone === 'gold' ? 'gold' : 'blue'}); font-size: 22px">${domain.formatCurrency(
        amount
      )}</p>
    </div>
  `;
  return card;
}

function emptyCard(title, body) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="stub">
      <div class="stub-icon">${icon('briefcase', 26)}</div>
      <h2>${title}</h2>
      <p>${body}</p>
    </div>
  `;
  return card;
}
