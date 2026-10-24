import * as state from '../state.js';
import * as domain from '../domain.js';
import { icon } from '../icons.js';
import { localDay } from '../storage.js';
import { buildScreen } from './header.js';
import {
  esc,
  openNewQuoteModal,
  openNewJobModal,
  openJobSheet,
  openQuoteSheet,
  openGoalModal,
} from './modals.js';

function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function renderDashboard(root) {
  const s = state.getState();
  const settings = state.getSettings();
  const now = new Date();

  const name = (settings.userName || '').trim();
  const page = buildScreen(root, {
    title: name ? `${greeting(now)}, <span class="gold">${esc(name)}</span>` : greeting(now),
    subtitle: "Let's crush today.",
  });

  const reminder = domain.backupReminder(s, settings, now);
  if (reminder) page.appendChild(buildBackupBanner(reminder));

  page.appendChild(buildGoalCard(s, settings, now));
  page.appendChild(buildMetrics(s, now));

  const today = buildToday(s, now);
  if (today) page.appendChild(today);

  page.appendChild(buildWeekSummary(s, now));
  page.appendChild(buildFunnel(s, now));
  page.appendChild(buildQuickActions());
}

function buildGoalCard(s, settings, now) {
  const g = domain.goalProgress(s.jobs, domain.activeGoal(settings), now);
  if (!g) return buildNoGoalCard(s);
  const card = document.createElement('div');
  card.className = 'card goal-card interactive';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.innerHTML = `
    <div class="card-row">
      <p class="card-title">${g.achieved ? 'Goal reached' : g.totalDays >= 80 ? '3-Month Goal' : 'Revenue Goal'}</p>
      <p class="goal-target">${domain.formatCurrency(g.goal)}</p>
    </div>
    <div class="card-row" style="margin-top:6px">
      <p class="goal-amount">${domain.formatCurrency(g.collected)}
        <span class="goal-of">/ ${domain.formatCurrency(g.goal)}</span></p>
      <span class="goal-badge">${icon('target', 24)}</span>
    </div>
    <div class="goal-track">
      <div class="goal-fill" style="width:${Math.min(100, g.pct * 100).toFixed(1)}%"></div>
      <div class="goal-fill pending" style="width:${Math.min(
        100 - Math.min(100, g.pct * 100),
        g.outstandingPct * 100
      ).toFixed(1)}%"></div>
    </div>
    <div class="card-row goal-foot">
      <span class="link-ish${g.achieved ? ' done' : ''}">${
        g.achieved ? 'Goal reached — set the next one' : `${domain.formatPercent(g.pct)} to goal`
      }</span>
      <span class="muted">${domain.plural(g.daysLeft, 'day')} left</span>
    </div>
    ${
      g.outstanding
        ? `<p class="card-sub" style="margin-top:8px">${domain.formatCurrency(
            g.outstanding
          )} booked but not yet collected.</p>`
        : ''
    }
  `;
  const go = () => {
    location.hash = '#/goal';
  };
  card.addEventListener('click', go);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go();
    }
  });
  return card;
}

// Your records live in one browser. This is the only thing that says so.
function buildBackupBanner(reminder) {
  const banner = document.createElement('div');
  banner.className = 'reminder-banner';
  banner.innerHTML = `
    <div class="row-main">
      <p class="reminder-title">Back up your records</p>
      <p class="reminder-body">${
        reminder.neverBackedUp
          ? `You have never saved a backup. ${domain.plural(
              reminder.records,
              'record'
            )} exist only on this phone.`
          : `Last backup was ${domain.plural(reminder.daysSince, 'day')} ago.`
      }</p>
    </div>
    <button class="reminder-go" id="reminder-go">Back up</button>
    <button class="reminder-dismiss" id="reminder-dismiss" aria-label="Remind me later">&times;</button>
  `;
  banner.querySelector('#reminder-go').addEventListener('click', () => {
    location.hash = '#/settings';
  });
  banner.querySelector('#reminder-dismiss').addEventListener('click', () => {
    state.updateSettings({ backupReminderSnoozedAt: new Date().toISOString() });
  });
  return banner;
}

function buildNoGoalCard(s) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <p class="card-title">No goal running</p>
    <p class="card-sub">You have collected ${domain.formatCurrency(
      domain.lifetimeCollected(s.jobs)
    )} all time. Set a target to start tracking pace again.</p>
  `;
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.style.marginTop = '14px';
  btn.textContent = 'Set a goal';
  btn.addEventListener('click', () => openGoalModal(null));
  card.appendChild(btn);
  return card;
}

function metricCard(iconName, label, value, foot, footTone) {
  return `
    <div class="metric">
      <span class="metric-icon">${icon(iconName, 21)}</span>
      <p class="metric-label">${label}</p>
      <p class="metric-value">${value}</p>
      <p class="metric-foot ${footTone || ''}">${foot}</p>
    </div>
  `;
}

function buildMetrics(s, now) {
  const week = domain.weekSummary(s, now);
  const weekStart = domain.startOfWeek(now);
  const weekEnd = domain.endOfToday(now);
  const dayStart = domain.startOfDay(now);

  const thisWeek = week.collected;
  const change = week.change;

  const openQuotes = s.quotes.filter((q) => q.status === 'open');
  const bookedThisWeek = s.jobs.filter((j) => domain.withinRange(j.createdAt, weekStart, weekEnd));
  const bookedDone = bookedThisWeek.filter((j) => j.status === 'completed').length;
  const doorsThisWeek = s.doors.filter((d) => domain.withinRange(d.at, weekStart, weekEnd));
  const doorsToday = s.doors.filter((d) => domain.withinRange(d.at, dayStart, weekEnd));

  const grid = document.createElement('div');
  grid.className = 'metric-grid';
  grid.innerHTML =
    metricCard(
      'dollar',
      'Revenue This Week',
      domain.formatCurrency(thisWeek),
      change === null
        ? 'No figure for last week'
        : `${change >= 0 ? '↑' : '↓'} ${domain.formatPercent(Math.abs(change))} vs last week`,
      change === null ? '' : change >= 0 ? 'green' : 'red'
    ) +
    metricCard(
      'doc',
      'Open Quotes',
      String(openQuotes.length),
      (() => {
        const leads = openQuotes.filter((q) => domain.isLead(q)).length;
        const inPlay = domain.formatCurrency(openQuotes.reduce((sum, q) => sum + (q.amount || 0), 0));
        return leads ? `${inPlay} in play · ${leads} lead${leads === 1 ? '' : 's'}` : `${inPlay} in play`;
      })()
    ) +
    metricCard(
      'briefcase',
      'Jobs Booked',
      String(bookedThisWeek.length),
      bookedThisWeek.length
        ? `${bookedDone} of ${bookedThisWeek.length} done · ${domain.formatCurrency(
            domain.revenueBooked(bookedThisWeek)
          )}`
        : 'Nothing booked yet',
      bookedDone && bookedDone === bookedThisWeek.length ? 'green' : ''
    ) +
    metricCard('door', 'Doors Knocked', String(doorsThisWeek.length), `Today: ${doorsToday.length}`);
  return grid;
}

// Today is jobs on the calendar plus quotes whose follow-up has come due —
// the two things that are actually appointments.
function buildToday(s, now) {
  const dayStart = domain.startOfDay(now);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const today = localDay(now);

  const jobs = s.jobs
    .filter((j) => j.status !== 'completed' && domain.withinRange(j.scheduledAt, dayStart, dayEnd))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const followUps = s.quotes.filter(
    (q) => q.status === 'open' && q.followUpDate && q.followUpDate <= today
  );
  if (!jobs.length && !followUps.length) return null;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-row" style="margin-bottom:10px">
      <p class="card-title">Today</p>
      <span class="muted" style="font-size:13px">${new Date().toLocaleDateString('en-CA', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })}</span>
    </div>
  `;

  jobs.forEach((job) => {
    const customer = state.getCustomer(job.customerId);
    const row = document.createElement('button');
    row.className = 'agenda-row';
    row.innerHTML = `
      <span class="agenda-time">${new Date(job.scheduledAt).toLocaleTimeString('en-CA', {
        hour: 'numeric',
        minute: '2-digit',
      })}</span>
      <span class="agenda-main">
        <span class="agenda-title">${esc(customer ? customer.name : 'Job')}</span>
        <span class="agenda-sub">${esc(job.service)}</span>
      </span>
      <span class="agenda-action">View</span>
    `;
    row.addEventListener('click', () => openJobSheet(job.id));
    card.appendChild(row);
  });

  if (followUps.length) {
    const row = document.createElement('button');
    row.className = 'agenda-row';
    row.innerHTML = `
      <span class="agenda-time">Due</span>
      <span class="agenda-main">
        <span class="agenda-title">Follow up ${domain.plural(followUps.length, 'quote')}</span>
        <span class="agenda-sub">${domain.formatCurrency(
          followUps.reduce((sum, q) => sum + (q.amount || 0), 0)
        )} in play</span>
      </span>
      <span class="agenda-action">Open</span>
    `;
    row.addEventListener('click', () => {
      if (followUps.length === 1) openQuoteSheet(followUps[0].id);
      else location.hash = '#/quotes';
    });
    card.appendChild(row);
  }

  return card;
}

// The week in one card. It deliberately does NOT repeat the revenue headline
// from the tile above: the tile answers "how much", this answers "off the back
// of what". "Finished" counts work completed this week, which is not the same
// as how many of this week's bookings are done — hence the different wording.
function buildWeekSummary(s, now) {
  const w = domain.weekSummary(s, now);
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-row">
      <p class="card-title">This week</p>
      <span class="muted" style="font-size:13px">Since ${domain.formatDate(w.weekStart.toISOString())}</span>
    </div>
    <div class="week-split">
      <div><p class="week-num">${w.doors}</p><p class="week-label">Doors</p></div>
      <div><p class="week-num">${w.quotes}</p><p class="week-label">Quotes</p></div>
      <div><p class="week-num">${w.booked}</p><p class="week-label">Booked</p></div>
      <div><p class="week-num">${w.done}</p><p class="week-label">Finished</p></div>
      <div><p class="week-num gold">${domain.formatCurrency(w.collected)}</p><p class="week-label">Collected</p></div>
    </div>
    ${
      w.done || w.topTerritory || w.topService
        ? `<div class="week-notes">
            ${w.done ? `<span>Average job <strong>${domain.formatCurrency(w.averageJob)}</strong></span>` : ''}
            ${w.topTerritory ? `<span>Best territory <strong>${esc(w.topTerritory.name)}</strong></span>` : ''}
            ${w.topService ? `<span>Best service <strong>${esc(w.topService.service)}</strong></span>` : ''}
          </div>`
        : '<p class="card-sub" style="margin-top:12px">Nothing finished yet this week.</p>'
    }
  `;
  return card;
}

function buildFunnel(s, now) {
  const weekStart = domain.startOfWeek(now);
  const f = domain.funnel(s.doors.filter((d) => domain.withinRange(d.at, weekStart, domain.endOfToday(now))));

  const card = document.createElement('div');
  card.className = 'funnel-card';
  card.innerHTML = `
    <p class="funnel-title">Doors <span>&rarr;</span> Quotes <span>&rarr;</span> Jobs</p>
    <div class="funnel-row">
      <div class="funnel-step"><span class="funnel-icon">${icon('door', 18)}</span>
        <div><p class="funnel-num">${f.doors}</p><p class="funnel-label">Doors</p></div></div>
      <div class="funnel-gap">${f.doorToQuote === null ? '—' : domain.formatPercent(f.doorToQuote)}</div>
      <div class="funnel-step"><span class="funnel-icon">${icon('doc', 18)}</span>
        <div><p class="funnel-num">${f.quotes}</p><p class="funnel-label">Quotes</p></div></div>
      <div class="funnel-gap">${f.quoteToJob === null ? '—' : domain.formatPercent(f.quoteToJob)}</div>
      <div class="funnel-step"><span class="funnel-icon">${icon('briefcase', 18)}</span>
        <div><p class="funnel-num">${f.jobs}</p><p class="funnel-label">Jobs</p></div></div>
    </div>
    <p class="funnel-foot">This week &middot; conversion between each stage</p>
  `;
  return card;
}

function buildQuickActions() {
  const actions = [
    { icon: 'doc', label: 'New Quote', tone: 'solid-navy', run: () => openNewQuoteModal() },
    { icon: 'walk', label: 'Start Canvassing', tone: 'solid-blue', run: () => (location.hash = '#/canvassing') },
    { icon: 'briefcase', label: 'Add Job', tone: 'solid-gold', run: () => openNewJobModal() },
    { icon: 'people', label: 'Customers', tone: 'blue', run: () => (location.hash = '#/customers') },
  ];
  const grid = document.createElement('div');
  grid.className = 'tile-grid four';
  actions.forEach((action) => {
    const btn = document.createElement('button');
    btn.className = 'tile compact';
    btn.innerHTML = `<span class="tile-icon ${action.tone}">${icon(action.icon, 21)}</span><span>${action.label}</span>`;
    btn.addEventListener('click', action.run);
    grid.appendChild(btn);
  });
  return grid;
}
