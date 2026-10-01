const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:900}});
 const now=Date.parse('2026-10-01T12:00:00Z');await page.clock.install({time:new Date(now)});
 let payload={schemaVersion:2,generatedAt:new Date(now).toISOString(),validForSeconds:900,groups:[
  {name:'Translations',observations:[[now/1000-60,'idle',{idle:2}]]},
  {name:'Transcriptions',observations:[[now/1000-60,'running',{running:1}]]},
  {name:'OCR',observations:[[now/1000-3600,'running',{running:1}],[now/1000-60,'running',{running:1}]]},
  {name:'Downloaders',observations:[[now/1000-60,'blocked',{blocked:2,running:1}]]},
  {name:'Publisher',observations:[[now/1000-60,'offline',{offline:1}]]}]};
 await page.route('**/agent-health.json*',route=>route.fulfill({json:payload}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8131');await page.locator('[data-series-label="Downloaders"]').waitFor();
 assert.equal(await page.locator('[data-series-label]').count(),5);
 assert.match(await page.locator('[data-series-label="Downloaders"]').textContent(),/Blocked \/ retryingOthers running/);
 assert.match(await page.locator('[data-series-label="Translations"]').textContent(),/^Idle · healthy/);
 assert.match(await page.locator('[data-series-label="Publisher"]').textContent(),/^Offline/);
 assert.equal(await page.locator('#activity-chart circle, #activity-operations, #activity-freshness').count(),0);
 const spans=await page.locator('[data-agent="OCR"] line[data-state]').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('x2'))-Number(n.getAttribute('x1'))));
 assert.equal(spans.length,2);assert.ok(spans.every(w=>w<=730*900/86400+.01),'No interpolation over unknown history');
 await page.locator('[data-series-label="OCR"]').hover();assert.equal(await page.locator('[data-agent="Downloaders"]').evaluate(n=>n.style.opacity),'0.2');
 await page.mouse.move(0,0);assert.equal(await page.locator('[data-agent="Downloaders"]').evaluate(n=>n.style.opacity),'1');
 await page.locator('[data-series-label="OCR"]').focus();assert.equal(await page.locator('[data-agent="Downloaders"]').evaluate(n=>n.style.opacity),'0.2');
 await page.locator('#agent-activity').screenshot({path:'/private/tmp/agent-health-desktop.png'});
 await page.clock.fastForward(16*60000);
 await page.waitForFunction(()=>document.querySelector('[data-series-label="OCR"]').textContent.startsWith('Unknown'));
 assert.ok((await page.locator('[data-series-label]').allTextContents()).every(t=>t.startsWith('Unknown')),'Stale health cannot remain green/running');
 const newNow=now+16*60000;payload.generatedAt=new Date(newNow).toISOString();payload.groups[3].observations.push([newNow/1000,'running',{running:1}]);
 await page.clock.fastForward(60000);
 await page.waitForFunction(()=>document.querySelector('[data-series-label="Downloaders"]').textContent.startsWith('Running'));
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#agent-activity').screenshot({path:'/private/tmp/agent-health-mobile.png'});
 assert.deepEqual(errors,[]);await browser.close();console.log('Health states, mixed groups, missing history, expiry, live refresh, keyboard and mobile checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
