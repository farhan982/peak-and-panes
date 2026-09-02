import * as state from '../state.js';
import * as domain from '../domain.js';
import { esc } from './modals.js';

const STATUS_LABELS = {
  lead: ['Lead', ''],
  quote_sent: ['Quote sent', 'blue'],
  follow_up: ['Follow up', 'purple'],
  booked: ['Booked', 'green'],
};

export function renderCustomers(root) {
  const header = document.createElement('div');
  header.className = 'app-header';
  header.innerHTML = `
    <div class="brand">
      <div class="brand-mark">&#9650;</div>
      <div>
        <p class="page-title">Customers</p>
        <p class="page-subtitle">Every name taken at a door.</p>
      </div>
    </div>
  `;
  root.appendChild(header);

  const customers = [...state.getCustomers()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!customers.length) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <p class="card-title">No customers yet</p>
      <p class="card-sub">Logging a quote, a booking, or a named follow-up during a
        canvassing session creates the customer record automatically.</p>
    `;
    root.appendChild(card);
    return;
  }

  const quotes = state.getQuotes();
  const jobs = state.getJobs();

  customers.forEach((customer) => {
    const theirJobs = jobs.filter((j) => j.customerId === customer.id);
    const theirQuotes = quotes.filter((q) => q.customerId === customer.id);
    const value = theirJobs.reduce((sum, j) => sum + (j.amount || 0), 0);
    const [label, tone] = STATUS_LABELS[customer.status] || ['Lead', ''];

    const parts = [];
    if (theirQuotes.length) parts.push(domain.plural(theirQuotes.length, 'quote'));
    if (theirJobs.length) parts.push(domain.plural(theirJobs.length, 'job'));

    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="row-main">
        <p class="row-title">${esc(customer.name)}</p>
        <p class="row-sub">${esc(customer.address || customer.phone || customer.source)}</p>
        <p class="row-sub">${parts.join(' · ') || 'No quotes yet'}</p>
      </div>
      <div class="row-right">
        ${value ? `<p class="row-amount">${domain.formatCurrency(value)}</p>` : ''}
        <span class="pill ${tone}">${label}</span>
      </div>
    `;
    root.appendChild(row);
  });
}
