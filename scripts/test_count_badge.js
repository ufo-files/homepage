const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCountBadge } = require('../count-badge.js');

function setup() {
  const nodes = ['records', 'pages'].map(key => ({ dataset: { count: key },
    getBoundingClientRect() { return { width: (this.textContent || '').length * 8 }; },
    classList: { toggle(name, value) { this[name] = value; } },
    setAttribute(name, value) { this[name] = value; } }));
  const items = { style: {} };
  const element = { dataset: {}, querySelector: () => items, querySelectorAll: () => nodes, setAttribute(name, value) { this[name] = value; } };
  let tick;
  let hidden = false;
  const badge = createCountBadge(element, (callback, ms) => { tick = callback; assert.equal(ms, 4000); }, () => hidden);
  return { nodes, items, element, badge, tick: () => tick(), hide: value => { hidden = value; } };
}

test('rotates available counts every four seconds without refreshes resetting selection', () => {
  const { nodes, element, badge, tick } = setup();
  badge.update('records', '200,000 public records', 'Records');
  tick();
  assert.equal(nodes[0].classList['is-active'], true);
  badge.update('pages', '≥5,178,020 document pages', 'Pages');
  assert.equal(nodes[0].classList['is-active'], true);
  tick();
  assert.equal(nodes[1].classList['is-active'], true);
  assert.equal(nodes[0]['aria-hidden'], 'true');
  assert.equal(element.title, 'Pages');
  badge.update('records', '200,001 public records', 'Updated records');
  assert.equal(nodes[1].classList['is-active'], true);
  assert.equal(element['aria-label'], '200,001 public records; ≥5,178,020 document pages');
  tick();
  assert.equal(element.title, 'Updated records');
  assert.equal(nodes[0].classList['is-active'], true);
});

test('sizes to the selected count and remeasures after font or viewport changes', () => {
  const { badge, items, nodes, tick } = setup();
  badge.update('records', '200,000 public records', 'Records');
  const recordsWidth = items.style.width;
  badge.update('pages', '≥5,178,020 document pages', 'Pages');
  assert.equal(items.style.width, recordsWidth);
  tick();
  assert.equal(items.style.width, `${nodes[1].textContent.length * 8}px`);
  assert.notEqual(items.style.width, recordsWidth);
  nodes[1].getBoundingClientRect = () => ({ width: 250 });
  badge.resize();
  assert.equal(items.style.width, '250px');
  tick();
  assert.equal(items.style.width, recordsWidth);
});

test('keeps last values offline, skips unavailable feeds and pauses when hidden', () => {
  const { nodes, element, badge, tick, hide } = setup();
  badge.unavailable('pages');
  assert.equal(element.dataset.state, 'unavailable');
  badge.update('records', '1 public records', 'Records');
  tick();
  assert.equal(nodes[0].classList['is-active'], true);
  badge.update('pages', '2 document pages', 'Pages');
  hide(true);
  tick();
  assert.equal(nodes[0].classList['is-active'], true);
  hide(false);
  tick();
  badge.unavailable('pages');
  assert.equal(element.dataset.state, 'stale');
  assert.equal(nodes[1].textContent, '2 document pages');
});
