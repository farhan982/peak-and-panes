import {
  loadState,
  saveState,
  emptyState,
  createId,
  loadSettings,
  saveSettings,
  clearAllData,
} from './storage.js';
import { activeSession as findActiveSession } from './domain.js';

let state = loadState();
let settings = loadSettings();
const listeners = [];

export function subscribe(fn) {
  listeners.push(fn);
}

function notify() {
  saveState(state);
  listeners.forEach((fn) => fn());
}

// Re-runs the render listeners without saving. For view-local UI state
// (a selected territory, a cleared input) that isn't part of the data.
export function refresh() {
  listeners.forEach((fn) => fn());
}

export function getState() {
  return state;
}

export function getSettings() {
  return settings;
}

export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  saveSettings(settings);
  notify();
}

export function resetAllData() {
  clearAllData();
  state = emptyState();
  notify();
}

// --- Territories -----------------------------------------------------------

export function getTerritories() {
  return state.territories;
}

export function getTerritory(id) {
  return state.territories.find((t) => t.id === id) || null;
}

export function createTerritory(name, area, doorTarget) {
  const territory = {
    id: createId(),
    name,
    area: area || '',
    doorTarget: doorTarget || null,
    createdAt: new Date().toISOString(),
  };
  state.territories.push(territory);
  notify();
  return territory;
}

export function updateTerritory(id, fields) {
  const territory = getTerritory(id);
  if (!territory) return;
  Object.assign(territory, fields);
  notify();
}

// Doors and sessions are kept — they are the record of work actually done, and
// orphaning them would silently rewrite past revenue. The territory name is
// denormalised onto each door at log time so history still reads correctly.
export function deleteTerritory(id) {
  state.territories = state.territories.filter((t) => t.id !== id);
  notify();
}

// --- Sessions --------------------------------------------------------------

export function getActiveSession() {
  return findActiveSession(state);
}

export function startSession(territoryId) {
  const existing = findActiveSession(state);
  if (existing) return existing;
  const territory = getTerritory(territoryId);
  const session = {
    id: createId(),
    territoryId,
    territoryName: territory ? territory.name : 'Territory',
    startedAt: new Date().toISOString(),
    endedAt: null,
  };
  state.sessions.push(session);
  notify();
  return session;
}

export function endSession(sessionId) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session || session.endedAt) return;
  session.endedAt = new Date().toISOString();
  notify();
}

export function getSessions() {
  return [...state.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// A session with no doors logged is noise, not history.
export function discardSession(sessionId) {
  state.sessions = state.sessions.filter((s) => s.id !== sessionId);
  state.doors = state.doors.filter((d) => d.sessionId !== sessionId);
  notify();
}

// --- Doors -----------------------------------------------------------------

export function getDoors() {
  return state.doors;
}

export function logDoor(fields) {
  const door = {
    id: createId(),
    at: new Date().toISOString(),
    address: '',
    note: '',
    amount: 0,
    customerId: null,
    quoteId: null,
    jobId: null,
    ...fields,
  };
  state.doors.push(door);
  notify();
  return door;
}

// Undo removes the door and anything it created in the same tap, so a
// mis-tapped "Booked" doesn't leave a phantom job on the calendar.
export function undoDoor(doorId) {
  const door = state.doors.find((d) => d.id === doorId);
  if (!door) return;
  state.doors = state.doors.filter((d) => d.id !== doorId);
  if (door.quoteId) state.quotes = state.quotes.filter((q) => q.id !== door.quoteId);
  if (door.jobId) state.jobs = state.jobs.filter((j) => j.id !== door.jobId);
  if (door.customerId && door.createdCustomer) {
    state.customers = state.customers.filter((c) => c.id !== door.customerId);
  }
  notify();
}

// --- Customers, quotes, jobs ----------------------------------------------

export function getCustomers() {
  return state.customers;
}

export function getCustomer(id) {
  return state.customers.find((c) => c.id === id) || null;
}

function addCustomer(fields) {
  const customer = {
    id: createId(),
    name: '',
    phone: '',
    email: '',
    address: '',
    status: 'lead',
    source: 'Door knock',
    territoryId: null,
    note: '',
    createdAt: new Date().toISOString(),
    ...fields,
  };
  state.customers.push(customer);
  return customer;
}

export function getQuotes() {
  return state.quotes;
}

export function getJobs() {
  return state.jobs;
}

// Logging a quote at the door creates three linked records in one tap:
// the customer, the open quote, and the door outcome itself.
export function logQuoteGiven({
  sessionId,
  territoryId,
  address,
  name,
  phone,
  service,
  amount,
  followUpDate,
  note,
}) {
  const customer = addCustomer({
    name,
    phone: phone || '',
    address: address || '',
    status: 'quote_sent',
    territoryId,
    note: note || '',
  });
  const quote = {
    id: createId(),
    customerId: customer.id,
    territoryId,
    service,
    amount: amount || 0,
    followUpDate: followUpDate || null,
    note: note || '',
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  state.quotes.push(quote);
  const door = logDoor({
    sessionId,
    territoryId,
    address,
    outcome: 'quote_given',
    amount: amount || 0,
    note: note || '',
    customerId: customer.id,
    createdCustomer: true,
    quoteId: quote.id,
  });
  return { customer, quote, door };
}

export function logBooked({
  sessionId,
  territoryId,
  address,
  name,
  phone,
  email,
  service,
  amount,
  scheduledAt,
  note,
}) {
  const customer = addCustomer({
    name,
    phone: phone || '',
    email: email || '',
    address: address || '',
    status: 'booked',
    territoryId,
    note: note || '',
  });
  const job = {
    id: createId(),
    customerId: customer.id,
    territoryId,
    service,
    amount: amount || 0,
    scheduledAt: scheduledAt || null,
    note: note || '',
    status: 'scheduled',
    paymentReceived: false,
    paymentMethod: null,
    createdAt: new Date().toISOString(),
  };
  state.jobs.push(job);
  const door = logDoor({
    sessionId,
    territoryId,
    address,
    outcome: 'booked',
    amount: amount || 0,
    note: note || '',
    customerId: customer.id,
    createdCustomer: true,
    jobId: job.id,
  });
  return { customer, job, door };
}

// A "Follow Up" door is a soft lead: worth a name and a date, not a quote.
export function logFollowUp({ sessionId, territoryId, address, name, followUpDate, note }) {
  let customerId = null;
  let createdCustomer = false;
  if (name) {
    const customer = addCustomer({
      name,
      address: address || '',
      status: 'follow_up',
      territoryId,
      note: note || '',
    });
    customerId = customer.id;
    createdCustomer = true;
  }
  return logDoor({
    sessionId,
    territoryId,
    address,
    outcome: 'follow_up',
    note: note || '',
    followUpDate: followUpDate || null,
    customerId,
    createdCustomer,
  });
}
