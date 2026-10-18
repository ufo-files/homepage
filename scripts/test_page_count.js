const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePageCount, startPageCount } = require('../page-count.js');

const summary = { schema: 'ufo-files-page-count/v1', updatedAt: '2026-10-18T20:27:24Z', pages: 5178020, uncountedFiles: 45,
  pdf: { files: 122774, countedFiles: 122729, pages: 5166060 }, tiff: { files: 9893, countedFiles: 9893, pages: 11960 } };

test('accepts a lower bound and rejects inconsistent or invalid totals', () => {
  assert.deepEqual(parsePageCount(summary), summary);
  for (const change of [{ pages: -1 }, { pages: '5178020' }, { pages: 1 }, { uncountedFiles: 0 }, { updatedAt: 'bad' }, { pdf: { files: 1, countedFiles: 2, pages: 5166060 } }]) {
    assert.throws(() => parsePageCount({ ...summary, ...change }));
  }
});

test('refreshes independently and preserves the last measurement on failure', async () => {
  const saved = { document: global.document, window: global.window, fetch: global.fetch };
  const badge = { update(key, text, title) { this.key = key; this.textContent = text; this.title = title; this.state = 'ready'; }, unavailable() { this.state = 'stale'; } };
  let refresh;
  global.document = { hidden: false, getElementById: () => badge, addEventListener() {} };
  global.window = { corpusCountBadge: badge, setInterval(callback, interval) { refresh = callback; assert.equal(interval, 60000); } };
  global.fetch = async () => ({ ok: true, json: async () => summary });
  try {
    startPageCount();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(badge.textContent, '≥5,178,020 document pages');
    assert.equal(badge.key, 'pages');
    const title = badge.title;
    global.fetch = async () => { throw new Error('offline'); };
    await refresh();
    assert.equal(badge.textContent, '≥5,178,020 document pages');
    assert.equal(badge.title, title);
    assert.equal(badge.state, 'stale');
    global.fetch = async () => ({ ok: true, json: async () => ({ ...summary, pages: 5178021, pdf: { ...summary.pdf, pages: 5166061 } }) });
    await refresh();
    assert.equal(badge.textContent, '≥5,178,021 document pages');
  } finally {
    Object.assign(global, saved);
  }
});
