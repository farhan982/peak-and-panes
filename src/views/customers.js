import * as state from '../state.js';
import * as domain from '../domain.js';
import { icon } from '../icons.js';
import { buildScreen } from './header.js';
import { esc, openCustomerSheet } from './modals.js';
import { attachSearch } from './search.js';

export function renderCustomers(root) {
  const page = buildScreen(root, {
    title: 'Customers',
    subtitle: 'Every name taken at a door.',
  });

  const s = state.getState();
  const customers = [...state.getCustomers()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!customers.length) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="stub">
        <div class="stub-icon">${icon('people', 26)}</div>
        <h2>No customers yet</h2>
        <p>Logging a quote, a booking, or a named follow-up during a canvassing
          session creates the customer record automatically.</p>
      </div>
    `;
    page.appendChild(card);
    return;
  }

  const due = domain.repeatDue(s);
  const dueCard = due.length ? buildDueAgain(due) : null;
  if (dueCard) page.appendChild(dueCard);

  const quotes = s.quotes;
  const jobs = s.jobs;
  const searchable = [];

  customers.forEach((customer) => {
    const theirJobs = jobs.filter((j) => j.customerId === customer.id);
    const theirQuotes = quotes.filter((q) => q.customerId === customer.id);
    const value = theirJobs.reduce((sum, j) => sum + (j.amount || 0), 0);
    const stage = domain.customerStage(s, customer);
    const [label, tone] = domain.CUSTOMER_STAGES[stage];

    const parts = [];
    if (theirQuotes.length) parts.push(domain.plural(theirQuotes.length, 'quote'));
    if (theirJobs.length) parts.push(domain.plural(theirJobs.length, 'job'));

    const row = document.createElement('button');
    row.className = 'row';
    row.addEventListener('click', () => openCustomerSheet(customer.id));
    row.innerHTML = `
      <div class="row-main">
        <p class="row-title">${esc(customer.name)}</p>
        <p class="row-sub">${esc(customer.address || customer.phone || customer.source)}</p>
        <p class="row-sub link">${parts.join(' · ') || 'No quotes yet'}</p>
      </div>
      <div class="row-right">
        ${value ? `<p class="row-amount">${domain.formatCurrency(value)}</p>` : ''}
        <span class="pill ${tone}">${label}</span>
      </div>
    `;
    page.appendChild(row);
    searchable.push({
      el: row,
      tag: stage,
      text: [customer.name, customer.address, customer.phone, customer.email, label]
        .filter(Boolean)
        .join(' '),
    });
  });

  // Only the stages actually in use, in the order a customer moves through
  // them, so the row is short and reads like a pipeline.
  const counts = searchable.reduce((acc, r) => ({ ...acc, [r.tag]: (acc[r.tag] || 0) + 1 }), {});
  const tags = [{ key: 'all', label: 'All', count: searchable.length }].concat(
    Object.keys(domain.CUSTOMER_STAGES)
      .filter((key) => counts[key])
      .map((key) => ({ key, label: domain.CUSTOMER_STAGES[key][0], count: counts[key] }))
  );

  attachSearch(page, {
    placeholder: 'Search name, address or phone',
    rows: searchable,
    emptyText: 'No customer matches that.',
    tags,
    alsoHide: dueCard,
  });
}

// Past customers whose work is old enough to be worth offering again. This is
// the cheapest lead the business has: they have already paid you once.
function buildDueAgain(due) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-row" style="margin-bottom:4px">
      <p class="card-title">Due again</p>
      <span class="pill gold">${due.length}</span>
    </div>
    <p class="card-sub">Work you have done before, old enough to offer again.</p>
  `;
  due.slice(0, 6).forEach((entry) => {
    const row = document.createElement('button');
    row.className = 'agenda-row';
    row.innerHTML = `
      <span class="agenda-main">
        <span class="agenda-title">${esc(entry.customer.name)}</span>
        <span class="agenda-sub">${esc(entry.service)} · ${domain.plural(entry.months, 'month')} ago</span>
      </span>
      <span class="agenda-action">Open</span>
    `;
    row.addEventListener('click', () => openCustomerSheet(entry.customer.id));
    card.appendChild(row);
  });
  if (due.length > 6) {
    const more = document.createElement('p');
    more.className = 'card-sub';
    more.style.marginTop = '10px';
    more.textContent = `and ${due.length - 6} more.`;
    card.appendChild(more);
  }
  return card;
}
