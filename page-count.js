'use strict';

const PAGE_COUNT_URL = 'https://raw.githubusercontent.com/ufo-files/machine-data/main/.github/badges/page-count.json';

function parsePageCount(data) {
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  if (data?.schema !== 'ufo-files-page-count/v1' || !Number.isFinite(Date.parse(data.updatedAt)) ||
      !integer(data.pages) || !integer(data.uncountedFiles)) throw new Error('Invalid page count');
  for (const kind of ['pdf', 'tiff']) {
    const part = data[kind];
    if (!part || !['files', 'countedFiles', 'pages'].every(key => integer(part[key])) ||
        part.countedFiles > part.files) throw new Error('Invalid format totals');
  }
  if (data.pages !== data.pdf.pages + data.tiff.pages ||
      data.uncountedFiles !== data.pdf.files + data.tiff.files - data.pdf.countedFiles - data.tiff.countedFiles) {
    throw new Error('Inconsistent page count');
  }
  return data;
}

function startPageCount() {
  const badge = document.getElementById('page-count');
  if (!badge) return;
  let loading = false;
  let last = null;
  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    try {
      const response = await fetch(PAGE_COUNT_URL, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Page count unavailable');
      last = parsePageCount(await response.json());
      badge.textContent = `${last.uncountedFiles ? '≥' : ''}${new Intl.NumberFormat('en-US').format(last.pages)} document pages`;
      badge.hidden = false;
      badge.dataset.state = 'ready';
      badge.title = `Downloaded PDF and TIFF pages. Counted ${new Date(last.updatedAt).toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })}.${last.uncountedFiles ? ` ${last.uncountedFiles} files remain uncounted.` : ''}`;
    } catch {
      // Keep the last measurement visible, including its original timestamp.
      badge.dataset.state = last ? 'stale' : 'unavailable';
    } finally {
      loading = false;
    }
  }
  refresh();
  window.setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parsePageCount, startPageCount };
} else {
  startPageCount();
}
