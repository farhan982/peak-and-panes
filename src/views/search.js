// Filtering happens in the DOM rather than by re-rendering. A re-render would
// replace the input on every keystroke, which loses focus and the caret — the
// usual fix is to restore both afterwards, but not needing to is simpler and
// does not fight the keyboard on a phone.
//
// Relies on the global [hidden] rule in styles.css: the browser's own
// [hidden] { display: none } is user-agent weight, so any author rule setting
// display beats it, and almost every row here is display: flex.
export function attachSearch(page, { placeholder, rows, emptyText, tags, alsoHide }) {
  if (!rows.length) return;

  let query = '';
  let tag = 'all';

  const wrap = document.createElement('div');
  wrap.className = 'search-wrap';
  wrap.innerHTML = `
    <input class="search-input" type="search" inputmode="search"
      placeholder="${placeholder}" autocomplete="off" autocorrect="off" spellcheck="false" />
  `;
  const input = wrap.querySelector('.search-input');

  // Only the statuses actually present, so the row stays short.
  let chipRow = null;
  if (tags && tags.length > 1) {
    chipRow = document.createElement('div');
    chipRow.className = 'chip-row filter-chips';
    tags.forEach(({ key, label, count }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (key === tag ? ' active' : '');
      chip.innerHTML = `${label}${count === undefined ? '' : ` <span class="chip-count">${count}</span>`}`;
      chip.addEventListener('click', () => {
        tag = key;
        chipRow.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        apply();
      });
      chipRow.appendChild(chip);
    });
    wrap.appendChild(chipRow);
  }

  const empty = document.createElement('p');
  empty.className = 'search-empty';
  empty.textContent = emptyText;
  empty.hidden = true;

  function apply() {
    const needle = query.trim().toLowerCase();
    let shown = 0;
    rows.forEach(({ el, text, tag: rowTag }) => {
      const match = (!needle || text.toLowerCase().includes(needle)) && (tag === 'all' || rowTag === tag);
      el.hidden = !match;
      if (match) shown += 1;
    });
    const narrowing = Boolean(needle) || tag !== 'all';
    empty.hidden = Boolean(shown) || !narrowing;
    // A highlight card above the list is noise while you are hunting for one
    // particular record.
    if (alsoHide) alsoHide.hidden = narrowing;
  }

  input.addEventListener('input', () => {
    query = input.value;
    apply();
  });

  // Directly above the list it filters — which is below the map panel when
  // one is on screen, since searching narrows the list rather than the map.
  const mapPanel = page.querySelector('.map-panel');
  if (mapPanel && mapPanel.nextSibling) page.insertBefore(wrap, mapPanel.nextSibling);
  else if (mapPanel) page.appendChild(wrap);
  else page.insertBefore(wrap, page.firstChild);
  page.appendChild(empty);
}
