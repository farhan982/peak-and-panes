import { localDay } from './storage.js';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

// The five one-tap door outcomes. Order here is the order they appear on the
// canvassing screen, cheapest tap first.
export const OUTCOMES = [
  { key: 'no_answer', label: 'No Answer', tone: 'neutral' },
  { key: 'not_interested', label: 'Not Interested', tone: 'warn' },
  { key: 'interested', label: 'Interested', tone: 'gold' },
  { key: 'follow_up', label: 'Follow Up', tone: 'info' },
  { key: 'quote_given', label: 'Quote Given', tone: 'primary' },
  { key: 'booked', label: 'Booked', tone: 'success' },
];

export function outcomeLabel(key) {
  const found = OUTCOMES.find((o) => o.key === key);
  return found ? found.label : key;
}

// Components, not bundles. "Interior + Exterior" contained "Exterior Windows"
// and "Windows + Eaves" contained "Eaves", so picking a bundle alongside its
// own part double-counted the same work. A bundle is now built by tapping its
// parts, which also makes per-service revenue answerable.
export const SERVICES = [
  'Exterior Windows',
  'Interior Windows',
  'Eaves',
  'Painting',
  'Odd Job',
];

// A door counts as "answered" whenever somebody actually came to the door.
const ANSWERED = ['not_interested', 'interested', 'follow_up', 'quote_given', 'booked'];

export function isAnswered(door) {
  return ANSWERED.includes(door.outcome);
}

export const PAYMENT_METHODS = ['Cash', 'E-transfer', 'Credit', 'Other'];

// Where the customer came from. Knowing which of these actually produces
// revenue is the point of recording it at all.
export const SOURCES = [
  'Door knock',
  'Customer referral',
  'Repeat customer',
  'Google',
  'Facebook',
  'Instagram',
  'Flyer',
  'Business card',
  'Other',
];

export const CUSTOMER_STAGES = {
  lead: ['Lead', ''],
  interested: ['Interested', 'gold'],
  follow_up: ['Follow up', 'purple'],
  quote_sent: ['Quoted', 'blue'],
  booked: ['Booked', 'navy'],
  completed: ['Completed', 'green'],
  declined: ['Declined', 'orange'],
};

export function customerStage(s, customer) {
  const jobs = s.jobs.filter((j) => j.customerId === customer.id);
  if (jobs.some((j) => j.status === 'completed')) return 'completed';
  if (jobs.length) return 'booked';
  const quotes = s.quotes.filter((q) => q.customerId === customer.id);
  if (quotes.some((q) => q.status === 'open')) return 'quote_sent';
  if (quotes.length && quotes.every((q) => q.status === 'declined')) return 'declined';
  // Nothing recorded yet, so fall back to how they were first logged —
  // a named follow-up or an interested door has no record of its own.
  return CUSTOMER_STAGES[customer.status] ? customer.status : 'lead';
}

export function customerStageLabel(s, customer) {
  return CUSTOMER_STAGES[customerStage(s, customer)];
}

// A job or quote may be priced per service. Older records have a single
// service string and one amount, so they are presented as a single line.
export function serviceList(record) {
  if (record && Array.isArray(record.lines) && record.lines.length) {
    return record.lines.map((l) => ({ service: l.service, amount: l.amount || 0 }));
  }
  return [{ service: (record && record.service) || 'Other', amount: (record && record.amount) || 0 }];
}

export function formatServiceSummary(lines) {
  return lines.map((l) => l.service).join(' + ');
}

export function linesTotal(lines) {
  return lines.reduce((sum, l) => sum + (l.amount || 0), 0);
}

// What the services add up to before any bundle discount. The lines
// themselves always hold the standalone price, so that dropping one service
// later still leaves a real number for the other.
export function lineSubtotal(record) {
  return linesTotal(serviceList(record));
}

// Derived, never stored: the gap between what the services list at and what
// the customer is actually charged. Keeping it out of the record means the
// two can never drift apart. Negative means charged above list.
export function bundleDiscount(record) {
  if (!record || !Array.isArray(record.lines) || record.lines.length < 2) return 0;
  return lineSubtotal(record) - (record.amount || 0);
}

// The money actually charged, spread across the lines in proportion. A bundle
// discount belongs to the job as a whole, not to one of its services, so
// knocking $35 off a $485 pair takes roughly $19 off the windows and $16 off
// the eaves rather than all of it off whichever line happens to be first.
export function attributedLines(record) {
  const lines = serviceList(record);
  const subtotal = linesTotal(lines);
  const total = record && typeof record.amount === 'number' ? record.amount : subtotal;
  if (!subtotal || subtotal === total) return lines;
  const factor = total / subtotal;
  return lines.map((l) => ({ service: l.service, amount: (l.amount || 0) * factor }));
}

// Everything attached to one customer, for their detail sheet and for the
// delete confirmation — which has to be able to say what it is destroying.
export function customerSummary(s, customerId) {
  const quotes = s.quotes.filter((q) => q.customerId === customerId);
  const jobs = s.jobs.filter((j) => j.customerId === customerId);
  const doors = s.doors.filter((d) => d.customerId === customerId);
  return {
    quotes,
    jobs,
    doors,
    openQuotes: quotes.filter((q) => q.status === 'open'),
    quoteValue: quotes.reduce((sum, q) => sum + (q.amount || 0), 0),
    booked: revenueBooked(jobs),
    collected: revenueCollected(jobs),
    completed: jobs.filter((j) => j.status === 'completed').length,
  };
}

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
    interested: 0,
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
    if (d.outcome === 'interested') stats.interested += 1;
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
  // Jobs are read from the jobs themselves, not from doors marked "booked":
  // a quote accepted days later carries the territory across, and only the
  // job record knows whether the work was actually finished.
  const jobs = state.jobs.filter((j) => j.territoryId === territoryId);
  const completed = jobs.filter((j) => j.status === 'completed');
  const collected = revenueCollected(jobs);
  const ms = state.sessions
    .filter((s) => s.territoryId === territoryId && s.endedAt)
    .reduce((sum, s) => sum + elapsedMs(s), 0);
  return {
    ...stats, // stats.jobs here is doors tapped "Booked", not finished work
    jobsBooked: jobs.length,
    jobsCompleted: completed.length,
    collected,
    hours: ms / 3600000,
    revenuePerDoor: revenuePerDoor(collected, stats.knocked),
    quoteRate: stats.knocked ? stats.quotes / stats.knocked : 0,
    closeRate: stats.quotes + stats.jobs ? stats.jobs / (stats.quotes + stats.jobs) : 0,
  };
}

// Ranked on finished work rather than doors knocked: doors measure effort,
// completed jobs measure what the effort produced.
export function rankedTerritories(s) {
  return s.territories
    .map((territory) => ({ territory, stats: territoryStats(s, territory.id) }))
    .sort(
      (a, b) =>
        b.stats.jobsCompleted - a.stats.jobsCompleted ||
        b.stats.collected - a.stats.collected ||
        b.stats.knocked - a.stats.knocked
    );
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

// A bare "2026-10-23" is parsed as UTC midnight, which is the previous
// evening anywhere west of Greenwich — so a follow-up date displayed a day
// early. Anchoring date-only strings at local midday avoids it entirely.
function toLocalDate(iso) {
  if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(`${iso}T12:00:00`);
  }
  return new Date(iso);
}

export function formatDate(iso) {
  if (!iso) return '';
  return toLocalDate(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = toLocalDate(iso);
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
  const today = localDay();
  const tomorrow = localDay(new Date(Date.now() + 86400000));
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

export function endOfToday(now = new Date()) {
  const d = startOfDay(now);
  d.setDate(d.getDate() + 1);
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

// An open quote with no price on it yet: somebody interested at the door who
// has not been quoted a number.
export function isLead(quote) {
  return quote.status === 'open' && !quote.amount;
}

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
    // Once stamped, a goal stays reached: deleting a record later should not
    // rewrite the history of a target that was genuinely hit at the time.
    achieved: Boolean(goalRecord.achievedAt) || (goal > 0 && collected >= goal),
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
// Map
// ---------------------------------------------------------------------------

export const MAP_STATUSES = {
  open: ['Open quote', '#c8971d'],
  lead: ['Lead', '#6d5bd0'],
  booked: ['Booked', '#1f5fd0'],
  completed: ['Completed', '#16a34a'],
};

// Everything worth a pin, with whatever position is already known. A record
// that came from a door carries that door's fix; anything else has only an
// address, and the map geocodes those itself.
export function mapPoints(s) {
  const points = [];
  const doorFix = (field, id) => {
    const door = s.doors.find((x) => x[field] === id && typeof x.lat === 'number');
    return door ? { lat: door.lat, lng: door.lng } : null;
  };

  s.quotes.forEach((quote) => {
    if (quote.status !== 'open') return;
    const customer = s.customers.find((c) => c.id === quote.customerId);
    points.push({
      id: quote.id,
      kind: 'quote',
      status: isLead(quote) ? 'lead' : 'open',
      name: customer ? customer.name : 'Customer',
      address: customer ? customer.address : '',
      service: quote.service,
      amount: quote.amount,
      when: quote.followUpDate,
      fix: doorFix('quoteId', quote.id),
    });
  });

  s.jobs.forEach((job) => {
    const customer = s.customers.find((c) => c.id === job.customerId);
    points.push({
      id: job.id,
      kind: 'job',
      status: job.status === 'completed' ? 'completed' : 'booked',
      name: customer ? customer.name : 'Customer',
      address: customer ? customer.address : '',
      service: job.service,
      amount: job.amount,
      when: job.status === 'completed' ? job.completedAt : job.scheduledAt,
      fix: doorFix('jobId', job.id),
    });
  });

  return points;
}

// The middle of where you already work, used to bias address lookups.
export function workingCentre(s) {
  const fixes = s.doors
    .filter((d) => typeof d.lat === 'number')
    .map((d) => ({ lat: d.lat, lng: d.lng }));
  if (!fixes.length) return null;
  return {
    lat: fixes.reduce((sum, f) => sum + f.lat, 0) / fixes.length,
    lng: fixes.reduce((sum, f) => sum + f.lng, 0) / fixes.length,
  };
}

// ---------------------------------------------------------------------------
// Repeat work
// ---------------------------------------------------------------------------

// How long before a service is worth offering again. These are judgement
// calls about this business, not facts — windows twice a year, eaves before
// each autumn, painting rarely. An odd job has no natural repeat at all.
export const REPEAT_MONTHS = {
  'Exterior Windows': 6,
  'Interior Windows': 12,
  Eaves: 6, // spring and autumn
  Painting: 36,
  'Odd Job': null,
};

const DEFAULT_REPEAT_MONTHS = 12;

export function repeatInterval(service) {
  if (Object.prototype.hasOwnProperty.call(REPEAT_MONTHS, service)) return REPEAT_MONTHS[service];
  return DEFAULT_REPEAT_MONTHS;
}

export function monthsSince(iso, now = new Date()) {
  const then = toLocalDate(iso);
  let months = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  if (now.getDate() < then.getDate()) months -= 1;
  return Math.max(0, months);
}

// Work you have already done once, old enough to be worth offering again.
// Costs nothing to find — it is derived entirely from completed jobs — and a
// past customer is a far cheaper lead than a door.
export function repeatDue(s, now = new Date()) {
  const today = localDay(now);
  const last = new Map();

  s.jobs.forEach((job) => {
    if (job.status !== 'completed' || !job.completedAt || !job.customerId) return;
    serviceList(job).forEach((line) => {
      const key = `${job.customerId}::${line.service}`;
      const seen = last.get(key);
      if (!seen || job.completedAt > seen.completedAt) {
        last.set(key, { customerId: job.customerId, service: line.service, completedAt: job.completedAt });
      }
    });
  });

  const out = [];
  last.forEach((entry) => {
    const interval = repeatInterval(entry.service);
    if (!interval) return;
    const customer = s.customers.find((c) => c.id === entry.customerId);
    if (!customer) return;
    if (customer.repeatSnoozedUntil && customer.repeatSnoozedUntil > today) return;
    // Already back on the books for that service — nothing to chase.
    const openAgain = s.jobs.some(
      (j) =>
        j.customerId === customer.id &&
        j.status !== 'completed' &&
        serviceList(j).some((l) => l.service === entry.service)
    );
    if (openAgain) return;

    const months = monthsSince(entry.completedAt, now);
    if (months < interval) return;
    out.push({
      customer,
      service: entry.service,
      lastDone: entry.completedAt,
      months,
      interval,
      overdueBy: months - interval,
    });
  });

  return out.sort((a, b) => b.overdueBy - a.overdueBy || b.months - a.months);
}

// ---------------------------------------------------------------------------
// Season reminders
// ---------------------------------------------------------------------------

// Meteorological seasons, not astronomical ones: a customer saying "spring is
// here" means March, not the 20th of March. Northern hemisphere — this
// business is in Ontario.
export function season(now = new Date()) {
  const month = now.getMonth();
  if (month === 11 || month <= 1) return 'Winter';
  if (month <= 4) return 'Spring';
  if (month <= 7) return 'Summer';
  return 'Autumn';
}

// Written to be read out loud and to sound like one person texting another,
// because that is exactly what it is — it goes from your own number.
// Phrased around the season rather than the service, because the service
// names are a mix of plural and singular — "your eaves is due" and "your
// painting are due" are both wrong, and no single verb fits them all.
export const DEFAULT_REMINDER =
  'Hi {name}, Peak & Panes here. {season} is here — want me to book your {service} in again?';

export const REMINDER_FIELDS = ['{name}', '{service}', '{season}', '{me}'];

export function daysSince(iso, now = new Date()) {
  if (!iso) return null;
  const then = toLocalDate(iso);
  return Math.max(0, Math.floor((localMidnight(now) - localMidnight(then)) / 86400000));
}

function localMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// A text you are about to send under your own name, so nothing is guessed at:
// a customer with no first name on file is addressed as "there" rather than
// being greeted by an empty space.
export function reminderText(template, { name, service, me } = {}, now = new Date()) {
  const first = String(name || '').trim().split(/\s+/)[0];
  return String(template || DEFAULT_REMINDER)
    .replace(/\{name\}/g, first || 'there')
    .replace(/\{service\}/g, String(service || 'service').toLowerCase())
    .replace(/\{season\}/g, season(now))
    .replace(/\{me\}/g, String(me || '').trim())
    // A dropped {me} leaves a gap and a stranded space before punctuation.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.!?])/g, '$1')
    .trim();
}

// The phone's own Messages app, pre-filled. iOS wants the body after `&`,
// Android after `?`; `?&` is the form both have taken for years. Nothing is
// sent by the app — the draft opens and you press send.
export function smsHref(phone, body) {
  const number = String(phone || '').replace(/[^\d+]/g, '');
  if (!number) return null;
  return `sms:${number}?&body=${encodeURIComponent(body)}`;
}

// Everyone worth a season reminder: the repeat-work list, with the draft and
// whether you have already been in touch. Sorted so the people you have not
// texted yet come first — this is a list you work down in one sitting.
export function reminders(s, settings, now = new Date()) {
  const template = (settings && settings.reminderTemplate) || DEFAULT_REMINDER;
  const me = (settings && settings.userName) || '';

  return repeatDue(s, now)
    .map((entry) => {
      const body = reminderText(template, { name: entry.customer.name, service: entry.service, me }, now);
      return {
        ...entry,
        body,
        href: smsHref(entry.customer.phone, body),
        sentDaysAgo: daysSince(entry.customer.lastRemindedAt, now),
      };
    })
    .sort((a, b) => {
      // What you can act on, in the order you would work down it: people not
      // yet texted, then the ones with no number to text, then the ones
      // already done. Most overdue first inside each.
      const rank = (x) => (x.sentDaysAgo !== null ? 2 : x.href ? 0 : 1);
      return rank(a) - rank(b) || b.overdueBy - a.overdueBy || b.months - a.months;
    });
}

// ---------------------------------------------------------------------------
// Backup reminder
// ---------------------------------------------------------------------------

const BACKUP_STALE_DAYS = 30;
const SNOOZE_DAYS = 7;

// Returns something only when there is real data at risk, so a brand new
// install is never nagged.
export function backupReminder(s, settings, now = new Date()) {
  const records = s.doors.length + s.customers.length + s.quotes.length + s.jobs.length;
  if (!records) return null;

  const snoozed = settings.backupReminderSnoozedAt;
  if (snoozed && daysBetween(new Date(snoozed), now) < SNOOZE_DAYS) return null;

  if (!settings.lastBackupAt) return { neverBackedUp: true, daysSince: null, records };
  const daysSince = daysBetween(new Date(settings.lastBackupAt), now);
  if (daysSince < BACKUP_STALE_DAYS) return null;
  return { neverBackedUp: false, daysSince, records };
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

// What each service actually brings in. Quotes are folded in so a service can
// be judged on what it closes, not only on what it earns.
export function serviceBreakdown(s) {
  const map = new Map();
  const entry = (name) => {
    const key = name || 'Other';
    if (!map.has(key)) {
      map.set(key, { service: key, jobs: 0, completed: 0, collected: 0, booked: 0, quotes: 0, accepted: 0 });
    }
    return map.get(key);
  };

  // A job priced across two services counts once under each, with its money
  // split by line — that is the only way to answer "what does eaves work
  // bring in" when eaves is usually sold alongside windows.
  s.jobs.forEach((job) => {
    attributedLines(job).forEach((line) => {
      const e = entry(line.service);
      e.jobs += 1;
      e.booked += line.amount || 0;
      if (job.status === 'completed') e.completed += 1;
      if (job.paymentReceived) e.collected += line.amount || 0;
    });
  });
  s.quotes.forEach((quote) => {
    if (!quote.service) return;
    attributedLines(quote).forEach((line) => {
      const e = entry(line.service);
      e.quotes += 1;
      if (quote.status === 'accepted') e.accepted += 1;
    });
  });

  // Listed in the order the services are offered, not by how they are doing:
  // a fixed order means the same service is in the same place every time you
  // look, so the numbers can be compared at a glance between visits.
  // Retired names from older records fall in after them.
  const rank = (name) => {
    const i = SERVICES.indexOf(name);
    return i === -1 ? SERVICES.length : i;
  };
  return [...map.values()]
    .map((e) => ({
      ...e,
      average: e.jobs ? e.booked / e.jobs : 0,
      closeRate: e.quotes ? e.accepted / e.quotes : null,
    }))
    .sort((a, b) => rank(a.service) - rank(b.service) || b.collected - a.collected);
}

// The strongest service, by finished work then by money. Computed rather than
// read off the top of the list, because the list is in a fixed order.
export function leadingService(s) {
  return serviceBreakdown(s).reduce(
    (best, row) =>
      !best || row.completed > best.completed || (row.completed === best.completed && row.collected > best.collected)
        ? row
        : best,
    null
  );
}

// ---------------------------------------------------------------------------
// What the goal takes
// ---------------------------------------------------------------------------

// The most money collected in any single week so far. Used to say plainly
// whether the required pace is something already achieved or something never
// yet managed.
export function bestWeekCollected(jobs) {
  const byWeek = new Map();
  jobs
    .filter((j) => j.paymentReceived && j.completedAt)
    .forEach((j) => {
      const key = localDay(startOfWeek(toLocalDate(j.completedAt)));
      byWeek.set(key, (byWeek.get(key) || 0) + (j.amount || 0));
    });
  let best = 0;
  byWeek.forEach((value) => {
    if (value > best) best = value;
  });
  return best;
}

// Turns the money still owed on the goal into the work that would produce it,
// read back through the rates this business actually achieves. A target is
// only useful if it can be stated as doors to knock.
export function goalPlan(s, settings, now = new Date()) {
  const goal = activeGoal(settings);
  const progress = goalProgress(s.jobs, goal, now);
  if (!progress || !progress.goal || progress.achieved || progress.remaining <= 0) return null;

  // Completed work is the honest basis for an average ticket; fall back to
  // everything booked only while nothing has been finished yet.
  const completed = s.jobs.filter((j) => j.status === 'completed');
  const pool = completed.length ? completed : s.jobs;
  if (!pool.length) return null;
  const averageJob = revenueBooked(pool) / pool.length;
  if (!averageJob) return null;

  const doors = s.doors.length;
  // Rates are taken straight across rather than chained, so one uncertain
  // ratio is not multiplied by another.
  const jobsPerDoor = doors ? s.jobs.length / doors : 0;
  const quotesPerDoor = doors ? s.quotes.length / doors : 0;

  const jobsNeeded = Math.ceil(progress.remaining / averageJob);
  const doorsNeeded = jobsPerDoor ? Math.ceil(jobsNeeded / jobsPerDoor) : null;
  const quotesNeeded = doorsNeeded && quotesPerDoor ? Math.max(1, Math.round(doorsNeeded * quotesPerDoor)) : null;

  const weeksLeft = Math.max(1, progress.daysLeft / 7);
  const perWeek = (n) => (n === null ? null : Math.max(1, Math.ceil(n / weeksLeft)));

  const best = bestWeekCollected(s.jobs);
  return {
    remaining: progress.remaining,
    daysLeft: progress.daysLeft,
    requiredPerWeek: progress.requiredPerWeek,
    averageJob,
    jobsNeeded,
    quotesNeeded,
    doorsNeeded,
    jobsPerWeek: perWeek(jobsNeeded),
    quotesPerWeek: perWeek(quotesNeeded),
    doorsPerWeek: perWeek(doorsNeeded),
    bestWeek: best,
    // Worth saying out loud when the pace has never actually been hit.
    aboveBestWeek: best > 0 && progress.requiredPerWeek > best,
  };
}

// ---------------------------------------------------------------------------
// Week in review
// ---------------------------------------------------------------------------

// Revenue is bucketed by when the work was DONE, not when it was typed in.
// Marking last Tuesday's job complete today must not move this week's figure.
function collectedBetween(jobs, from, to) {
  return revenueBooked(jobs.filter((j) => j.paymentReceived && withinRange(j.completedAt, from, to)));
}

export function weekSummary(s, now = new Date()) {
  const weekStart = startOfWeek(now);
  const weekEnd = endOfToday(now);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * MS_DAY);

  const doors = s.doors.filter((d) => withinRange(d.at, weekStart, weekEnd));
  const quotes = s.quotes.filter((q) => withinRange(q.createdAt, weekStart, weekEnd));
  const booked = s.jobs.filter((j) => withinRange(j.createdAt, weekStart, weekEnd));
  const done = s.jobs.filter((j) => j.status === 'completed' && withinRange(j.completedAt, weekStart, weekEnd));

  const collected = collectedBetween(s.jobs, weekStart, weekEnd);
  const lastWeek = collectedBetween(s.jobs, lastWeekStart, weekStart);

  // Best territory and service are judged on work finished this week.
  const byTerritory = new Map();
  const byService = new Map();
  done.forEach((job) => {
    if (job.territoryId) byTerritory.set(job.territoryId, (byTerritory.get(job.territoryId) || 0) + 1);
    attributedLines(job).forEach((line) => {
      byService.set(line.service, (byService.get(line.service) || 0) + (line.amount || 0));
    });
  });
  const topTerritoryId = [...byTerritory.entries()].sort((a, b) => b[1] - a[1])[0];
  const topService = [...byService.entries()].sort((a, b) => b[1] - a[1])[0];
  const territory = topTerritoryId ? s.territories.find((t) => t.id === topTerritoryId[0]) : null;

  return {
    weekStart,
    doors: doors.length,
    quotes: quotes.length,
    booked: booked.length,
    done: done.length,
    collected,
    lastWeek,
    change: lastWeek ? (collected - lastWeek) / lastWeek : null,
    averageJob: done.length ? revenueBooked(done) / done.length : 0,
    topTerritory: territory ? { name: territory.name, jobs: topTerritoryId[1] } : null,
    topService: topService ? { service: topService[0], amount: topService[1] } : null,
  };
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
// Recommendation text is injected as HTML, so a customer name has to be safe.
function esc0(value) {
  return String(value == null ? '' : value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function recommendations(s, settings, now = new Date()) {
  const out = [];
  const today = localDay(now);

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

  const best = rankedTerritories(s).filter((entry) => entry.stats.jobsCompleted > 0)[0];
  if (best) {
    out.push({
      icon: 'walk',
      text: `${best.territory.name} finishes most — ${plural(
        best.stats.jobsCompleted,
        'job'
      )} done, ${formatCurrency(best.stats.collected)} in`,
      hash: '#/canvassing',
    });
  }

  const dueAgain = repeatDue(s, now);
  if (dueAgain.length) {
    out.push({
      icon: 'people',
      text: `${plural(dueAgain.length, 'past customer')} due for work again — ${esc0(
        dueAgain[0].customer.name
      )} first`,
      hash: '#/customers',
    });
  }

  const weekDoors = s.doors.filter((d) => withinRange(d.at, startOfWeek(now), endOfToday(now))).length;
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
