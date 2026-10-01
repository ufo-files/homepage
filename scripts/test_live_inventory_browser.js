const assert = require('node:assert/strict');
const {chromium} = require('@playwright/test');
(async () => {
 const browser = await chromium.launch();
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  let total=141;
  const stamp=()=>new Date().toISOString();
  await page.route('**/data/catalog.json', route=>route.fulfill({json:{generatedAt:stamp(),counts:{documents:141,sources:1},sources:[{name:'American-Alchemy',documents:141,words:1000}]}}));
  await page.route('**/live-inventory/source-inventory.json?*', route=>route.fulfill({json:{schema:'ufo-files-source-inventory/v1',generatedAt:stamp(),sources:[{name:'American-Alchemy',totalFiles:total,verifiedProcessedFiles:total,processingComplete:true,checkedAt:stamp()}]}}));
  await page.goto('http://127.0.0.1:8127');
  const count=page.locator('#sources-body tr td').first();
  await count.waitFor();
  await page.waitForFunction(()=>document.querySelector('#sources-body')?.dataset.catalog);
  assert.equal(await count.innerText(),'141');
  total=142;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(()=>document.querySelector('#sources-body tr td').textContent==='142');
  assert.equal(await page.locator('.processing-status').innerText(),'✅');
  await page.locator('#sources').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/private/tmp/live-inventory-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'/private/tmp/live-inventory-mobile.png'});
  await page.unroute('**/live-inventory/source-inventory.json?*');
  await page.route('**/live-inventory/source-inventory.json?*', route=>route.abort());
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(()=>document.querySelector('#sources-status').textContent.includes('Live archive update unavailable'));
  assert.equal(await count.innerText(),'142');
  console.log('Live row refresh, failure retention, and responsive layout passed');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
