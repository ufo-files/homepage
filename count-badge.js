'use strict';

function createCountBadge(badge, schedule, isHidden) {
  const nodes = [...badge.querySelectorAll('[data-count]')];
  const values = new Map();
  let active = null;

  function render() {
    const available = nodes.filter(node => values.has(node.dataset.count));
    if (!values.has(active)) active = available[0]?.dataset.count || null;
    if (!active) {
      nodes[0].textContent = 'Counts unavailable';
      badge.dataset.state = 'unavailable';
      badge.setAttribute('aria-label', 'Counts unavailable');
    }
    for (const node of nodes) {
      const selected = active ? node.dataset.count === active : node === nodes[0];
      node.classList.toggle('is-active', selected);
      node.setAttribute('aria-hidden', String(!selected));
    }
    if (active) {
      const value = values.get(active);
      badge.title = value.title;
      badge.dataset.state = value.state;
      badge.setAttribute('aria-label', available.map(node => values.get(node.dataset.count).text).join('; '));
    }
  }

  schedule(() => {
    if (isHidden()) return;
    const available = nodes.filter(node => values.has(node.dataset.count));
    if (available.length < 2) return;
    active = available[(available.findIndex(node => node.dataset.count === active) + 1) % available.length].dataset.count;
    render();
  }, 4000);

  return {
    update(key, text, title) {
      const node = nodes.find(node => node.dataset.count === key);
      if (!node) return;
      values.set(key, { text, title, state: 'ready' });
      node.textContent = text;
      render();
    },
    unavailable(key) {
      if (values.has(key)) values.get(key).state = 'stale';
      render();
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createCountBadge };
} else {
  const badge = document.getElementById('record-count');
  if (badge) window.corpusCountBadge = createCountBadge(badge, window.setInterval.bind(window), () => document.hidden);
}
