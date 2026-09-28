// Run against a local preview: node scripts/test_source_table.js http://127.0.0.1:8124
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const inventory = require('../source-inventory.json');

(async () => {
  const browser = await chromium.launch();
  try {
    const url = process.argv[2] || 'http://127.0.0.1:8124';
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#sources-body').dataset.catalog);
    assert.equal(await page.locator('.sources-table thead th').count(), 7);
    for (const source of inventory.sources) {
      const row = page.locator('#sources-body tr').filter({ has: page.locator(`th a[href$="/${source.name}"]`) });
      assert.equal(await row.count(), 1);
      assert.equal(await row.locator('td').nth(0).innerText(), source.totalFiles == null ? 'Unavailable' : source.totalFiles.toLocaleString('en-US'));
      assert.equal(await row.locator('.processing-status').innerText(), source.processingComplete ? '✅' : '❌');
    }
    const nara = page.locator('#sources-body tr').filter({ hasText: 'National Archives UAP Bulk' });
    assert(Number((await nara.locator('td').first().innerText()).replaceAll(',', '')) > 100000);
    await nara.scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/private/tmp/source-table-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await nara.scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.locator('.sources-table-scroll').evaluate(el => el.scrollWidth > el.clientWidth));
    await page.screenshot({ path: '/private/tmp/source-table-mobile.png' });
    await page.locator('.sources-table-scroll').evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await page.screenshot({ path: '/private/tmp/source-table-mobile-status.png' });
    await page.route('**/source-inventory.json', route => route.abort());
    await page.reload();
    assert.equal(await page.locator('#sources-body tr').count(), inventory.sources.length);
    assert.equal(await page.locator('#sources-body tr').first().locator('td').count(), 6);
    const noJS = await browser.newPage({ javaScriptEnabled: false });
    await noJS.goto(url);
    assert.equal(await noJS.locator('#sources-body .processing-status').count(), inventory.sources.length);
    assert.deepEqual(errors, []);
    console.log('All source totals/statuses, NARA >100k, responsive table, failed-fetch fallback, and no-JavaScript snapshot passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
