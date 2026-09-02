import { icon } from '../icons.js';
import { buildScreen } from './header.js';

const STUBS = {
  dashboard: {
    icon: 'home',
    title: 'Dashboard',
    subtitle: 'Good morning, <span class="gold">Farhan</span>',
    body: 'The daily view — goal progress, this week’s revenue, the doors-to-quotes-to-jobs funnel, today’s schedule and quick actions. Not built yet.',
  },
  goal: {
    icon: 'target',
    title: 'Goal &amp; Territories',
    subtitle: 'Track your progress and territory performance.',
    body: 'Pace against the $20,000 target, territory rankings, revenue per door and per hour, and the weekly review. Not built yet.',
  },
};

export function renderStub(root, key) {
  const stub = STUBS[key];
  const page = buildScreen(root, { title: stub.subtitle || stub.title, subtitle: stub.title });

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="stub">
      <div class="stub-icon">${icon(stub.icon, 28)}</div>
      <h2>Coming next</h2>
      <p>${stub.body}</p>
    </div>
  `;
  page.appendChild(card);

  const go = document.createElement('button');
  go.className = 'btn-primary';
  go.textContent = 'Go to canvassing';
  go.addEventListener('click', () => {
    location.hash = '#/canvassing';
  });
  page.appendChild(go);
}
