const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const payload={schemaVersion:1,generatedAt:'2026-10-01T01:00:00Z',agents:[
{name:'OCR',metric:'completions',days:[['2026-08-01',0],['2026-08-02',1500],['2026-08-03',3000],['2026-08-04',6000],['2026-08-06',20],['2026-08-07',30]]},
{name:'Transcription',metric:'completions',days:[['2026-08-01',2]]},
{name:'american-alchemy',metric:'signals',days:[['2026-07-31',3],['2026-08-01',6]]}]};
await page.route('**/live-inventory/agent-activity.json*',r=>r.fulfill({json:payload}));
await page.goto('http://127.0.0.1:8131');
await page.locator('#activity-chart polyline').first().waitFor();
assert.equal(await page.locator('#activity-chart circle').count(),0);
assert.equal(await page.locator('#activity-chart polyline').count(),2); // Gap on Aug 5.
const points = await page.locator('#activity-chart polyline').first().getAttribute('points');
const ys = points.split(' ').map(point=>Number(point.split(',')[1]));
assert.deepEqual(ys,[335,92,83,65]); // 0–1500 fills 90%; 1500–6000 fills top 10%.
assert.equal(await page.locator('#activity-chart polyline').first().getAttribute('stroke-linejoin'),'round');
assert.equal(await page.locator('#activity-chart polyline').first().getAttribute('stroke-linecap'),'round');
assert.ok(await page.locator('#activity-log-scale').isDisabled());
assert.match(await page.locator('#activity-rows').textContent(),/6,000/);
assert.match(await page.locator('#activity-status').innerText(),/2026-08-01/);
await page.getByRole('button',{name:'Clear selection'}).click();
assert.equal(await page.locator('#activity-chart circle').count(),0);
await page.getByRole('button',{name:'Show all agents'}).click();
await page.selectOption('#activity-metric','signals');
assert.equal(await page.locator('#activity-chart polyline').count(),1);
assert.equal(await page.locator('#activity-chart circle').count(),0);
assert.match(await page.locator('#activity-status').innerText(),/2026-07-31/);
await page.check('#activity-log-scale');
assert.match(await page.locator('#activity-chart').innerHTML(),/logarithmic scale/);
assert.equal(await page.locator('#activity-chart polyline').count(),1);
assert.equal(await page.locator('#activity-chart circle').count(),0);
await page.locator('#agent-activity').screenshot({path:'/private/tmp/agent-activity-desktop.png'});
await page.setViewportSize({width:390,height:844});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.locator('#agent-activity').screenshot({path:'/private/tmp/agent-activity-mobile.png'});
assert.deepEqual(errors,[]);await browser.close();console.log('Compressed scale, rounded lines, no dots, gaps, controls and mobile layout passed');
})().catch(e=>{console.error(e);process.exit(1)});
