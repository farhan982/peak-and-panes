// Filtering happens in the DOM rather than by re-rendering. A re-render would
// replace the input on every keystroke, which loses focus and the caret — the
// usual fix is to restore both afterwards, but not needing to is simpler and
// does not fight the keyboard on a phone.
export function attachSearch(page, { placeholder, rows, emptyText }) {
  if (!rows.length) return;

  const wrap = document.createElement('div');
  wrap.className = 'search-wrap';
  wrap.innerHTML = `
    <input class="search-input" type="search" inputmode="search"
      placeholder="${placeholder}" autocomplete="off" autocorrect="off" spellcheck="false" />
  `;
  const input = wrap.querySelector('.search-input');

  const empty = document.createElement('p');
  empty.className = 'search-empty';
  empty.textContent = emptyText;
  empty.hidden = true;

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    let shown = 0;
    rows.forEach(({ el, text }) => {
      const match = !query || text.toLowerCase().includes(query);
      el.hidden = !match;
      if (match) shown += 1;
    });
    empty.hidden = Boolean(shown) || !query;
  });

  // Directly above the list it filters — which is below the map panel when
  // one is on screen, since searching narrows the list rather than the map.
  const mapPanel = page.querySelector('.map-panel');
  if (mapPanel && mapPanel.nextSibling) page.insertBefore(wrap, mapPanel.nextSibling);
  else if (mapPanel) page.appendChild(wrap);
  else page.insertBefore(wrap, page.firstChild);
  page.appendChild(empty);
}
