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

function parseCatalogSummary(header) {
  const start = /"sources"\s*:\s*\[/.exec(header);
  if (!start) return null;
  let quoted = false;
  let escaped = false;
  let depth = 1;
  for (let i = start.index + start[0].length; i < header.length; i += 1) {
    const char = header[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '[') depth += 1;
    else if (char === ']' && --depth === 0) {
      const catalog = JSON.parse(header.slice(0, i + 1) + '}');
      const count = parseRecordCount(header);
      if (count === null || !Number.isFinite(Date.parse(catalog.generatedAt))) throw new Error('Invalid catalog metadata');
      const sources = catalog.sources;
      const validTotal = value => Number.isSafeInteger(value) && value >= 0;
      if (!Array.isArray(sources) || sources.length !== catalog.counts.sources || sources.some(source =>
        typeof source.name !== 'string' || !source.name.trim() || !validTotal(source.documents) || !validTotal(source.words)
      )) throw new Error('Invalid source directory');
      if (sources.reduce((sum, source) => sum + source.documents, 0) !== count) throw new Error('Source totals do not match');
      return { count, generatedAt: catalog.generatedAt, sources };
    }
  }
  return null;
}

async function fetchCatalogHeader(parser, fetcher = fetch) {
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
      const result = parser(header);
      if (result !== null) return result;
    }
    throw new Error('Record count missing from catalog header');
  } finally {
    clearTimeout(timeout);
    if (reader) await reader.cancel().catch(() => {});
    controller.abort();
  }
}

function fetchRecordCount(fetcher = fetch) {
  return fetchCatalogHeader(parseRecordCount, fetcher);
}

// The February 2008 journal moved on 2026-09-27. Group older catalog
// snapshots under its current collection until the next rebuild catches up.
// Build completion timestamps are not input revisions: a later build may
// still contain this old one-record collection. Match the known record totals.
function currentSourceCollections(catalog) {
  const sources = catalog.sources.map(source => ({ ...source }));
  const journal = sources.find(source => source.name === 'MUFON');
  const whitepapers = sources.find(source => source.name === 'Whitepapers');
  if (journal?.documents === 1 && journal.words === 15434 && whitepapers) {
    whitepapers.documents += journal.documents;
    whitepapers.words += journal.words;
    whitepapers.researchSources = ['Whitepapers', 'MUFON'];
    return sources.filter(source => source !== journal);
  }
  return sources;
}

function renderSources(catalog) {
  const body = document.getElementById('sources-body');
  if (!body) return;
  const format = new Intl.NumberFormat('en-US');
  const sources = currentSourceCollections(catalog);
  const signature = JSON.stringify(catalog);
  if (body.dataset.catalog !== signature) {
    const focusedUrl = body.contains(document.activeElement) ? document.activeElement.href : null;
    const rows = sources.sort((a, b) => a.name.localeCompare(b.name)).map(source => {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.scope = 'row';
      const label = source.name.replaceAll('-', ' ');
      const link = document.createElement('a');
      link.textContent = label;
      link.href = `https://github.com/ufo-files/machine-data/tree/main/${encodeURIComponent(source.name)}`;
      name.append(link);
      row.append(name);
      const share = catalog.count ? source.documents / catalog.count * 100 : 0;
      for (const text of [format.format(source.documents), format.format(source.words), share > 0 && share < .1 ? '<0.1%' : `${share.toFixed(1)}%`]) {
        const cell = document.createElement('td');
        cell.className = 'numeric';
        cell.textContent = text;
        row.append(cell);
      }
      const research = document.createElement('td');
      const explore = document.createElement('a');
      const config = JSON.stringify({ type: 'document', allSources: false, sources: source.researchSources || [source.name], titleMode: 'auto' });
      const encoded = btoa(Array.from(new TextEncoder().encode(config), byte => String.fromCharCode(byte)).join(''));
      explore.href = `https://ufo-files.github.io/relationship-graph-builder/#config=${encodeURIComponent(encoded)}`;
      explore.textContent = 'Explore';
      explore.setAttribute('aria-label', `Explore ${label}`);
      research.append(explore);
      row.append(research);
      return row;
    });
    body.replaceChildren(...rows);
    body.dataset.catalog = signature;
    if (focusedUrl) [...body.querySelectorAll('a')].find(link => link.href === focusedUrl)?.focus({ preventScroll: true });
  }
  document.getElementById('sources-caption').textContent = `${sources.length} sources · ${format.format(catalog.count)} records · Catalog published ${new Date(catalog.generatedAt).toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })}`;
  document.getElementById('sources-status').textContent = 'Showing the latest published catalog. Updates automatically.';
}

function startRecordCount() {
  const badge = document.getElementById('record-count');
  if (!badge) return;
  let loading = false;
  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    try {
      const catalog = await fetchCatalogHeader(parseCatalogSummary);
      const count = catalog.count;
      renderSources(catalog);
      badge.textContent = `${new Intl.NumberFormat('en-US').format(count)} public records`;
      badge.dataset.state = 'ready';
      badge.title = 'Source records in the latest published UFO Files research catalog. Refreshed every minute.';
    } catch {
      badge.textContent = 'Record count unavailable';
      badge.dataset.state = 'unavailable';
      const status = document.getElementById('sources-status');
      if (status) status.textContent = 'Live refresh unavailable. Showing the last available catalog snapshot; retrying automatically.';
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
  module.exports = { parseRecordCount, fetchRecordCount, parseCatalogSummary, fetchCatalogHeader, currentSourceCollections };
} else {
  startRecordCount();
}
