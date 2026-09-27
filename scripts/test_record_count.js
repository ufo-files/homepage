const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRecordCount, fetchRecordCount } = require('../record-count.js');

test('formats the document total, including an empty archive, without using entity totals', () => {
  assert.equal(parseRecordCount('{"counts":{"documents":149622,"publishedEntities":1200}}'), 149622);
  assert.equal(parseRecordCount('{"counts":{"documents":0}}'), 0);
  assert.equal(parseRecordCount('{"counts":{"doc'), null);
  for (const value of ['"149622"', '-1', '1.5', 'null', '9007199254740992']) {
    assert.throws(() => parseRecordCount(`{"counts":{"documents":${value}}}`));
  }
});

test('reads a split header and cancels the remaining dataset even if range is ignored', async () => {
  let cancelled = false;
  let request;
  const chunks = ['{"counts":{"doc', 'uments":149622},"documents":['];
  const stream = new ReadableStream({
    pull(controller) {
      if (chunks.length) controller.enqueue(new TextEncoder().encode(chunks.shift()));
    },
    cancel() { cancelled = true; },
  });
  const count = await fetchRecordCount(async (url, options) => {
    request = options;
    return new Response(stream, { status: 200 });
  });
  assert.equal(count, 149622);
  assert.equal(request.headers.Range, 'bytes=0-16383');
  assert.equal(cancelled, true);
});

test('rejects HTTP errors, missing counts, malformed JSON, and oversized headers', async () => {
  for (const response of [
    new Response('unavailable', { status: 503 }),
    new Response('{}'),
    new Response('{"counts":{"documents":NaN}}'),
    new Response(' '.repeat(16384) + '{"counts":{"documents":12}}'),
  ]) {
    await assert.rejects(fetchRecordCount(async () => response));
  }
});

test('source summary handles partial headers and punctuation in source names', () => {
  const { parseCatalogSummary } = require('../record-count.js');
  const catalog = { generatedAt: '2026-09-27T18:21:20Z', counts: { documents: 3, sources: 2 }, sources: [
    { name: 'A ] "quoted" source', documents: 1, words: 20 },
    { name: 'B', documents: 2, words: 40 },
  ] };
  const header = JSON.stringify(catalog);
  assert.equal(parseCatalogSummary(header.slice(0, -3)), null);
  assert.deepEqual(parseCatalogSummary(header), { count: 3, generatedAt: catalog.generatedAt, sources: catalog.sources });
  catalog.sources[0].documents = 5;
  assert.throws(() => parseCatalogSummary(JSON.stringify(catalog)), /totals/);
  catalog.sources[0].documents = 1;
  catalog.sources[0].words = -1;
  assert.throws(() => parseCatalogSummary(JSON.stringify(catalog)), /directory/);
});
