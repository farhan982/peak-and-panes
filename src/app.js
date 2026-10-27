import * as state from './state.js';
import * as domain from './domain.js';
import { renderCanvassing, stopTimer } from './views/canvassing.js';
import { renderJobs, setJobsTab } from './views/jobs.js';
import { renderCustomers } from './views/customers.js';
import { renderSettings } from './views/settings.js';
import { renderDashboard } from './views/dashboard.js';
import { renderGoal } from './views/goal.js';
import { renderServices } from './views/services.js';
import { buildBottomNav } from './views/nav.js';

const root = document.getElementById('app');
const ROUTES = ['canvassing', 'jobs', 'customers', 'goal', 'settings', 'services'];

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  // #/quotes is a ONE-SHOT deep link into the Jobs screen's quotes tab, used
  // by the follow-ups bell. The hash is rewritten straight away because
  // currentRoute runs on every render: left as #/quotes it would re-apply the
  // tab each time, so tapping Upcoming or Completed was undone instantly.
  // replaceState does not fire hashchange, so this does not re-render.
  if (hash === 'quotes') {
    setJobsTab('quotes');
    history.replaceState(null, '', '#/jobs');
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
  } else if (route === 'services') {
    renderServices(root);
  } else {
    renderDashboard(root);
  }
  // Settings has no tab of its own; it is reached from the header gear.
  const navRoute = route === 'settings' ? '' : route === 'services' ? 'goal' : route;
  root.appendChild(buildBottomNav(navRoute));
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
