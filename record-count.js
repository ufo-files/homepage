/* Read only the catalog header; the complete research dataset is tens of MB. */
const RECORD_CATALOG_URL = 'https://ufo-files.github.io/relationship-graph-builder/data/catalog.json';
const RECORD_HEADER_LIMIT = 16384;

function parseRecordCount(header) {
  const counts = header.match(/"counts"\s*:\s*(\{[^{}]*\})/);
  if (!counts) return null;
  const count = JSON.parse(counts[1]).documents;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid record count');
  return count;
}

async function fetchRecordCount(fetcher = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let reader;
  try {
    const response = await fetcher(RECORD_CATALOG_URL, {
      headers: { Range: `bytes=0-${RECORD_HEADER_LIMIT - 1}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error('Record count unavailable');
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let header = '';
    let bytes = 0;
    while (bytes < RECORD_HEADER_LIMIT) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, RECORD_HEADER_LIMIT - bytes);
      bytes += chunk.byteLength;
      header += decoder.decode(chunk, { stream: true });
      const count = parseRecordCount(header);
      if (count !== null) return count;
    }
    throw new Error('Record count missing from catalog header');
  } finally {
    clearTimeout(timeout);
    if (reader) await reader.cancel().catch(() => {});
    controller.abort();
  }
}

function startRecordCount() {
  const badge = document.getElementById('record-count');
  if (!badge) return;
  let loading = false;
  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    try {
      const count = await fetchRecordCount();
      badge.textContent = `${new Intl.NumberFormat('en-US').format(count)} public records`;
      badge.dataset.state = 'ready';
      badge.title = 'Source records in the latest published UFO Files research catalog. Refreshed every minute.';
    } catch {
      badge.textContent = 'Record count unavailable';
      badge.dataset.state = 'unavailable';
      badge.title = 'The published catalog could not be reached. The count will retry automatically.';
    } finally {
      loading = false;
    }
  }
  badge.textContent = 'Loading record count…';
  badge.dataset.state = 'loading';
  refresh();
  window.setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseRecordCount, fetchRecordCount };
} else {
  startRecordCount();
}
