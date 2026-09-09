import * as state from '../state.js';
import * as domain from '../domain.js';
import { icon } from '../icons.js';
import { buildScreen } from './header.js';
import * as geo from '../geo.js';
import { openGoalModal } from './modals.js';
import { downloadBackup, restoreFromText, countRecords } from '../backup.js';

export function renderSettings(root) {
  const page = buildScreen(root, { title: 'Settings', subtitle: 'Goal, backups and data.' });
  const settings = state.getSettings();
  const s = state.getState();

  // --- You -----------------------------------------------------------------
  const you = document.createElement('div');
  you.className = 'card';
  you.innerHTML = `
    <p class="card-title" style="margin-bottom:12px">You</p>
    <div class="field" style="margin-bottom:0">
      <label>Name</label>
      <input type="text" id="s-name" placeholder="Farhan" value="${(settings.userName || '').replace(/"/g, '&quot;')}" />
    </div>
    <p class="card-sub" style="margin-top:8px">Used for the greeting on the dashboard.</p>
  `;
  const nameInput = you.querySelector('#s-name');
  // Saved on blur rather than per keystroke: updateSettings re-renders, which
  // would rebuild the field and lose the caret mid-word.
  nameInput.addEventListener('blur', () => {
    const value = nameInput.value.trim();
    if (value !== (settings.userName || '')) state.updateSettings({ userName: value });
  });
  page.appendChild(you);

  // --- Goals ---------------------------------------------------------------
  const active = domain.activeGoal(settings);
  const goals = document.createElement('div');
  goals.className = 'card';
  goals.innerHTML = `<p class="card-title">Goal</p>`;

  if (active) {
    const progress = domain.goalProgress(s.jobs, active);
    goals.innerHTML += `
      <p class="card-sub">${domain.formatCurrency(active.amount)} between ${domain.formatDate(
        active.startDate
      )} and ${domain.formatDate(active.endDate)}, with a ${domain.formatCurrency(
        active.weeklyTarget
      )} weekly target.</p>
      <p class="card-sub" style="margin-top:6px">${domain.formatCurrency(
        progress.collected
      )} collected inside this window so far.</p>
    `;
  } else {
    goals.innerHTML += `<p class="card-sub">No goal running. Set one to track pace again.</p>`;
  }

  const editBtn = document.createElement('button');
  editBtn.className = active ? 'btn-secondary' : 'btn-primary';
  editBtn.style.marginTop = '14px';
  editBtn.textContent = active ? 'Edit this goal' : 'Set a goal';
  editBtn.addEventListener('click', () => openGoalModal(active));
  goals.appendChild(editBtn);

  if (active) {
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-primary';
    nextBtn.style.marginTop = '10px';
    nextBtn.textContent = 'Start a new goal';
    nextBtn.addEventListener('click', () => {
      if (
        window.confirm(
          'Start a new goal? The one running now is closed and kept in your history. Money already collected stays in your all-time total.'
        )
      ) {
        openGoalModal(null);
      }
    });
    goals.appendChild(nextBtn);
  }
  page.appendChild(goals);

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

  // --- Location -----------------------------------------------------------
  const located = state.getState().doors.filter((d) => typeof d.lat === 'number').length;
  const STATUS_TEXT = {
    available: 'On. Each door you log is stamped with your position.',
    denied: 'Blocked. Turn it on in Settings › Safari › Location, then reload.',
    insecure: 'Unavailable — this page is not being served over https.',
    unsupported: 'This browser cannot report location.',
  };
  const location = document.createElement('div');
  location.className = 'card';
  location.innerHTML = `
    <p class="card-title">Location</p>
    <p class="card-sub">${STATUS_TEXT[geo.status()]}</p>
    <p class="card-sub" style="margin-top:8px">${
      located
        ? `${domain.plural(located, 'door')} stamped so far. Positions are stored on this device only.`
        : 'Nothing stamped yet. Accuracy is about 10 metres — enough for the street, not the house number.'
    }</p>
  `;
  page.appendChild(location);

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
