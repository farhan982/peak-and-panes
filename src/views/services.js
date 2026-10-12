import * as state from '../state.js';
import * as domain from '../domain.js';
import { icon } from '../icons.js';
import { buildScreen } from './header.js';
import { esc } from './modals.js';

export function renderServices(root) {
  const s = state.getState();
  const page = buildScreen(root, {
    title: 'Services',
    subtitle: 'What each kind of work actually brings in.',
  });

  const rows = domain.serviceBreakdown(s);
  if (!rows.length) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="stub">
        <div class="stub-icon">${icon('briefcase', 26)}</div>
        <h2>Nothing booked yet</h2>
        <p>Once you have quoted or booked some work, this breaks it down by
          service so you can see which ones are worth pushing.</p>
      </div>
    `;
    page.appendChild(card);
    return;
  }

  const totalCompleted = rows.reduce((sum, r) => sum + r.completed, 0);
  const totalCollected = rows.reduce((sum, r) => sum + r.collected, 0);

  const summary = document.createElement('div');
  summary.className = 'card';
  summary.innerHTML = `
    <div class="card-row">
      <div>
        <p class="card-title">${domain.plural(totalCompleted, 'job')} completed</p>
        <p class="card-sub">Across ${domain.plural(rows.length, 'service')}</p>
      </div>
      <p class="goal-amount" style="font-size:26px">${domain.formatCurrency(totalCollected)}</p>
    </div>
  `;
  page.appendChild(summary);

  // Bars are scaled against the best performer, not the total — the question
  // is which service leads, and small shares stay visible that way.
  const widest = Math.max(...rows.map((r) => r.collected), 1);

  rows.forEach((row) => {
    const card = document.createElement('div');
    card.className = 'card service-card';
    card.innerHTML = `
      <div class="card-row">
        <div class="row-main">
          <p class="card-title">${esc(row.service)}</p>
          <p class="card-sub">${domain.plural(row.completed, 'job')} completed${
            row.jobs > row.completed ? ` · ${row.jobs - row.completed} on the books` : ''
          }</p>
        </div>
        <div class="row-right">
          <p class="row-amount">${domain.formatCurrency(row.collected)}</p>
          <p class="card-sub">collected</p>
        </div>
      </div>
      <div class="goal-track" style="margin-top:12px">
        <div class="goal-fill gold" style="width:${((row.collected / widest) * 100).toFixed(1)}%"></div>
      </div>
      <div class="card-row" style="margin-top:8px">
        <span class="card-sub">Average job ${domain.formatCurrency(row.average)}</span>
        <span class="card-sub">${
          row.quotes
            ? `${row.accepted} of ${domain.plural(row.quotes, 'quote')} accepted`
            : 'No quotes given'
        }</span>
      </div>
    `;
    page.appendChild(card);
  });

  const note = document.createElement('p');
  note.className = 'card-sub';
  note.style.margin = '14px 4px 0';
  note.textContent = 'All time. Collected counts money received, not work still on the books.';
  page.appendChild(note);
}
