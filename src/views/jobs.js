import * as state from '../state.js';
import * as domain from '../domain.js';
import { icon } from '../icons.js';
import { buildScreen } from './header.js';
import { esc } from './modals.js';

// Filter survives the app-wide re-render, same reason as the canvassing state.
let tab = 'upcoming';

export function setJobsTab(next) {
  tab = next;
}

export function renderJobs(root) {
  const page = buildScreen(root, {
    title: 'Jobs',
    subtitle: 'Everything booked at the door lands here.',
    seg: [
      ['upcoming', 'Upcoming'],
      ['completed', 'Completed'],
      ['quotes', 'Open quotes'],
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

  page.appendChild(
    summaryCard(
      domain.plural(jobs.length, 'job'),
      which === 'completed' ? 'Completed' : 'Scheduled',
      jobs.reduce((sum, j) => sum + (j.amount || 0), 0),
      'gold'
    )
  );

  jobs.forEach((job) => {
    const customer = state.getCustomer(job.customerId);
    const done = job.status === 'completed';
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span class="status-dot${done ? ' hollow' : ''}"></span>
      <div class="row-main">
        <p class="row-title">${esc(customer ? customer.name : 'Customer')}</p>
        <p class="row-sub">${esc(customer && customer.address ? customer.address : 'No address')}</p>
        <p class="row-sub link">${esc(job.service)}</p>
      </div>
      <div class="row-right">
        <p class="row-amount">${domain.formatCurrency(job.amount)}</p>
        <span class="pill ${done ? 'green' : 'blue'}">${done ? 'Completed' : 'Scheduled'}</span>
        <p class="row-sub">${job.scheduledAt ? domain.formatDateTime(job.scheduledAt) : 'Unscheduled'}</p>
      </div>
    `;
    page.appendChild(row);
  });
}

function renderQuotes(page) {
  const quotes = state
    .getQuotes()
    .filter((q) => q.status === 'open')
    .sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999'));

  if (!quotes.length) {
    page.appendChild(
      emptyCard('No open quotes', 'Quotes given at the door show up here with their follow-up date.')
    );
    return;
  }

  page.appendChild(
    summaryCard(
      domain.plural(quotes.length, 'open quote'),
      'Pipeline value',
      quotes.reduce((sum, q) => sum + (q.amount || 0), 0),
      'blue'
    )
  );

  const today = new Date().toISOString().slice(0, 10);
  quotes.forEach((quote) => {
    const customer = state.getCustomer(quote.customerId);
    const due = quote.followUpDate && quote.followUpDate <= today;
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span class="status-dot${due ? '' : ' hollow'}"></span>
      <div class="row-main">
        <p class="row-title">${esc(customer ? customer.name : 'Customer')}</p>
        <p class="row-sub link">${esc(quote.service)}</p>
        <p class="row-sub">${
          quote.followUpDate ? `Follow up ${domain.relativeDay(quote.followUpDate)}` : 'No follow-up date'
        }</p>
      </div>
      <div class="row-right">
        <p class="row-amount">${domain.formatCurrency(quote.amount)}</p>
        <span class="pill ${due ? 'orange' : 'gold'}">${due ? 'Due' : 'Open'}</span>
      </div>
    `;
    page.appendChild(row);
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
