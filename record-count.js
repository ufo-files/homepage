/* Read only the catalog header; the complete research dataset is tens of MB. */
const RECORD_CATALOG_URL = 'https://ufo-files.github.io/relationship-graph-builder/data/catalog.json';
const RECORD_HEADER_LIMIT = 16384;
const SOURCE_INVENTORY_URL = 'https://raw.githubusercontent.com/ufo-files/homepage/live-inventory/source-inventory.json';

async function fetchSourceInventory(fetcher = fetch) {
  const response = await fetcher(`${SOURCE_INVENTORY_URL}?minute=${Math.floor(Date.now() / 60000)}`, {
    cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Live archive inventory unavailable');
  return parseSourceInventory(await response.json());
}

function pendingResearchLabel(source) {
  return source?.processingComplete === true ? 'Awaiting search indexing' : 'Not yet searchable';
}

function databaseCoverageUnverified(source) {
  return source?.extensions?.['.gz'] > 0 && source.verifiedProcessedFiles === 0 && source.outputFiles > 0;
}

function processingStatus(source) {
  if (source?.totalFiles == null) return 'Inventory unavailable';
  if (!source.totalFiles) return 'No archived files';
  if (source.processingComplete === true) return 'Verified complete';
  if (source.outputReadErrors > 0) return 'Verification errors';
  if (source.verifiedProcessedFiles == null || databaseCoverageUnverified(source)) return 'Verification needed';
  return 'Coverage incomplete';
}

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

function parseSourceInventory(inventory) {
  if (inventory?.schema !== 'ufo-files-source-inventory/v1' || !Number.isFinite(Date.parse(inventory.generatedAt)) ||
      !Array.isArray(inventory.sources) || inventory.sources.some(source =>
        typeof source.name !== 'string' ||
        !(source.totalFiles === null || (Number.isSafeInteger(source.totalFiles) && source.totalFiles >= 0)) ||
        typeof source.processingComplete !== 'boolean' ||
        (source.processingComplete && (!source.totalFiles || source.verifiedProcessedFiles !== source.totalFiles)))) {
    throw new Error('Invalid archive inventory');
  }
  return inventory;
}

function sourceCollectionsWithInventory(catalog, inventory) {
  const sources = currentSourceCollections(catalog);
  const published = new Set(sources.map(source => source.name));
  for (const source of inventory.sources) {
    if (!published.has(source.name)) {
      sources.push({ name: source.name, documents: 0, words: 0, awaitingProcessing: true });
      published.add(source.name);
    }
  }
  return sources;
}

function renderSources(catalog, inventory) {
  const body = document.getElementById('sources-body');
  if (!body || !inventory) return;
  const format = new Intl.NumberFormat('en-US');
  const sources = sourceCollectionsWithInventory(catalog, inventory);
  const signature = JSON.stringify([catalog, inventory, Math.floor(Date.now() / 3600000)]);
  if (body.dataset.catalog !== signature) {
    const focusedUrl = body.contains(document.activeElement) ? document.activeElement.href : null;
    const rows = sources.sort((a, b) => a.name.localeCompare(b.name)).map(source => {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.scope = 'row';
      const label = source.name.replaceAll('-', ' ');
      const link = document.createElement(source.awaitingProcessing ? 'span' : 'a');
      link.textContent = label;
      if (!source.awaitingProcessing) link.href = `https://github.com/ufo-files/machine-data/tree/main/${encodeURIComponent(source.name)}`;
      name.append(link);
      row.append(name);
      const archived = inventory.sources.find(item => item.name === source.name);
      const total = document.createElement('td');
      total.className = 'numeric';
      total.textContent = archived?.totalFiles == null ? 'Unavailable' : format.format(archived.totalFiles);
      row.append(total);
      const share = catalog.count ? source.documents / catalog.count * 100 : 0;
      for (const text of [format.format(source.documents), format.format(source.words), share > 0 && share < .1 ? '<0.1%' : `${share.toFixed(1)}%`]) {
        const cell = document.createElement('td');
        cell.className = 'numeric';
        cell.textContent = text;
        row.append(cell);
      }
      const complete = document.createElement('td');
      complete.className = 'processing-status';
      const checkedAt = archived?.checkedAt || inventory.generatedAt;
      total.title = `Archive checked ${checkedAt}`;
      const status = processingStatus(archived);
      const labelStatus = document.createElement('strong');
      labelStatus.textContent = status;
      complete.append(labelStatus);
      const detail = document.createElement('small');
      detail.textContent = archived?.totalFiles == null ? 'No current archive count available.' :
        databaseCoverageUnverified(archived) ?
          `${format.format(archived.outputFiles)} output files from a database export; record coverage not verified.` :
        archived.verifiedProcessedFiles == null ?
          `${format.format(archived.outputFiles || 0)} output files; source coverage not verified.` :
          `${format.format(archived.verifiedProcessedFiles)} / ${format.format(archived.totalFiles)} archived files verified.`;
      complete.append(detail);
      if (archived?.outputReadErrors > 0) {
        const errors = document.createElement('small');
        errors.textContent = `${format.format(archived.outputReadErrors)} output files could not be read.`;
        complete.append(errors);
      }
      const checked = document.createElement('small');
      if (archived) {
        const date = new Date(checkedAt);
        const stale = Date.now() - date.getTime() > 48 * 60 * 60 * 1000;
        checked.textContent = `Checked ${date.toISOString().slice(0, 10)} UTC${stale ? ' · over 48 hours old' : ''}`;
        checked.title = checkedAt;
      } else checked.textContent = 'No inventory check recorded.';
      complete.append(checked);
      row.append(complete);
      const research = document.createElement('td');
      const explore = document.createElement('a');
      const config = JSON.stringify({ type: 'document', allSources: false, sources: source.researchSources || [source.name], titleMode: 'auto' });
      const encoded = btoa(Array.from(new TextEncoder().encode(config), byte => String.fromCharCode(byte)).join(''));
      explore.href = `https://ufo-files.github.io/relationship-graph-builder/#config=${encodeURIComponent(encoded)}`;
      explore.textContent = 'Explore';
      explore.setAttribute('aria-label', `Explore ${label}`);
      if (source.awaitingProcessing) research.textContent = pendingResearchLabel(archived);
      else research.append(explore);
      row.append(research);
      return row;
    });
    body.replaceChildren(...rows);
    body.dataset.catalog = signature;
    if (focusedUrl) [...body.querySelectorAll('a')].find(link => link.href === focusedUrl)?.focus({ preventScroll: true });
  }
  const summary = document.getElementById('sources-summary');
  if (summary) {
    const complete = sources.filter(source => inventory.sources.some(row => row.name === source.name && row.processingComplete)).length;
    summary.textContent = `${complete} of ${sources.length} collections have verified outputs for every archived file. Remaining collections have incomplete or unverified coverage. These checks do not indicate whether a worker is running.`;
  }
  document.getElementById('sources-caption').textContent = `${sources.length} sources · ${format.format(catalog.count)} records · Catalog published ${new Date(catalog.generatedAt).toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })}`;
}

function startRecordCount() {
  const badge = window.corpusCountBadge;
  if (!badge) return;
  let loading = false;
  let inventory = null;
  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    try {
      const [catalog, latestInventory] = await Promise.all([
        fetchCatalogHeader(parseCatalogSummary),
        fetchSourceInventory().catch(() => null),
      ]);
      if (latestInventory) inventory = latestInventory;
      const status = document.getElementById('sources-status');
      if (status) status.textContent = latestInventory ?
        `Live inventory retrieved. Latest source check: ${new Date(latestInventory.generatedAt).toISOString()}. Each collection shows its own check date; checks older than 48 hours are flagged.` :
        'Live archive update unavailable. Showing the last available inventory; check dates remain visible.';
      const count = catalog.count;
      renderSources(catalog, inventory);
      badge.update('records', `${new Intl.NumberFormat('en-US').format(count)} public records`,
        'Source records in the latest published UFO Files research catalog. Refreshed every minute.');
    } catch {
      const status = document.getElementById('sources-status');
      if (status) status.textContent = 'Live catalog update unavailable. Showing the last available snapshot; check dates remain visible.';
      badge.unavailable('records');
    } finally {
      loading = false;
    }
  }
  refresh();
  window.setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pendingResearchLabel, fetchSourceInventory, processingStatus, parseRecordCount, fetchRecordCount, parseCatalogSummary, fetchCatalogHeader, currentSourceCollections, sourceCollectionsWithInventory, parseSourceInventory };
} else {
  startRecordCount();
}
