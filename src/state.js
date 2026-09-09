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

// Replaces everything with the contents of an already-validated backup.
// Callers validate and confirm first — this does not ask.
export function importBackup({ data, settings: incoming }) {
  state = { ...emptyState(), ...data };
  saveState(state);
  if (incoming) {
    settings = { ...settings, ...incoming };
    saveSettings(settings);
  }
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

export function createTerritory(name, area, doorTarget, origin) {
  const territory = {
    id: createId(),
    name,
    area: area || '',
    doorTarget: doorTarget || null,
    // Where the territory was created, so it can be recognised by location
    // before any doors have been logged in it.
    origin: origin || null,
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

// A GPS fix arrives after the door is already logged, and nothing on screen
// shows the coordinates, so these write straight to storage WITHOUT notifying.
// A re-render here would steal focus from the address field mid-typing.
export function attachDoorLocation(doorId, patch) {
  const door = state.doors.find((d) => d.id === doorId);
  if (!door) return;
  Object.assign(door, patch);
  saveState(state);
}

export function attachSessionLocation(sessionId, patch) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  Object.assign(session, patch);
  saveState(state);
}

export function latestDoorId(sessionId) {
  for (let i = state.doors.length - 1; i >= 0; i--) {
    if (state.doors[i].sessionId === sessionId) return state.doors[i].id;
  }
  return null;
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

// Work that arrives by phone or referral rather than at a door. Same records,
// no session and no door.
export function createQuoteDirect({ name, phone, address, service, amount, followUpDate, note, source }) {
  const customer = addCustomer({
    name,
    phone: phone || '',
    address: address || '',
    status: 'quote_sent',
    source: source || 'Other',
    note: note || '',
  });
  const quote = {
    id: createId(),
    customerId: customer.id,
    territoryId: null,
    service,
    amount: amount || 0,
    followUpDate: followUpDate || null,
    note: note || '',
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  state.quotes.push(quote);
  notify();
  return quote;
}

export function createJobDirect({ name, phone, email, address, service, amount, scheduledAt, note, source }) {
  const customer = addCustomer({
    name,
    phone: phone || '',
    email: email || '',
    address: address || '',
    status: 'booked',
    source: source || 'Other',
    note: note || '',
  });
  const job = {
    id: createId(),
    customerId: customer.id,
    territoryId: null,
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
  notify();
  return job;
}

export function completeJob(jobId, { paymentReceived, paymentMethod }) {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) return;
  job.status = 'completed';
  job.completedAt = new Date().toISOString();
  job.paymentReceived = Boolean(paymentReceived);
  job.paymentMethod = paymentReceived ? paymentMethod || 'Other' : null;
  notify();
}

// Money is only counted as collected once payment is actually recorded, which
// can happen after the job is marked done.
export function recordPayment(jobId, paymentMethod) {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) return;
  job.paymentReceived = true;
  job.paymentMethod = paymentMethod || 'Other';
  notify();
}

// Winning a quote turns it into a scheduled job, carrying the customer over
// rather than creating a second record for the same person.
export function markQuoteWon(quoteId, scheduledAt) {
  const quote = state.quotes.find((q) => q.id === quoteId);
  if (!quote || quote.status !== 'open') return null;
  quote.status = 'won';
  const job = {
    id: createId(),
    customerId: quote.customerId,
    territoryId: quote.territoryId,
    service: quote.service,
    amount: quote.amount,
    scheduledAt: scheduledAt || null,
    note: quote.note || '',
    status: 'scheduled',
    paymentReceived: false,
    paymentMethod: null,
    fromQuoteId: quote.id,
    createdAt: new Date().toISOString(),
  };
  state.jobs.push(job);
  const customer = getCustomer(quote.customerId);
  if (customer) customer.status = 'booked';
  notify();
  return job;
}

export function markQuoteLost(quoteId) {
  const quote = state.quotes.find((q) => q.id === quoteId);
  if (!quote) return;
  quote.status = 'lost';
  const customer = getCustomer(quote.customerId);
  // Only demote a customer who has nothing else going on.
  if (customer && !state.jobs.some((j) => j.customerId === customer.id)) {
    customer.status = 'lost';
  }
  notify();
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
