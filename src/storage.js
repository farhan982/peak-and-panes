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
  goalAmount: 20000,
  goalStart: null, // ISO date; set on first run below
  goalEnd: null,
  weeklyTarget: 2500,
  lastBackupAt: null,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    const settings = { ...DEFAULT_SETTINGS, ...saved };
    if (!settings.goalStart || !settings.goalEnd) {
      const start = new Date();
      const end = new Date(start.getTime());
      end.setDate(end.getDate() + 90);
      settings.goalStart = start.toISOString().slice(0, 10);
      settings.goalEnd = end.toISOString().slice(0, 10);
      saveSettings(settings);
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
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
