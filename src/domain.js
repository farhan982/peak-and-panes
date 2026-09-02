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
