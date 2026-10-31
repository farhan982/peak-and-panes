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
  // Alphabetical, with the # group last so the list runs in the same order as
  // the index down the side. Plain localeCompare sorts digits ahead of A.
  const customers = [...state.getCustomers()].sort((a, b) => {
    const rank = (c) => (groupLetter(c.name) === '#' ? 1 : 0);
    return (
      rank(a) - rank(b) ||
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true })
    );
  });

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
  // Letter -> { head, rows }, in the order the sorted list produces them.
  const sections = new Map();

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
    // Sorted, so each letter's names arrive together and one heading per
    // letter is enough.
    const letter = groupLetter(customer.name);
    if (!sections.has(letter)) {
      const head = document.createElement('p');
      head.className = 'letter-head';
      head.textContent = letter;
      page.appendChild(head);
      sections.set(letter, { head, rows: [] });
    }
    page.appendChild(row);
    sections.get(letter).rows.push(row);
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

  // Below this the whole list is already on screen, so the strip would only
  // take a bite out of the width and jump the page about when tapped.
  const index = customers.length >= INDEX_FROM ? buildAlphaIndex(page, sections) : null;
  if (index) {
    // The strip is fixed over the right edge of the column, so the content
    // needs a channel of its own or the stage pills end up underneath it.
    page.classList.add('alpha-gutter');
  }

  attachSearch(page, {
    placeholder: 'Search name, address or phone',
    rows: searchable,
    emptyText: 'No customer matches that.',
    tags,
    alsoHide: dueCard,
    afterApply: index ? index.sync : null,
  });
  if (index) index.sync(false);
}

const INDEX_FROM = 12;

// Names starting with anything that is not a letter — a number, a company
// sign, an accent the sort already folded away — group under #, last, the way
// a phone's contacts do.
function groupLetter(name) {
  const first = (name || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .charAt(0)
    .toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

// The strip down the right edge: tap a letter to jump, or hold and slide to
// scrub through the list, with a bubble showing where your thumb is.
function buildAlphaIndex(page, sections) {
  const nav = document.createElement('nav');
  nav.className = 'alpha-index';
  nav.setAttribute('aria-label', 'Jump to a letter');

  const buttons = new Map();
  LETTERS.forEach((letter) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'alpha-letter';
    button.textContent = letter;
    button.setAttribute('aria-label', letter === '#' ? 'Other' : letter);
    // Keyboard only. A pointer is handled on the strip as a whole so that a
    // slide keeps working after it leaves the letter it started on.
    button.addEventListener('click', (e) => {
      if (e.detail === 0) jump(letter, true);
    });
    nav.appendChild(button);
    buttons.set(letter, button);
  });

  const bubble = document.createElement('span');
  bubble.className = 'alpha-bubble';
  bubble.hidden = true;
  page.appendChild(bubble);
  page.appendChild(nav);

  // A letter nobody is filed under still goes somewhere — the next name after
  // it, or the last one before it — so no tap on the strip does nothing.
  function jump(letter, smooth) {
    const from = LETTERS.indexOf(letter);
    const live = (i) => {
      const section = sections.get(LETTERS[i]);
      return section && !section.head.hidden ? section.head : null;
    };
    let head = null;
    for (let i = from; i < LETTERS.length && !head; i += 1) head = live(i);
    for (let i = from - 1; i >= 0 && !head; i -= 1) head = live(i);
    if (!head) return;
    const y = head.getBoundingClientRect().top + window.scrollY - 10;
    window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
  }

  // Which letter is under the pointer, from the strip's own geometry rather
  // than hit-testing — the gaps between buttons would otherwise read as
  // nothing and the scrub would stutter.
  function letterAt(clientY) {
    const rect = nav.getBoundingClientRect();
    const slot = Math.floor(((clientY - rect.top) / rect.height) * LETTERS.length);
    return LETTERS[Math.min(LETTERS.length - 1, Math.max(0, slot))];
  }

  let held = null;
  function track(e) {
    const letter = letterAt(e.clientY);
    bubble.hidden = false;
    bubble.textContent = letter;
    bubble.style.top = `${e.clientY}px`;
    if (letter === held) return;
    held = letter;
    jump(letter, false);
  }

  nav.addEventListener('pointerdown', (e) => {
    // Capture, so sliding off the strip keeps scrubbing instead of dropping
    // the gesture on whatever row is underneath. Not every pointer can be
    // captured, and a throw here would lose the gesture entirely.
    try {
      nav.setPointerCapture(e.pointerId);
    } catch {
      /* scrubbing still works while the pointer stays on the strip */
    }
    e.preventDefault();
    track(e);
  });
  nav.addEventListener('pointermove', (e) => {
    if (held !== null) track(e);
  });
  const release = () => {
    held = null;
    bubble.hidden = true;
  };
  nav.addEventListener('pointerup', release);
  nav.addEventListener('pointercancel', release);

  return {
    // Searching hides rows one by one, which can empty a letter out or the
    // whole list; the headings and the strip follow along.
    sync(narrowing) {
      LETTERS.forEach((letter) => {
        const section = sections.get(letter);
        const any = section && section.rows.some((row) => !row.hidden);
        if (section) section.head.hidden = !any;
        buttons.get(letter).classList.toggle('empty', !any);
      });
      // Down to a handful of matches there is nothing to jump past.
      nav.hidden = narrowing;
      if (narrowing) release();
    },
  };
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

  const text = document.createElement('button');
  text.className = 'btn-primary';
  text.style.marginTop = '14px';
  text.textContent = 'Send season reminders';
  text.addEventListener('click', () => {
    location.hash = '#/reminders';
  });
  card.appendChild(text);
  return card;
}
