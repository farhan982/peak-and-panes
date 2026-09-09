import * as state from '../state.js';
import * as domain from '../domain.js';
import { icon } from '../icons.js';
import { buildScreen } from './header.js';
import { buildGoalChart } from './chart.js';
import { esc } from './modals.js';

export function renderGoal(root) {
  const s = state.getState();
  const settings = state.getSettings();
  const now = new Date();

  const page = buildScreen(root, {
    title: 'Goal &amp; Territories',
    subtitle: 'Track your progress and territory performance.',
  });

  page.appendChild(buildGoalCard(s, settings, now));
  page.appendChild(buildTerritoryTable(s));
  page.appendChild(buildWeeklyTarget(s, settings, now));

  const recs = domain.recommendations(s, settings, now);
  if (recs.length) page.appendChild(buildRecommendations(recs));

  page.appendChild(buildWeekOverview(s, now));
}

function buildGoalCard(s, settings, now) {
  const g = domain.goalProgress(s.jobs, settings, now);
  const card = document.createElement('div');
  card.className = 'card';
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
    <p class="pace-note ${g.aheadBy >= 0 ? 'good' : 'behind'}">${paceSentence(g)}</p>
  `;
  card.appendChild(
    buildGoalChart(domain.cumulativeSeries(s.jobs, settings, now), g.goal, g.totalDays, domain.formatCurrency)
  );
  return card;
}

function paceSentence(g) {
  if (!g.goal) return 'Set a goal in Settings to track pace.';
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

  const ranked = s.territories
    .map((t) => ({ territory: t, stats: domain.territoryStats(s, t.id) }))
    .filter((entry) => entry.stats.knocked > 0)
    .sort((a, b) => b.stats.revenuePerDoor - a.stats.revenuePerDoor);

  if (!ranked.length) {
    card.innerHTML = `
      <p class="card-title">Territory performance</p>
      <p class="card-sub">Ranked by revenue per door once you have knocked some. That
        is the number that decides where to go next, not total revenue — a big
        neighbourhood can look good simply by being big.</p>
    `;
    return card;
  }

  card.innerHTML = `
    <div class="card-row" style="margin-bottom:10px">
      <p class="card-title">Territory performance</p>
      <span class="muted" style="font-size:12px">per door</span>
    </div>
    <div class="terr-head">
      <span>#</span><span>Territory</span><span>Doors</span><span>Jobs</span><span>Rev/door</span>
    </div>
  `;
  ranked.forEach(({ territory, stats }, i) => {
    const row = document.createElement('div');
    row.className = 'terr-row';
    row.innerHTML = `
      <span class="rank-badge${i === 0 ? ' top' : ''}">${i + 1}</span>
      <span class="terr-name">${esc(territory.name)}${
        i === 0 ? '<span class="terr-tag">Top performer</span>' : ''
      }</span>
      <span>${stats.knocked}</span>
      <span>${stats.jobs}</span>
      <span class="terr-rev">${domain.formatCurrency(stats.revenuePerDoor)}</span>
    `;
    card.appendChild(row);
  });
  return card;
}

function buildWeeklyTarget(s, settings, now) {
  const weekStart = domain.startOfWeek(now);
  const collected = domain.revenueBooked(
    s.jobs.filter((j) => j.paymentReceived && domain.withinRange(j.completedAt, weekStart, now))
  );
  const target = settings.weeklyTarget || 0;
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
  const doors = s.doors.filter((d) => domain.withinRange(d.at, weekStart, now));
  const f = domain.funnel(doors);
  const collected = domain.revenueBooked(
    s.jobs.filter((j) => j.paymentReceived && domain.withinRange(j.completedAt, weekStart, now))
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
