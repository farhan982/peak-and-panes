import * as state from '../state.js';
import * as domain from '../domain.js';
import { icon } from '../icons.js';
import { todayISO } from '../storage.js';
import { buildScreen } from './header.js';
import { esc, openJobSheet, openQuoteSheet } from './modals.js';
import { attachSearch } from './search.js';
import { setMapFilter } from './map.js';

// Filter survives the app-wide re-render, same reason as the canvassing state.
let tab = 'upcoming';

export function setJobsTab(next) {
  tab = next;
}

export function renderJobs(root) {
  const mapBtn = document.createElement('button');
  mapBtn.className = 'band-action';
  mapBtn.textContent = 'Map';
  mapBtn.addEventListener('click', () => {
    // Open the map already showing whatever this tab is showing.
    setMapFilter(tab === 'quotes' ? 'open' : tab === 'completed' ? 'completed' : 'booked');
    location.hash = '#/map';
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
    const row = document.createElement('button');
    row.className = 'row';
    row.addEventListener('click', () => openJobSheet(job.id));
    row.innerHTML = `
      <span class="status-dot${done ? ' hollow' : ''}"></span>
      <div class="row-main">
        <p class="row-title">${esc(customer ? customer.name : 'Customer')}</p>
        <p class="row-sub">${esc(customer && customer.address ? customer.address : 'No address')}</p>
        <p class="row-sub link">${esc(job.service)}</p>
      </div>
      <div class="row-right">
        <p class="row-amount">${domain.formatCurrency(job.amount)}</p>
        <span class="pill ${done ? (job.paymentReceived ? 'green' : 'orange') : 'blue'}">${
          done ? (job.paymentReceived ? 'Paid' : 'Unpaid') : 'Scheduled'
        }</span>
        <p class="row-sub">${job.scheduledAt ? domain.formatDateTime(job.scheduledAt) : 'Unscheduled'}</p>
      </div>
    `;
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
