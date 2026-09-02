import * as state from '../state.js';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '⌂', hash: '#/' },
  { key: 'canvassing', label: 'Canvassing', icon: '⚑', hash: '#/canvassing' },
  { key: 'jobs', label: 'Jobs', icon: '▤', hash: '#/jobs' },
  { key: 'customers', label: 'Customers', icon: '◎', hash: '#/customers' },
  { key: 'goal', label: 'Goal', icon: '▲', hash: '#/goal' },
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
    btn.innerHTML = `<span class="nav-icon">${isLive ? '●' : item.icon}</span><span>${
      isLive ? 'Live' : item.label
    }</span>`;
    btn.addEventListener('click', () => {
      location.hash = item.hash;
    });
    inner.appendChild(btn);
  });

  return nav;
}
