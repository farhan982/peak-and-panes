import * as state from './state.js';
import * as domain from './domain.js';
import { renderCanvassing, stopTimer } from './views/canvassing.js';
import { renderJobs } from './views/jobs.js';
import { renderCustomers } from './views/customers.js';
import { renderStub } from './views/stub.js';
import { buildBottomNav } from './views/nav.js';

const root = document.getElementById('app');
const ROUTES = ['canvassing', 'jobs', 'customers', 'goal'];

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(hash) ? hash : 'dashboard';
}

function render() {
  domain.setCurrency(state.getSettings().currency);
  // The canvassing timer holds an interval over an element that is about to be
  // thrown away; canvassing restarts it if it is still the active screen.
  stopTimer();

  const route = currentRoute();
  root.innerHTML = '';
  if (route === 'canvassing') {
    renderCanvassing(root);
  } else if (route === 'jobs') {
    renderJobs(root);
  } else if (route === 'customers') {
    renderCustomers(root);
  } else {
    renderStub(root, route);
  }
  root.appendChild(buildBottomNav(route));
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});
state.subscribe(render);
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
