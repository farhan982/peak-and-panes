import * as state from '../state.js';
import { icon } from '../icons.js';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'home', hash: '#/' },
  { key: 'canvassing', label: 'Canvassing', icon: 'walk', hash: '#/canvassing' },
  { key: 'jobs', label: 'Jobs', icon: 'briefcase', hash: '#/jobs' },
  { key: 'customers', label: 'Customers', icon: 'people', hash: '#/customers' },
  { key: 'goal', label: 'Goal', icon: 'target', hash: '#/goal' },
];

export function buildBottomNav(activeRoute) {
  const nav = document.createElement('div');
  nav.className = 'bottom-nav';
  const inner = document.createElement('div');
  inner.className = 'nav-inner';
  nav.appendChild(inner);

  const sessionLive = Boolean(state.getActiveSession());

  NAV_ITEMS.forEach((item) => {
    const isActive = item.key === activeRoute;
    const isLive = item.key === 'canvassing' && sessionLive;
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (isActive ? ' active' : '') + (isLive ? ' live' : '');
    btn.innerHTML = isLive
      ? `<span class="nav-dot"></span><span>Live</span>`
      : `${icon(item.icon, 23)}<span>${item.label}</span>`;
    btn.addEventListener('click', () => {
      location.hash = item.hash;
    });
    inner.appendChild(btn);
  });

  return nav;
}
