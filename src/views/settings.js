import * as state from '../state.js';
import * as domain from '../domain.js';
import { icon } from '../icons.js';
import { buildScreen } from './header.js';
import { downloadBackup, restoreFromText, countRecords } from '../backup.js';

export function renderSettings(root) {
  const page = buildScreen(root, { title: 'Settings', subtitle: 'Goal, backups and data.' });
  const settings = state.getSettings();
  const s = state.getState();

  // --- Goal ---------------------------------------------------------------
  const goal = document.createElement('div');
  goal.className = 'card';
  goal.innerHTML = `
    <p class="card-title" style="margin-bottom:12px">Revenue goal</p>
    <div class="field">
      <label>Goal amount</label>
      <div class="input-prefix">
        <span class="prefix-symbol">${domain.currencySymbol()}</span>
        <input type="number" id="g-amount" inputmode="decimal" min="0" step="100" value="${settings.goalAmount}" />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Starts</label>
        <input type="date" id="g-start" value="${settings.goalStart}" />
      </div>
      <div class="field">
        <label>Ends</label>
        <input type="date" id="g-end" value="${settings.goalEnd}" />
      </div>
    </div>
    <div class="field">
      <label>Weekly target</label>
      <div class="input-prefix">
        <span class="prefix-symbol">${domain.currencySymbol()}</span>
        <input type="number" id="g-weekly" inputmode="decimal" min="0" step="50" value="${settings.weeklyTarget}" />
      </div>
    </div>
    <button class="btn-primary" id="g-save">Save goal</button>
  `;
  goal.querySelector('#g-save').addEventListener('click', () => {
    const amount = parseFloat(goal.querySelector('#g-amount').value);
    const weekly = parseFloat(goal.querySelector('#g-weekly').value);
    state.updateSettings({
      goalAmount: amount > 0 ? amount : settings.goalAmount,
      goalStart: goal.querySelector('#g-start').value || settings.goalStart,
      goalEnd: goal.querySelector('#g-end').value || settings.goalEnd,
      weeklyTarget: weekly > 0 ? weekly : settings.weeklyTarget,
    });
  });
  page.appendChild(goal);

  // --- Backup -------------------------------------------------------------
  const counts = countRecords(s);
  const hasData = Object.values(counts).some((n) => n > 0);
  const last = settings.lastBackupAt;

  const backup = document.createElement('div');
  backup.className = 'card';
  backup.innerHTML = `
    <p class="card-title">Backup</p>
    <p class="card-sub">Your records live only on this device. A backup is a file you
      keep — it is the only way to move data to another phone or get it back if this
      one is lost.</p>
    <p class="card-sub" style="margin-top:8px">
      ${last ? `Last backup ${domain.formatDateTime(last)}.` : 'You have never saved a backup.'}
      ${hasData ? `Currently holding ${domain.plural(counts.doors, 'door')}, ${domain.plural(counts.customers, 'customer')}, ${domain.plural(counts.quotes, 'quote')}, ${domain.plural(counts.jobs, 'job')}.` : ''}
    </p>
  `;
  const download = document.createElement('button');
  download.className = 'btn-primary';
  download.style.marginTop = '14px';
  download.disabled = !hasData;
  download.textContent = hasData ? 'Download backup' : 'Nothing to back up yet';
  download.addEventListener('click', () => {
    downloadBackup(state.getState(), state.getSettings());
    state.updateSettings({ lastBackupAt: new Date().toISOString() });
  });
  backup.appendChild(download);

  const restoreLabel = document.createElement('label');
  restoreLabel.className = 'btn-secondary';
  restoreLabel.style.marginTop = '10px';
  restoreLabel.style.display = 'block';
  restoreLabel.textContent = 'Restore from backup';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      restoreFromText(String(reader.result), state.importBackup);
      // Clear so picking the same file twice still fires a change event.
      fileInput.value = '';
    };
    reader.readAsText(file);
  });
  restoreLabel.appendChild(fileInput);
  backup.appendChild(restoreLabel);
  page.appendChild(backup);

  // --- Danger zone --------------------------------------------------------
  const danger = document.createElement('div');
  danger.className = 'card';
  danger.innerHTML = `
    <p class="card-title">Delete all data</p>
    <p class="card-sub">Removes every territory, session, door, customer, quote and job
      from this device. Your goal settings are kept. Download a backup first.</p>
  `;
  const wipe = document.createElement('button');
  wipe.className = 'btn-danger';
  wipe.style.marginTop = '14px';
  wipe.disabled = !hasData;
  wipe.textContent = 'Delete all data';
  wipe.addEventListener('click', () => {
    const summary = `${domain.plural(counts.doors, 'door')}, ${domain.plural(counts.customers, 'customer')}, ${domain.plural(counts.quotes, 'quote')} and ${domain.plural(counts.jobs, 'job')}`;
    if (window.confirm(`Permanently delete ${summary}?\n\nThis cannot be undone. Download a backup first if you might want any of it back.`)) {
      state.resetAllData();
    }
  });
  danger.appendChild(wipe);
  page.appendChild(danger);
}
