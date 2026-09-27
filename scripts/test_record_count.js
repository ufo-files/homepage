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
