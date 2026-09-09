import * as state from '../state.js';
import { icon } from '../icons.js';

// Quotes whose follow-up date has arrived. This is the only notification the
// app has anything real to say about, so it is the only thing the bell counts.
export function dueFollowUps() {
  const today = new Date().toISOString().slice(0, 10);
  return state.getQuotes().filter((q) => q.status === 'open' && q.followUpDate && q.followUpDate <= today);
}

// Every screen shares the same navy band: brand lockup, bell, then a title
// block and optional right-hand control or segmented control. Returns the
// page container that the screen's own content goes into.
export function buildScreen(root, { title, subtitle, subtitleGold, right, seg } = {}) {
  const due = dueFollowUps().length;

  const band = document.createElement('div');
  band.className = 'brand-band';
  band.innerHTML = `
    <div class="brand-row">
      <img class="brand-logo" src="./assets/brand/logo.svg" alt="Peak &amp; Panes" />
      <button class="gear" id="gear" aria-label="Settings">${icon('gear', 21)}</button>
      <button class="bell" id="bell" aria-label="${due} follow-up${due === 1 ? '' : 's'} due">
        ${icon('bell', 22)}
        ${due ? `<span class="bell-badge">${due > 9 ? '9+' : due}</span>` : ''}
      </button>
    </div>
    <div class="band-head">
      <div>
        <p class="band-title">${title}</p>
        ${subtitle ? `<p class="band-sub${subtitleGold ? ' gold' : ''}">${subtitle}</p>` : ''}
      </div>
    </div>
  `;

  band.querySelector('#bell').addEventListener('click', () => {
    location.hash = '#/quotes';
  });
  band.querySelector('#gear').addEventListener('click', () => {
    location.hash = '#/settings';
  });

  if (right) band.querySelector('.band-head').appendChild(right);

  if (seg) {
    const wrap = document.createElement('div');
    wrap.className = 'band-seg';
    seg.forEach(({ label, active, onSelect }) => {
      const btn = document.createElement('button');
      btn.className = active ? 'active' : '';
      btn.textContent = label;
      btn.addEventListener('click', onSelect);
      wrap.appendChild(btn);
    });
    band.appendChild(wrap);
  }

  root.appendChild(band);

  const page = document.createElement('div');
  page.className = 'page';
  root.appendChild(page);
  return page;
}
