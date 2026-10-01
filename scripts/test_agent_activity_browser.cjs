const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:1000}});
await page.clock.install({time:new Date('2026-08-07T12:00:00Z')});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const payload={schemaVersion:1,generatedAt:'2026-10-01T01:00:00Z',agents:[
{name:'OCR',metric:'completions',days:[['2026-06-01',99999],['2026-08-01',0],['2026-08-02',1500],['2026-08-03',3000],['2026-08-04',6000],['2026-08-06',20],['2026-08-07',30]]},
{name:'Transcriptions',metric:'completions',days:[['2026-08-01',2],['2026-08-02',4]]},
{name:'Translations',metric:'completions',days:[['2026-08-01',7],['2026-08-02',9]]},
{name:'Downloaders',metric:'completions',days:[['2026-07-31',3],['2026-08-01',6]]},
{name:'Publisher',metric:'completions',days:[['2026-07-31',1],['2026-08-01',2]]}]};
await page.route('**/live-inventory/agent-activity.json*',r=>r.fulfill({json:payload}));
await page.goto('http://127.0.0.1:8131');
await page.locator('#activity-chart path[data-agent=OCR]').first().waitFor();
assert.equal(await page.locator('#activity-chart circle').count(),0);
assert.equal(await page.locator('#activity-chart pattern, #activity-chart [data-fill-agent], #activity-agents rect').count(),0);
assert.equal(await page.locator('#activity-chart path[data-agent=OCR]').count(),2); // Gap on Aug 5.
assert.equal(await page.locator('#activity-chart path[data-agent]').count(),6);
assert.deepEqual(await page.locator('#activity-chart path[data-agent]').evaluateAll(paths=>[...new Set(paths.map(p=>p.getAttribute('stroke')))]),['currentColor']);
assert.deepEqual(await page.locator('#activity-agents .activity-legend-item').allTextContents(),['Translations','Transcriptions','OCR','Downloaders','Publisher']);
const path = await page.locator('#activity-chart path[data-agent=OCR]').first().getAttribute('d');
assert.match(path,/ C /);
const ys = path.split(/ [MC] |^M /).filter(Boolean).map(segment=>Number(segment.trim().split(' ').at(-1).split(',')[1]));
assert.equal(ys[0],335); assert.equal(ys.at(-1),65); // Trailing averages 0,750,1500,3500; 0–250 fills 50%; 250–1500 fills 40%.
assert.equal(await page.locator('#activity-chart path[data-agent=OCR]').first().getAttribute('stroke-linejoin'),'round');
assert.equal(await page.locator('#activity-chart path[data-agent=OCR]').first().getAttribute('stroke-linecap'),'round');
const bounds = await page.locator('#activity-chart path[data-agent=OCR]').first().evaluate(path => {
  const values = Array.from({length:1001}, (_,i)=>path.getPointAtLength(path.getTotalLength()*i/1000).y);
  return [Math.min(...values),Math.max(...values)];
});
assert.ok(bounds[0]>=65-0.001 && bounds[1]<=335+0.001, 'Curve must not overshoot recorded values');
assert.equal(await page.locator('#activity-chart text').filter({hasText:'Smoothed 3-day average'}).count(),0);
const ticks=await page.locator('#activity-chart text[text-anchor=end]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.textContent,Number(n.getAttribute('y'))-5])));
assert.equal(ticks['0'],335);
assert.equal(ticks['250'],200); // Half of the 270px plot.
assert.equal(ticks['1,500'],92); // Top 10% starts here.
assert.equal(ticks['500'],178.4);
assert.equal(await page.locator('[data-series-label]').count(),5);
assert.equal(new Set(await page.locator('#activity-chart path[data-agent]').evaluateAll(paths=>paths.map(p=>p.getAttribute('stroke-dasharray')))).size,5);
assert.match(await page.locator('#activity-svg-desc').textContent(),/recorded completions/);
assert.equal(await page.locator('#agent-activity button, #agent-activity input, #agent-activity select, #agent-activity table, #agent-activity details').count(),0);
const afterGap = await page.locator('#activity-chart path[data-agent=OCR]').nth(1).getAttribute('d');
assert.ok(afterGap.startsWith('M '));
assert.equal(Number(afterGap.split(' ')[1].split(',')[1]),335-.5*20/250*270); // No averaging across missing days.
assert.equal(await page.locator('#activity-status').isVisible(),false);
assert.equal(await page.locator('#activity-title').innerText(),'PROJECT ACTIVITY');
assert.match(await page.locator('#activity-chart').textContent(),/2026-07-07/);
await page.locator('#agent-activity').screenshot({path:'/private/tmp/agent-activity-desktop.png'});
await page.setViewportSize({width:390,height:844});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
assert.ok(await page.locator('#activity-chart svg').evaluate(svg=>12*svg.getBoundingClientRect().width/1100)>=12,'Mobile chart labels must remain at least 12px');
await page.locator('#agent-activity').screenshot({path:'/private/tmp/agent-activity-mobile.png'});
assert.deepEqual(errors,[]);await browser.close();console.log('Compressed scale, rounded lines, no dots, gaps, controls and mobile layout passed');
})().catch(e=>{console.error(e);process.exit(1)});
