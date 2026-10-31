import * as state from '../state.js';
import * as domain from '../domain.js';
import { icon } from '../icons.js';
import { buildScreen } from './header.js';
import { esc, openCustomerSheet } from './modals.js';

// Past customers worth a nudge now that the season has turned. The app sends
// nothing itself — there is no server behind it, and there is no silent way
// to put a text on the network from a web page. Each row hands the finished
// draft to the phone's own Messages app with the number already filled in, so
// it goes from your number and the replies come back to you.
export function renderReminders(root) {
  const s = state.getState();
  const settings = state.getSettings();
  const now = new Date();
  const list = domain.reminders(s, settings, now);

  const page = buildScreen(root, {
    title: `${domain.season(now)} reminders`,
    subtitle: list.length
      ? `${domain.plural(list.length, 'past customer')} due a nudge.`
      : 'Nobody is due a nudge yet.',
  });

  if (!list.length) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="stub">
        <div class="stub-icon">${icon('people', 26)}</div>
        <h2>Nothing to chase</h2>
        <p>This fills up from <strong>Due again</strong>: a past customer whose
          work is older than its repeat interval — windows every six months,
          eaves before each autumn. Finish some jobs and they land here.</p>
      </div>
    `;
    page.appendChild(card);
    return;
  }

  // Shown with a real name filled in, from someone the list can actually
  // reach — the sample is no use if it is the one person with no number.
  const sample = list.find((entry) => entry.href) || list[0];
  page.appendChild(buildMessageCard(sample.body, list));

  list.forEach((entry) => {
    page.appendChild(buildRow(entry));
  });
}

function buildMessageCard(sample, list) {
  const sent = list.filter((entry) => entry.sentDaysAgo !== null).length;
  const noNumber = list.filter((entry) => !entry.href).length;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-row" style="margin-bottom:4px">
      <p class="card-title">The message</p>
      <span class="pill ${sent === list.length ? 'green' : 'blue'}">${sent} of ${list.length} texted</span>
    </div>
    <p class="reminder-draft">${esc(sample)}</p>
    <p class="card-sub">Each name is filled in as you go. Tapping <strong>Text</strong>
      opens your own Messages app with the draft ready — nothing is sent until
      you press send there.</p>
    ${
      noNumber
        ? `<p class="card-sub" style="color:var(--orange);font-weight:650">${domain.plural(
            noNumber,
            'person has',
            'people have'
          )} no number on file.</p>`
        : ''
    }
  `;

  const edit = document.createElement('button');
  edit.className = 'btn-secondary';
  edit.style.marginTop = '12px';
  edit.textContent = 'Edit the wording';
  edit.addEventListener('click', () => {
    location.hash = '#/settings';
  });
  card.appendChild(edit);
  return card;
}

function buildRow({ customer, service, months, sentDaysAgo, href }) {
  const row = document.createElement('div');
  row.className = 'row reminder-row';

  const main = document.createElement('button');
  main.className = 'row-main';
  main.innerHTML = `
    <p class="row-title">${esc(customer.name || 'No name')}</p>
    <p class="row-sub">${esc(service)} · ${domain.plural(months, 'month')} ago</p>
    ${
      sentDaysAgo === null
        ? ''
        : `<p class="row-sub link">Texted ${sentDaysAgo === 0 ? 'today' : `${domain.plural(sentDaysAgo, 'day')} ago`}</p>`
    }
  `;
  main.addEventListener('click', () => openCustomerSheet(customer.id));
  row.appendChild(main);

  if (!href) {
    // Nothing to text. Say which record needs fixing rather than showing a
    // button that cannot do anything.
    const none = document.createElement('span');
    none.className = 'pill';
    none.textContent = 'No number';
    row.appendChild(none);
    return row;
  }

  // A real anchor, so the phone treats it as a link to its Messages app
  // rather than something this page is trying to do by itself.
  const send = document.createElement('a');
  send.className = sentDaysAgo === null ? 'btn-primary reminder-send' : 'btn-secondary reminder-send';
  send.href = href;
  send.textContent = sentDaysAgo === null ? 'Text' : 'Again';
  send.addEventListener('click', () => {
    // Deferred: marking it re-renders the screen, and tearing this anchor out
    // of the document inside its own click handler can lose the navigation
    // that is the whole point of the tap.
    setTimeout(() => state.markReminded(customer.id), 0);
  });
  row.appendChild(send);
  return row;
}
