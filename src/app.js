import * as state from './state.js';
import * as domain from './domain.js';
import { renderCanvassing, stopTimer } from './views/canvassing.js';
import { renderJobs, setJobsTab } from './views/jobs.js';
import { renderCustomers } from './views/customers.js';
import { renderSettings } from './views/settings.js';
import { renderDashboard } from './views/dashboard.js';
import { renderGoal } from './views/goal.js';
import { buildBottomNav } from './views/nav.js';

const root = document.getElementById('app');
const ROUTES = ['canvassing', 'jobs', 'customers', 'goal', 'settings'];

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  // #/quotes is a deep link into the Jobs screen's quotes tab, used by the
  // follow-ups bell in the header.
  if (hash === 'quotes') {
    setJobsTab('quotes');
    return 'jobs';
  }
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
  } else if (route === 'settings') {
    renderSettings(root);
  } else if (route === 'goal') {
    renderGoal(root);
  } else {
    renderDashboard(root);
  }
  // Settings has no tab of its own; it is reached from the header gear.
  root.appendChild(buildBottomNav(route === 'settings' ? '' : route));
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
