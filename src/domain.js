// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

// The five one-tap door outcomes. Order here is the order they appear on the
// canvassing screen, cheapest tap first.
export const OUTCOMES = [
  { key: 'no_answer', label: 'No Answer', tone: 'neutral' },
  { key: 'not_interested', label: 'Not Interested', tone: 'warn' },
  { key: 'follow_up', label: 'Follow Up', tone: 'info' },
  { key: 'quote_given', label: 'Quote Given', tone: 'primary' },
  { key: 'booked', label: 'Booked', tone: 'success' },
];

export function outcomeLabel(key) {
  const found = OUTCOMES.find((o) => o.key === key);
  return found ? found.label : key;
}

export const SERVICES = [
  'Exterior Windows',
  'Interior + Exterior',
  'Eaves',
  'Windows + Eaves',
  'Painting',
  'Odd Job',
];

// A door counts as "answered" whenever somebody actually came to the door.
const ANSWERED = ['not_interested', 'follow_up', 'quote_given', 'booked'];

export function isAnswered(door) {
  return ANSWERED.includes(door.outcome);
}

export const PAYMENT_METHODS = ['Cash', 'E-transfer', 'Credit', 'Other'];

// Booked is what was agreed; collected is what was actually paid. The gap
// between them is the money still owed, which is the number that matters at
// the end of a week.
export function revenueBooked(jobs) {
  return jobs.reduce((sum, j) => sum + (j.amount || 0), 0);
}

export function revenueCollected(jobs) {
  return jobs.filter((j) => j.paymentReceived).reduce((sum, j) => sum + (j.amount || 0), 0);
}

export function awaitingPayment(jobs) {
  return jobs.filter((j) => j.status === 'completed' && !j.paymentReceived);
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

let currencyCode = 'CAD';
let formatter = buildFormatter(currencyCode);

function buildFormatter(code) {
  // narrowSymbol so CAD renders as "$" and not "CA$".
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: code,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function setCurrency(code) {
  if (!code || code === currencyCode) return;
  currencyCode = code;
  formatter = buildFormatter(code);
}

export function formatCurrency(amount) {
  return formatter.format(Math.round(amount || 0));
}

export function currencySymbol() {
  const part = formatter.formatToParts(0).find((p) => p.type === 'currency');
  return part ? part.value : '$';
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function activeSession(state) {
  return state.sessions.find((s) => !s.endedAt) || null;
}

export function sessionDoors(state, sessionId) {
  return state.doors.filter((d) => d.sessionId === sessionId);
}

export function elapsedMs(session, now = Date.now()) {
  const start = new Date(session.startedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now;
  return Math.max(0, end - start);
}

export function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Doors, answers, quotes, jobs and booked revenue for any list of doors. Used
// for the live session bar, the 20-door test, and territory rankings alike.
export function doorStats(doors) {
  const stats = {
    knocked: doors.length,
    answered: 0,
    quotes: 0,
    jobs: 0,
    followUps: 0,
    quoteValue: 0,
    revenueBooked: 0,
  };
  doors.forEach((d) => {
    if (isAnswered(d)) stats.answered += 1;
    if (d.outcome === 'quote_given') {
      stats.quotes += 1;
      stats.quoteValue += d.amount || 0;
    }
    if (d.outcome === 'follow_up') stats.followUps += 1;
    if (d.outcome === 'booked') {
      stats.jobs += 1;
      stats.revenueBooked += d.amount || 0;
    }
  });
  return stats;
}

export function doorsPerHour(doorCount, ms) {
  const hours = ms / 3600000;
  if (hours < 1 / 60) return 0; // under a minute in, the rate is meaningless
  return doorCount / hours;
}

export function revenuePerDoor(revenue, doors) {
  if (!doors) return 0;
  return revenue / doors;
}

// ---------------------------------------------------------------------------
// The 20-door territory test
// ---------------------------------------------------------------------------

export const TEST_BLOCK = 20;

// Verdict on the most recent completed block of 20 doors in a session.
// Returns null until a full block exists. `blockIndex` lets the UI show the
// test once per block instead of on every render.
export function territoryTest(doors) {
  const completedBlocks = Math.floor(doors.length / TEST_BLOCK);
  if (completedBlocks < 1) return null;
  const start = (completedBlocks - 1) * TEST_BLOCK;
  const block = doors.slice(start, start + TEST_BLOCK);
  const stats = doorStats(block);

  let verdict;
  if (stats.jobs >= 1 || stats.quotes >= 3) {
    verdict = { level: 'good', title: 'Good territory — keep going' };
  } else if (stats.quotes >= 1) {
    verdict = { level: 'okay', title: 'Workable — one more block to be sure' };
  } else {
    verdict = { level: 'low', title: 'Low performance — consider moving' };
  }
  return { blockIndex: completedBlocks, stats, ...verdict };
}

// ---------------------------------------------------------------------------
// Territories
// ---------------------------------------------------------------------------

export function territoryStats(state, territoryId) {
  const doors = state.doors.filter((d) => d.territoryId === territoryId);
  const stats = doorStats(doors);
  const ms = state.sessions
    .filter((s) => s.territoryId === territoryId && s.endedAt)
    .reduce((sum, s) => sum + elapsedMs(s), 0);
  return {
    ...stats,
    hours: ms / 3600000,
    revenuePerDoor: revenuePerDoor(stats.revenueBooked, stats.knocked),
    quoteRate: stats.knocked ? stats.quotes / stats.knocked : 0,
    closeRate: stats.quotes + stats.jobs ? stats.jobs / (stats.quotes + stats.jobs) : 0,
  };
}

export function lastVisited(state, territoryId) {
  const sessions = state.sessions
    .filter((s) => s.territoryId === territoryId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return sessions.length ? sessions[0].startedAt : null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// "1 door" / "2 doors" — counts appear all over this app and reading
// "1 quotes" makes the numbers look computer-generated.
export function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm || singular + 's'}`;
}

export function formatPercent(fraction) {
  return `${Math.round((fraction || 0) * 100)}%`;
}

export function relativeDay(iso) {
  if (!iso) return '';
  const day = iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (day === today) return 'Today';
  if (day === tomorrow) return 'Tomorrow';
  return formatDate(iso);
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

const MS_DAY = 86400000;

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Weeks start Monday — a canvassing week is Mon–Sun, not Sun–Sat.
export function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function withinRange(iso, from, to) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
}

export function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_DAY);
}

// ---------------------------------------------------------------------------
// Goal
// ---------------------------------------------------------------------------

export function activeGoal(settings) {
  return (settings.goals || []).find((g) => g.status === 'active') || null;
}

export function pastGoals(settings) {
  return (settings.goals || []).filter((g) => g.status !== 'active').reverse();
}

// Money is only counted towards a goal if it was collected inside that goal's
// window. Without this, starting a second goal would show it as instantly
// complete, because lifetime revenue already exceeds it.
export function jobsInGoal(jobs, goal) {
  if (!goal) return [];
  const from = goal.startAt || `${goal.startDate}T00:00:00`;
  const to = goal.closedAt || (goal.status === 'active' ? null : `${goal.endDate}T23:59:59`);
  return jobs.filter((j) => {
    if (!j.completedAt || j.completedAt < from) return false;
    return !to || j.completedAt <= to;
  });
}

export function lifetimeCollected(jobs) {
  return revenueCollected(jobs);
}

// Collected is the headline: money actually received. Booked-but-unpaid is
// tracked alongside rather than folded in, because counting work you have not
// been paid for towards a revenue goal is how people fool themselves.
export function goalProgress(allJobs, goalRecord, now = new Date()) {
  if (!goalRecord) return null;
  const jobs = jobsInGoal(allJobs, goalRecord);
  const goal = goalRecord.amount || 0;
  const collected = revenueCollected(jobs);
  const outstanding = revenueBooked(allJobs.filter((j) => !j.paymentReceived));

  const start = startOfDay(new Date(`${goalRecord.startDate}T00:00:00`));
  const end = startOfDay(new Date(`${goalRecord.endDate}T00:00:00`));
  const totalDays = Math.max(1, daysBetween(start, end));
  const elapsed = Math.min(totalDays, Math.max(0, daysBetween(start, now)));
  const daysLeft = Math.max(0, totalDays - elapsed);

  const remaining = Math.max(0, goal - collected);
  // Projecting from a single day's takings is noise, so the projection only
  // means anything once a few days have passed.
  const perDay = elapsed > 0 ? collected / elapsed : 0;
  const projected = elapsed >= 3 ? perDay * totalDays : null;
  const expected = goal * (totalDays ? elapsed / totalDays : 0);

  return {
    record: goalRecord,
    goal,
    collected,
    outstanding,
    achieved: goal > 0 && collected >= goal,
    pct: goal ? collected / goal : 0,
    outstandingPct: goal ? outstanding / goal : 0,
    remaining,
    totalDays,
    elapsed,
    daysLeft,
    projected,
    expected,
    aheadBy: collected - expected,
    requiredPerDay: daysLeft > 0 ? remaining / daysLeft : remaining,
    requiredPerWeek: daysLeft > 0 ? (remaining / daysLeft) * 7 : remaining,
  };
}

// Cumulative collected revenue, one point per day across the goal window so
// far. Used for the goal chart.
export function cumulativeSeries(allJobs, goalRecord, now = new Date()) {
  if (!goalRecord) return [];
  const jobs = jobsInGoal(allJobs, goalRecord);
  const start = startOfDay(new Date(`${goalRecord.startDate}T00:00:00`));
  const days = Math.max(0, daysBetween(start, now));
  const paid = jobs
    .filter((j) => j.paymentReceived && j.completedAt)
    .map((j) => ({ day: daysBetween(start, new Date(j.completedAt)), amount: j.amount || 0 }))
    .filter((p) => p.day >= 0);

  const series = [];
  let total = 0;
  for (let day = 0; day <= days; day++) {
    paid.filter((p) => p.day === day).forEach((p) => (total += p.amount));
    series.push({ day, total });
  }
  return series;
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export function funnel(doors) {
  const stats = doorStats(doors);
  return {
    doors: stats.knocked,
    quotes: stats.quotes,
    jobs: stats.jobs,
    doorToQuote: stats.knocked ? stats.quotes / stats.knocked : null,
    quoteToJob: stats.quotes ? stats.jobs / stats.quotes : null,
  };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

// Deliberately few, concrete, and each one derived from something the app can
// actually see. Ordered by how much money is sitting behind them.
export function recommendations(s, settings, now = new Date()) {
  const out = [];
  const today = now.toISOString().slice(0, 10);

  const unpaid = awaitingPayment(s.jobs);
  if (unpaid.length) {
    out.push({
      icon: 'dollar',
      text: `Collect ${formatCurrency(revenueBooked(unpaid))} from ${plural(unpaid.length, 'finished job')}`,
      hash: '#/jobs',
    });
  }

  const due = s.quotes.filter((q) => q.status === 'open' && q.followUpDate && q.followUpDate <= today);
  if (due.length) {
    out.push({
      icon: 'doc',
      text: `Follow up ${plural(due.length, 'open quote')} — ${formatCurrency(
        due.reduce((sum, q) => sum + (q.amount || 0), 0)
      )} in play`,
      hash: '#/quotes',
    });
  }

  const progress = goalProgress(s.jobs, activeGoal(settings), now);
  if (progress && progress.goal && progress.daysLeft > 0 && !progress.achieved && progress.aheadBy < 0) {
    out.push({
      icon: 'target',
      text: `Behind pace — ${formatCurrency(progress.requiredPerWeek)} a week gets you to the goal`,
      hash: '#/goal',
    });
  }

  const best = s.territories
    .map((t) => ({ t, stats: territoryStats(s, t.id) }))
    .filter((entry) => entry.stats.knocked >= TEST_BLOCK)
    .sort((a, b) => b.stats.revenuePerDoor - a.stats.revenuePerDoor)[0];
  if (best && best.stats.revenuePerDoor > 0) {
    out.push({
      icon: 'walk',
      text: `${best.t.name} pays best — ${formatCurrency(best.stats.revenuePerDoor)} a door`,
      hash: '#/canvassing',
    });
  }

  const weekDoors = s.doors.filter((d) => withinRange(d.at, startOfWeek(now), now)).length;
  if (weekDoors < 100) {
    out.push({
      icon: 'door',
      text: weekDoors
        ? `${weekDoors} doors this week — knock ${100 - weekDoors} more`
        : 'No doors knocked this week yet',
      hash: '#/canvassing',
    });
  }

  return out.slice(0, 4);
}
