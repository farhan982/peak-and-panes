import * as state from '../state.js';
import * as domain from '../domain.js';
import { icon } from '../icons.js';
import { buildScreen } from './header.js';
import { buildGoalChart } from './chart.js';
import { esc, openGoalModal, openTerritorySheet } from './modals.js';

export function renderGoal(root) {
  const s = state.getState();
  const settings = state.getSettings();
  const now = new Date();

  const page = buildScreen(root, {
    title: 'Goal &amp; Territories',
    subtitle: 'Track your progress and territory performance.',
  });

  page.appendChild(buildGoalCard(s, settings, now));

  const plan = domain.goalPlan(s, settings, now);
  if (plan) page.appendChild(buildPlan(plan));

  // The most actionable card on the page should not be the one furthest down
  // it, so recommendations sit directly under the goal and its plan.
  const recs = domain.recommendations(s, settings, now);
  if (recs.length) page.appendChild(buildRecommendations(recs));

  const active = domain.activeGoal(settings);
  if (active) page.appendChild(buildWeeklyTarget(s, active, now));

  page.appendChild(buildWeekOverview(s, now));
  page.appendChild(buildTerritoryTable(s));
  page.appendChild(buildServicesLink(s));
  page.appendChild(buildLifetime(s, settings));

  const past = domain.pastGoals(settings);
  if (past.length) page.appendChild(buildGoalHistory(s, past));
}

function buildGoalCard(s, settings, now) {
  const active = domain.activeGoal(settings);
  const g = domain.goalProgress(s.jobs, active, now);
  const card = document.createElement('div');
  card.className = 'card';

  if (!g) {
    card.innerHTML = `
      <p class="card-title">No goal running</p>
      <p class="card-sub">All-time collected is still counted below. Set a new target
        whenever you are ready — it starts from zero and runs on its own window.</p>
    `;
    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.style.marginTop = '14px';
    btn.textContent = 'Set a goal';
    btn.addEventListener('click', () => openGoalModal(null));
    card.appendChild(btn);
    return card;
  }
  card.innerHTML = `
    <div class="card-row">
      <p class="card-title">${domain.formatCurrency(g.goal)} goal</p>
      <span class="muted" style="font-size:13px">${domain.plural(g.daysLeft, 'day')} left</span>
    </div>
    <p class="goal-amount" style="margin-top:6px">${domain.formatCurrency(g.collected)}</p>
    <p class="card-sub">${domain.formatPercent(g.pct)} of goal &middot; collected</p>
    <div class="goal-track">
      <div class="goal-fill" style="width:${Math.min(100, g.pct * 100).toFixed(1)}%"></div>
      <div class="goal-fill pending" style="width:${Math.min(
        100 - Math.min(100, g.pct * 100),
        g.outstandingPct * 100
      ).toFixed(1)}%"></div>
    </div>
    <div class="goal-side">
      <div><p class="goal-side-label">Projected</p><p class="goal-side-value">${
        g.projected === null ? '—' : domain.formatCurrency(g.projected)
      }</p></div>
      <div><p class="goal-side-label">To go</p><p class="goal-side-value">${domain.formatCurrency(
        g.remaining
      )}</p></div>
      <div><p class="goal-side-label">Outstanding</p><p class="goal-side-value">${domain.formatCurrency(
        g.outstanding
      )}</p></div>
    </div>
    <p class="pace-note ${g.achieved || g.aheadBy >= 0 ? 'good' : 'behind'}">${paceSentence(g)}</p>
  `;
  card.appendChild(
    buildGoalChart(domain.cumulativeSeries(s.jobs, active, now), g.goal, g.totalDays, domain.formatCurrency)
  );

  if (g.achieved) {
    const next = document.createElement('button');
    next.className = 'btn-primary';
    next.style.marginTop = '14px';
    next.textContent = 'Set your next goal';
    next.addEventListener('click', () => openGoalModal(null));
    card.appendChild(next);
  }
  return card;
}

// All-time revenue sits outside any goal, so rolling from one goal to the next
// never makes the running total appear to reset.
// The goal stated as work rather than as money.
function buildPlan(plan) {
  const card = document.createElement('div');
  card.className = 'card';
  const column = (value, noun, perWeek) =>
    value === null
      ? ''
      : `<div>
          <p class="week-num">${value}</p>
          <p class="week-label">${noun}</p>
          <p class="plan-week">${perWeek} a week</p>
        </div>`;

  card.innerHTML = `
    <div class="card-row">
      <p class="card-title">What it takes</p>
      <span class="muted" style="font-size:13px">${domain.formatCurrency(plan.remaining)} to go</span>
    </div>
    <div class="plan-grid">
      ${column(plan.jobsNeeded, 'jobs', plan.jobsPerWeek)}
      ${column(plan.quotesNeeded, 'quotes', plan.quotesPerWeek)}
      ${column(plan.doorsNeeded, 'doors', plan.doorsPerWeek)}
    </div>
    <p class="card-sub" style="margin-top:12px">At your ${domain.formatCurrency(
      plan.averageJob
    )} average job and the rates you have been getting.</p>
    ${
      plan.aboveBestWeek
        ? `<p class="plan-warn">That needs ${domain.formatCurrency(
            plan.requiredPerWeek
          )} a week — more than your best week so far of ${domain.formatCurrency(plan.bestWeek)}.</p>`
        : ''
    }
  `;
  return card;
}

function buildLifetime(s, settings) {
  const collected = domain.lifetimeCollected(s.jobs);
  const done = s.jobs.filter((j) => j.paymentReceived).length;
  const goalsHit = (settings.goals || []).filter((x) => x.status === 'achieved').length;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-row">
      <div>
        <p class="card-title">All time</p>
        <p class="card-sub">${domain.plural(done, 'job')} paid${
          goalsHit ? ` &middot; ${domain.plural(goalsHit, 'goal')} hit` : ''
        }</p>
      </div>
      <p class="goal-amount" style="font-size:26px">${domain.formatCurrency(collected)}</p>
    </div>
  `;
  return card;
}

function buildGoalHistory(s, past) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<p class="card-title" style="margin-bottom:8px">Past goals</p>';
  past.forEach((goal) => {
    const progress = domain.goalProgress(s.jobs, goal);
    const hit = goal.status === 'achieved';
    const days = hit && goal.achievedAt ? domain.daysBetween(new Date(`${goal.startDate}T00:00:00`), new Date(goal.achievedAt)) : null;
    const row = document.createElement('div');
    row.className = 'past-goal';
    row.innerHTML = `
      <div class="row-main">
        <p class="row-title">${domain.formatCurrency(goal.amount)}</p>
        <p class="row-sub">${domain.formatDate(goal.startDate)} – ${domain.formatDate(
          goal.closedAt || goal.achievedAt || goal.endDate
        )}${days !== null ? ` &middot; hit in ${domain.plural(days, 'day')}` : ''}</p>
      </div>
      <div class="row-right">
        <p class="row-amount">${domain.formatCurrency(progress.collected)}</p>
        <span class="pill ${hit ? 'green' : ''}">${hit ? 'Reached' : 'Closed'}</span>
      </div>
    `;
    card.appendChild(row);
  });
  return card;
}

function paceSentence(g) {
  if (!g.goal) return 'Set a goal in Settings to track pace.';
  if (g.achieved) {
    return `Goal reached — ${domain.formatCurrency(g.collected)} collected. Set the next one.`;
  }
  if (g.daysLeft === 0) {
    return g.collected >= g.goal ? 'Goal reached.' : `Window closed ${domain.formatCurrency(g.remaining)} short.`;
  }
  if (g.elapsed < 3) return 'Too early to project a pace — keep logging.';
  if (g.aheadBy >= 0) {
    return `Ahead of pace by ${domain.formatCurrency(g.aheadBy)}. Keep to ${domain.formatCurrency(
      g.requiredPerWeek
    )} a week.`;
  }
  return `Behind pace by ${domain.formatCurrency(Math.abs(g.aheadBy))}. You need ${domain.formatCurrency(
    g.requiredPerWeek
  )} a week from here.`;
}

function buildTerritoryTable(s) {
  const card = document.createElement('div');
  card.className = 'card';

  const ranked = domain.rankedTerritories(s).filter((entry) => entry.stats.knocked > 0);

  if (!ranked.length) {
    card.innerHTML = `
      <p class="card-title">Territory performance</p>
      <p class="card-sub">Ranked by jobs actually finished once you have knocked
        some doors. Doors measure effort; completed work measures what the effort
        produced.</p>
    `;
    return card;
  }

  card.innerHTML = `
    <div class="card-row" style="margin-bottom:10px">
      <p class="card-title">Territory performance</p>
      <span class="muted" style="font-size:12px">by jobs done</span>
    </div>
    <div class="terr-head">
      <span>#</span><span>Territory</span><span>Doors</span><span>Done</span><span>Collected</span>
    </div>
  `;
  ranked.forEach(({ territory, stats }, i) => {
    const row = document.createElement('button');
    row.className = 'terr-row';
    row.addEventListener('click', () => openTerritorySheet(territory.id));
    row.innerHTML = `
      <span class="rank-badge${i === 0 ? ' top' : ''}">${i + 1}</span>
      <span class="terr-name">${esc(territory.name)}${
        i === 0 ? '<span class="terr-tag">Top performer</span>' : ''
      }</span>
      <span>${stats.knocked}</span>
      <span>${stats.jobsCompleted}</span>
      <span class="terr-rev">${domain.formatCurrency(stats.collected)}</span>
    `;
    card.appendChild(row);
  });
  return card;
}

function buildServicesLink(s) {
  const rows = domain.serviceBreakdown(s);
  const top = rows[0];
  const card = document.createElement('button');
  card.className = 'card interactive link-card';
  card.innerHTML = `
    <div class="card-row">
      <div class="row-main">
        <p class="card-title">Service performance</p>
        <p class="card-sub">${
          top && top.completed
            ? `${esc(top.service)} leads with ${domain.plural(top.completed, 'job')} done`
            : 'Jobs and revenue broken down by what the work was'
        }</p>
      </div>
      <span class="chevron">${icon('chevron', 18)}</span>
    </div>
  `;
  card.addEventListener('click', () => {
    location.hash = '#/services';
  });
  return card;
}

function buildWeeklyTarget(s, goal, now) {
  const weekStart = domain.startOfWeek(now);
  const collected = domain.revenueBooked(
    s.jobs.filter((j) => j.paymentReceived && domain.withinRange(j.completedAt, weekStart, domain.endOfToday(now)))
  );
  const target = goal.weeklyTarget || 0;
  const pct = target ? collected / target : 0;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-row">
      <div>
        <p class="card-title">Weekly target</p>
        <p class="card-sub">${domain.formatCurrency(target)} by Sunday</p>
      </div>
      <p class="goal-amount" style="font-size:26px">${domain.formatCurrency(collected)}</p>
    </div>
    <div class="goal-track" style="margin-top:12px">
      <div class="goal-fill gold" style="width:${Math.min(100, pct * 100).toFixed(1)}%"></div>
    </div>
    <div class="card-row goal-foot">
      <span class="link-ish">${domain.formatPercent(pct)}</span>
      <span class="muted">${
        collected >= target
          ? 'Target met'
          : `${domain.formatCurrency(target - collected)} to go`
      }</span>
    </div>
  `;
  return card;
}

function buildRecommendations(recs) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<p class="card-title" style="margin-bottom:8px">What to do next</p>';
  recs.forEach((rec) => {
    const row = document.createElement('button');
    row.className = 'rec-row';
    row.innerHTML = `
      <span class="rec-icon">${icon(rec.icon, 17)}</span>
      <span class="rec-text">${rec.text}</span>
      <span class="chevron">${icon('chevron', 16)}</span>
    `;
    row.addEventListener('click', () => {
      location.hash = rec.hash;
    });
    card.appendChild(row);
  });
  return card;
}

function buildWeekOverview(s, now) {
  const weekStart = domain.startOfWeek(now);
  const doors = s.doors.filter((d) => domain.withinRange(d.at, weekStart, domain.endOfToday(now)));
  const f = domain.funnel(doors);
  const collected = domain.revenueBooked(
    s.jobs.filter((j) => j.paymentReceived && domain.withinRange(j.completedAt, weekStart, domain.endOfToday(now)))
  );

  const card = document.createElement('div');
  card.className = 'funnel-card';
  card.innerHTML = `
    <p class="funnel-title">This week</p>
    <div class="week-grid">
      <div><p class="week-num">${f.doors}</p><p class="week-label">Doors</p></div>
      <div><p class="week-num">${f.quotes}</p><p class="week-label">Quotes</p></div>
      <div><p class="week-num">${f.jobs}</p><p class="week-label">Jobs</p></div>
      <div><p class="week-num">${
        f.doorToQuote === null ? '—' : domain.formatPercent(f.doorToQuote)
      }</p><p class="week-label">Conv.</p></div>
      <div><p class="week-num gold">${domain.formatCurrency(collected)}</p><p class="week-label">Collected</p></div>
    </div>
  `;
  return card;
}
