const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const payload={schemaVersion:1,generatedAt:'2026-10-01T01:00:00Z',agents:[
{name:'OCR',metric:'completions',days:[['2026-08-01',12],['2026-08-02',20],['2026-08-04',4]]},
{name:'Transcription',metric:'completions',days:[['2026-08-01',2]]},
{name:'american-alchemy',metric:'signals',days:[['2026-07-31',3],['2026-08-01',6]]}]};
await page.route('**/live-inventory/agent-activity.json*',r=>r.fulfill({json:payload}));
await page.goto('http://127.0.0.1:8131');
await page.locator('#activity-chart circle').first().waitFor();
assert.equal(await page.locator('#activity-chart circle').count(),4);
// Five gridlines plus just one consecutive-day connection. No fabricated bridge over Aug 3.
assert.equal(await page.locator('#activity-chart line').count(),6);
assert.match(await page.locator('#activity-status').innerText(),/2026-08-01/);
await page.getByRole('button',{name:'Clear selection'}).click();
assert.equal(await page.locator('#activity-chart circle').count(),0);
await page.getByRole('button',{name:'Show all agents'}).click();
await page.selectOption('#activity-metric','signals');
assert.equal(await page.locator('#activity-chart circle').count(),2);
assert.match(await page.locator('#activity-status').innerText(),/2026-07-31/);
await page.check('#activity-log-scale');
assert.match(await page.locator('#activity-chart').innerHTML(),/logarithmic scale/);
assert.equal(await page.locator('#activity-chart circle').count(),2);
await page.locator('#agent-activity').screenshot({path:'/private/tmp/agent-activity-desktop.png'});
await page.setViewportSize({width:390,height:844});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.locator('#agent-activity').screenshot({path:'/private/tmp/agent-activity-mobile.png'});
assert.deepEqual(errors,[]);await browser.close();console.log('Chart dates, exact counts, gaps, controls and mobile layout passed');
})().catch(e=>{console.error(e);process.exit(1)});
