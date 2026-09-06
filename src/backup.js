import { createId } from './storage.js';

const COLLECTIONS = ['territories', 'sessions', 'doors', 'customers', 'quotes', 'jobs'];

export function buildBackup(state, settings) {
  return {
    app: 'peak-panes-field-ops',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: COLLECTIONS.reduce((out, key) => ({ ...out, [key]: state[key] || [] }), {}),
    settings,
  };
}

export function countRecords(data) {
  return COLLECTIONS.reduce((out, key) => ({ ...out, [key]: (data[key] || []).length }), {});
}

// Validation is strict because restoring REPLACES everything. A file that is
// merely unfamiliar is rejected; a file that is valid but missing optional
// fields is normalised rather than refused.
export function validateBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON. Pick the .json file the app downloaded.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'That file does not look like a Peak & Panes backup.' };
  }
  if (parsed.app && parsed.app !== 'peak-panes-field-ops') {
    return { ok: false, error: `That backup is from a different app (${parsed.app}).` };
  }
  const data = parsed.data;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'That backup has no data in it.' };
  }
  for (const key of COLLECTIONS) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      return { ok: false, error: `The "${key}" section of that backup is damaged.` };
    }
  }

  const clean = {};
  for (const key of COLLECTIONS) {
    clean[key] = (data[key] || []).map((record) => ({ ...record, id: record.id || createId() }));
  }

  for (const territory of clean.territories) {
    if (!territory.name) return { ok: false, error: 'That backup contains a territory with no name.' };
  }
  for (const session of clean.sessions) {
    if (!session.startedAt) return { ok: false, error: 'That backup contains a session with no start time.' };
    if (session.endedAt === undefined) session.endedAt = null;
  }
  for (const door of clean.doors) {
    if (!door.outcome) return { ok: false, error: 'That backup contains a door with no outcome.' };
    if (typeof door.amount !== 'number') door.amount = 0;
  }
  for (const job of clean.jobs) {
    if (typeof job.amount !== 'number') {
      return { ok: false, error: 'That backup contains a job with a non-numeric price.' };
    }
  }
  for (const quote of clean.quotes) {
    if (typeof quote.amount !== 'number') {
      return { ok: false, error: 'That backup contains a quote with a non-numeric amount.' };
    }
  }

  return { ok: true, data: clean, settings: parsed.settings || null };
}

export function downloadBackup(state, settings) {
  const backup = buildBackup(state, settings);
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `peak-panes-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Injectable confirm/alert so the whole restore path can be tested without a
// real dialog blocking the run.
export function restoreFromText(text, applyFn, confirmFn = window.confirm, alertFn = window.alert) {
  const result = validateBackup(text);
  if (!result.ok) {
    alertFn(result.error);
    return false;
  }
  const counts = countRecords(result.data);
  const summary = `${counts.doors} doors, ${counts.customers} customers, ${counts.quotes} quotes and ${counts.jobs} jobs`;
  if (!confirmFn(`Replace everything currently in the app with this backup?\n\nThe backup contains ${summary}.\n\nThis cannot be undone.`)) {
    return false;
  }
  applyFn(result);
  return true;
}
