import * as state from '../state.js';
import * as domain from '../domain.js';
import { esc } from './modals.js';

// Filter survives the app-wide re-render, same reason as the canvassing state.
let tab = 'upcoming';

export function renderJobs(root) {
  const header = document.createElement('div');
  header.className = 'app-header';
  header.innerHTML = `
    <div class="brand">
      <div class="brand-mark">&#9650;</div>
      <div>
        <p class="page-title">Jobs</p>
        <p class="page-subtitle">Everything booked at the door lands here.</p>
      </div>
    </div>
  `;
  root.appendChild(header);

  const seg = document.createElement('div');
  seg.className = 'segmented';
  [
    ['upcoming', 'Upcoming'],
    ['completed', 'Completed'],
    ['quotes', 'Open quotes'],
  ].forEach(([key, label]) => {
    const btn = document.createElement('button');
    btn.className = tab === key ? 'active' : '';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      tab = key;
      state.refresh();
    });
    seg.appendChild(btn);
  });
  root.appendChild(seg);

  if (tab === 'quotes') {
    renderQuotes(root);
  } else {
    renderJobList(root, tab);
  }
}

function renderJobList(root, which) {
  const jobs = state
    .getJobs()
    .filter((j) => (which === 'completed' ? j.status === 'completed' : j.status !== 'completed'))
    .sort((a, b) => {
      const av = a.scheduledAt || a.createdAt;
      const bv = b.scheduledAt || b.createdAt;
      return which === 'completed' ? bv.localeCompare(av) : av.localeCompare(bv);
    });

  if (!jobs.length) {
    root.appendChild(
      emptyCard(
        which === 'completed' ? 'No completed jobs yet' : 'Nothing scheduled',
        which === 'completed'
          ? 'Jobs move here once they are marked complete.'
          : 'Tap Booked during a canvassing session and the job appears here.'
      )
    );
    return;
  }

  const total = jobs.reduce((sum, j) => sum + (j.amount || 0), 0);
  const summary = document.createElement('div');
  summary.className = 'card';
  summary.innerHTML = `
    <div class="card-row">
      <div>
        <p class="card-title">${domain.plural(jobs.length, 'job')}</p>
        <p class="card-sub">${which === 'completed' ? 'Completed' : 'Scheduled'}</p>
      </div>
      <p class="row-amount" style="color: var(--gold)">${domain.formatCurrency(total)}</p>
    </div>
  `;
  root.appendChild(summary);

  jobs.forEach((job) => {
    const customer = state.getCustomer(job.customerId);
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="row-main">
        <p class="row-title">${esc(customer ? customer.name : 'Customer')}</p>
        <p class="row-sub">${esc(job.service)}${
          customer && customer.address ? ` · ${esc(customer.address)}` : ''
        }</p>
        <p class="row-sub">${
          job.scheduledAt ? domain.formatDateTime(job.scheduledAt) : 'Not scheduled'
        }</p>
      </div>
      <div class="row-right">
        <p class="row-amount">${domain.formatCurrency(job.amount)}</p>
        <span class="pill ${job.status === 'completed' ? 'green' : 'blue'}">${
          job.status === 'completed' ? 'Done' : 'Scheduled'
        }</span>
      </div>
    `;
    root.appendChild(row);
  });
}

function renderQuotes(root) {
  const quotes = state
    .getQuotes()
    .filter((q) => q.status === 'open')
    .sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999'));

  if (!quotes.length) {
    root.appendChild(
      emptyCard('No open quotes', 'Quotes given at the door show up here with their follow-up date.')
    );
    return;
  }

  const total = quotes.reduce((sum, q) => sum + (q.amount || 0), 0);
  const summary = document.createElement('div');
  summary.className = 'card';
  summary.innerHTML = `
    <div class="card-row">
      <div>
        <p class="card-title">${domain.plural(quotes.length, 'open quote')}</p>
        <p class="card-sub">Pipeline value</p>
      </div>
      <p class="row-amount" style="color: var(--blue-bright)">${domain.formatCurrency(total)}</p>
    </div>
  `;
  root.appendChild(summary);

  quotes.forEach((quote) => {
    const customer = state.getCustomer(quote.customerId);
    const due = quote.followUpDate;
    const overdue = due && due < new Date().toISOString().slice(0, 10);
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="row-main">
        <p class="row-title">${esc(customer ? customer.name : 'Customer')}</p>
        <p class="row-sub">${esc(quote.service)}</p>
        <p class="row-sub">${
          due ? `Follow up ${domain.relativeDay(due)}` : 'No follow-up date'
        }</p>
      </div>
      <div class="row-right">
        <p class="row-amount">${domain.formatCurrency(quote.amount)}</p>
        ${overdue ? '<span class="pill orange">Overdue</span>' : '<span class="pill gold">Open</span>'}
      </div>
    `;
    root.appendChild(row);
  });
}

function emptyCard(title, body) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<p class="card-title">${title}</p><p class="card-sub">${body}</p>`;
  return card;
}
