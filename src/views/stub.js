const STUBS = {
  dashboard: {
    icon: '⌂',
    title: 'Dashboard',
    body: 'The daily view — goal progress, this week’s revenue, the doors-to-quotes-to-jobs funnel, today’s schedule and quick actions. Not built yet.',
  },
  goal: {
    icon: '▲',
    title: 'Goal & territories',
    body: 'Pace against the $20,000 target, territory rankings, revenue per door and per hour, and the weekly review. Not built yet.',
  },
};

export function renderStub(root, key) {
  const stub = STUBS[key];
  const header = document.createElement('div');
  header.className = 'app-header';
  header.innerHTML = `
    <div class="brand">
      <div class="brand-mark">&#9650;</div>
      <div>
        <p class="page-title">${stub.title}</p>
        <p class="page-subtitle">Peak &amp; Panes</p>
      </div>
    </div>
  `;
  root.appendChild(header);

  const box = document.createElement('div');
  box.className = 'stub';
  box.innerHTML = `
    <div class="stub-icon">${stub.icon}</div>
    <h2>Coming next</h2>
    <p>${stub.body}</p>
  `;
  root.appendChild(box);

  const go = document.createElement('button');
  go.className = 'btn-primary';
  go.textContent = 'Go to canvassing';
  go.addEventListener('click', () => {
    location.hash = '#/canvassing';
  });
  root.appendChild(go);
}
