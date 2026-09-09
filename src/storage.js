const KEY = 'peak-panes-state-v1';
const SETTINGS_KEY = 'peak-panes-settings-v1';

const EMPTY_STATE = {
  territories: [],
  sessions: [],
  doors: [],
  customers: [],
  quotes: [],
  jobs: [],
};

// Every collection is a flat top-level array keyed by id. Doors point at a
// session and a territory; quotes and jobs point at a customer. Nothing is
// nested, so a record can be found without walking the tree.
export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_STATE };
    const parsed = JSON.parse(raw);
    // Merge over the empty shape so a state written by an older build that
    // lacked a collection still loads instead of throwing on .filter().
    const next = { ...EMPTY_STATE };
    Object.keys(EMPTY_STATE).forEach((k) => {
      if (Array.isArray(parsed[k])) next[k] = parsed[k];
    });
    return next;
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function emptyState() {
  return { ...EMPTY_STATE };
}

const DEFAULT_SETTINGS = {
  currency: 'CAD',
  userName: '',
  // Goals are a sequence, not one number: each has its own window, and
  // progress counts only money collected inside it. Lifetime revenue is
  // tracked separately so nothing is lost when one goal rolls into the next.
  goals: [],
  lastBackupAt: null,
};

export function newGoal({ amount, weeklyTarget, startDate, endDate }) {
  const start = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
  const end = endDate ? new Date(`${endDate}T00:00:00`) : new Date(start.getTime());
  if (!endDate) end.setDate(end.getDate() + 90);
  const startDay = start.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
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

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// "14:30" for a datetime-local default, in local time rather than UTC.
export function nowLocalDateTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
