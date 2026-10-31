import { normaliseAddress, normaliseStreet } from './geo.js';

const KEY = 'peak-panes-state-v1';
const SETTINGS_KEY = 'peak-panes-settings-v1';

const COLLECTIONS = ['territories', 'sessions', 'doors', 'customers', 'quotes', 'jobs'];

// Always a fresh object with fresh arrays. Spreading a shared constant here
// handed out the same arrays every time, so records logged after a reset were
// pushed into the constant itself and came back on the next reset.
function emptyCollections() {
  return COLLECTIONS.reduce((out, key) => ({ ...out, [key]: [] }), {});
}

// Every collection is a flat top-level array keyed by id. Doors point at a
// session and a territory; quotes and jobs point at a customer. Nothing is
// nested, so a record can be found without walking the tree.
export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyCollections();
    const parsed = JSON.parse(raw);
    // Merge over the empty shape so a state written by an older build that
    // lacked a collection still loads instead of throwing on .filter().
    const next = emptyCollections();
    COLLECTIONS.forEach((k) => {
      if (Array.isArray(parsed[k])) next[k] = parsed[k];
    });
    return mergeDuplicateTerritories(
      mergeDuplicateCustomers(migrateInterestedLeads(migrateVocabulary(next)))
    );
  } catch {
    return emptyCollections();
  }
}

// Quotes were once "won"/"lost". The stored values were renamed to the terms
// an estimate actually uses, so older records are translated on load.
// Duplicates already in the data, from before the door flows looked for an
// existing record. The earliest copy survives, everything points at it, and
// nothing is thrown away: blank fields are filled from the duplicates and a
// differing name is kept as a note rather than dropped.
function mergeDuplicateCustomers(state) {
  const byAddress = new Map();
  const merged = [];

  state.customers.forEach((customer) => {
    const key = normaliseAddress(customer.address);
    if (!key) return; // nothing safe to match on
    const keeper = byAddress.get(key);
    if (!keeper) {
      byAddress.set(key, customer);
      return;
    }
    ['phone', 'email', 'territoryId', 'source'].forEach((field) => {
      if (!keeper[field] && customer[field]) keeper[field] = customer[field];
    });
    if (customer.note && !String(keeper.note || '').includes(customer.note)) {
      keeper.note = [keeper.note, customer.note].filter(Boolean).join(' · ');
    }
    const a = String(customer.name || '').trim();
    const b = String(keeper.name || '').trim();
    if (a && a.toLowerCase() !== b.toLowerCase() && !String(keeper.note || '').includes(a)) {
      keeper.note = [keeper.note, `Also given as ${a}`].filter(Boolean).join(' · ');
    }
    if (keeper.createdAt && customer.createdAt && customer.createdAt < keeper.createdAt) {
      keeper.createdAt = customer.createdAt;
    }
    merged.push([customer.id, keeper.id]);
  });

  if (!merged.length) return state;

  const remap = new Map(merged);
  const gone = new Set(remap.keys());
  ['quotes', 'jobs', 'doors'].forEach((collection) => {
    state[collection].forEach((record) => {
      if (record.customerId && remap.has(record.customerId)) {
        record.customerId = remap.get(record.customerId);
      }
    });
  });
  state.customers = state.customers.filter((c) => !gone.has(c.id));
  return state;
}

function mergeDuplicateTerritories(state) {
  const byName = new Map();
  const remap = new Map();

  state.territories.forEach((territory) => {
    const key = normaliseStreet(territory.name);
    if (!key) return;
    const keeper = byName.get(key);
    if (!keeper) {
      byName.set(key, territory);
      return;
    }
    if (!keeper.area && territory.area) keeper.area = territory.area;
    if (!keeper.doorTarget && territory.doorTarget) keeper.doorTarget = territory.doorTarget;
    if (!keeper.origin && territory.origin) keeper.origin = territory.origin;
    remap.set(territory.id, keeper.id);
  });

  if (!remap.size) return state;

  const gone = new Set(remap.keys());
  ['doors', 'sessions', 'quotes', 'jobs', 'customers'].forEach((collection) => {
    state[collection].forEach((record) => {
      if (record.territoryId && remap.has(record.territoryId)) {
        record.territoryId = remap.get(record.territoryId);
      }
    });
  });
  // Session names are denormalised, so point them at the surviving name.
  state.sessions.forEach((session) => {
    const territory = state.territories.find((t) => t.id === session.territoryId);
    if (territory) session.territoryName = territory.name;
  });
  state.territories = state.territories.filter((t) => !gone.has(t.id));
  return state;
}

// Interested doors used to create only a customer, leaving nothing to follow
// up or convert. Give each one the pipeline entry it would get today. This is
// not inventing data — the interest was recorded, it just had nowhere to live.
function migrateInterestedLeads(state) {
  state.doors.forEach((door) => {
    if (door.outcome !== 'interested' || !door.customerId || door.quoteId) return;
    const already = state.quotes.some((q) => q.customerId === door.customerId);
    if (already) return;
    const quote = {
      id: createId(),
      customerId: door.customerId,
      territoryId: door.territoryId || null,
      service: '',
      amount: 0,
      lines: null,
      followUpDate: null,
      note: door.note || '',
      status: 'open',
      createdAt: door.at || new Date().toISOString(),
    };
    state.quotes.push(quote);
    door.quoteId = quote.id;
  });
  return state;
}

function migrateVocabulary(state) {
  const quoteStatus = { won: 'accepted', lost: 'declined' };
  state.quotes.forEach((q) => {
    if (quoteStatus[q.status]) q.status = quoteStatus[q.status];
  });
  state.customers.forEach((c) => {
    if (c.status === 'lost') c.status = 'declined';
  });
  return state;
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function emptyState() {
  return emptyCollections();
}

const DEFAULT_SETTINGS = {
  currency: 'CAD',
  userName: '',
  // Goals are a sequence, not one number: each has its own window, and
  // progress counts only money collected inside it. Lifetime revenue is
  // tracked separately so nothing is lost when one goal rolls into the next.
  goals: [],
  lastBackupAt: null,
  backupReminderSnoozedAt: null,
  // Empty means the stock wording. Kept as the user typed it so editing it
  // never fights a default being re-applied underneath.
  reminderTemplate: '',
};

export function newGoal({ amount, weeklyTarget, startDate, endDate }) {
  const start = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
  const end = endDate ? new Date(`${endDate}T00:00:00`) : new Date(start.getTime());
  if (!endDate) end.setDate(end.getDate() + 90);
  const startDay = localDay(start);
  const today = localDay();
  return {
    id: createId(),
    amount: amount || 20000,
    weeklyTarget: weeklyTarget || 2500,
    startDate: startDay,
    // The exact moment money starts counting. When a goal begins today it is
    // *now*, not midnight — otherwise finishing one goal and starting the next
    // on the same day would carry this morning's takings into both.
    startAt: startDay === today ? new Date().toISOString() : `${startDay}T00:00:00.000Z`,
    endDate: end.toISOString().slice(0, 10),
    status: 'active',
    achievedAt: null,
    closedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    const settings = { ...DEFAULT_SETTINGS, ...saved };
    if (!Array.isArray(settings.goals)) settings.goals = [];

    // Carry the single fixed goal from before goals were a sequence.
    if (!settings.goals.length) {
      settings.goals = [
        newGoal({
          amount: settings.goalAmount,
          weeklyTarget: settings.weeklyTarget,
          startDate: settings.goalStart,
          endDate: settings.goalEnd,
        }),
      ];
      saveSettings(settings);
    }
    delete settings.goalAmount;
    delete settings.goalStart;
    delete settings.goalEnd;
    delete settings.weeklyTarget;
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS, goals: [newGoal({})] };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearAllData() {
  localStorage.removeItem(KEY);
}

export function createId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// The LOCAL calendar day, not the UTC one. toISOString() rolls over in the
// evening for anyone west of Greenwich, which put follow-up dates, completion
// defaults and "overdue" checks a day out exactly when the day's admin gets
// done.
export function localDay(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() {
  return localDay();
}

export function daysFromToday(days) {
  return localDay(new Date(Date.now() + days * 86400000));
}

// "14:30" for a datetime-local default, in local time rather than UTC.
export function nowLocalDateTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
