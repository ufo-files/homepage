// Run against a local preview: node scripts/test_intro_graph.js http://localhost:8124
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = process.argv[2] || 'http://localhost:8124';
    const snapshot = () => page.locator('.intro-graph svg').evaluate(svg => ({
      nodes: [...svg.querySelectorAll('circle:not(.graph-signal)')].map(node => [node.getAttribute('cx'), node.getAttribute('cy')]),
      edges: [...svg.querySelectorAll('line')].map(edge => [edge.getAttribute('x1'), edge.getAttribute('y1'), edge.getAttribute('x2'), edge.getAttribute('y2')]),
      signals: [...svg.querySelectorAll('.graph-signal')].map(node => [node.getAttribute('cx'), node.getAttribute('cy'), node.getAttribute('opacity')]),
    }));
    await page.goto(url);
    await page.waitForSelector('.intro.graph-ready');
    const start = await snapshot();
    await page.waitForTimeout(800);
    const moving = await snapshot();
    assert.notDeepEqual(start.nodes, moving.nodes);
    assert.notDeepEqual(start.signals, moving.signals);
    const deltas = moving.nodes.map((node, i) => (Number(node[0]) - Number(start.nodes[i][0])).toFixed(2));
    assert(new Set(deltas).size > 10, 'Nodes should move independently');
    for (const edge of moving.edges) {
      assert(moving.nodes.some(node => node[0] === edge[0] && node[1] === edge[1]));
      assert(moving.nodes.some(node => node[0] === edge[2] && node[1] === edge[3]));
    }
    await page.screenshot({ path: '/private/tmp/living-graph-desktop.png' });
    await page.locator('footer').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const paused = await snapshot();
    await page.waitForTimeout(300);
    assert.deepEqual(await snapshot(), paused, 'Offscreen graph should pause');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);
    assert.notDeepEqual(await snapshot(), paused, 'Visible graph should resume');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    const still = await snapshot();
    await page.waitForTimeout(300);
    assert.deepEqual(await snapshot(), still, 'Reduced motion should remain static');
    assert(still.signals.every(signal => signal[2] === '0'));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    assert.notDeepEqual(await snapshot(), still);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '/private/tmp/living-graph-mobile.png' });
    await page.route('**/assets/intro-graph.svg', route => route.abort());
    await page.reload();
    assert.equal(await page.locator('.intro-graph').count(), 0);
    assert.equal(await page.locator('.intro').evaluate(el => getComputedStyle(el, '::before').display), 'block');
    const noJS = await browser.newPage({ javaScriptEnabled: false, reducedMotion: 'reduce' });
    await noJS.goto(url);
    assert.match(await noJS.locator('.intro').evaluate(el => getComputedStyle(el, '::before').backgroundImage), /intro-graph.svg/);
    assert.deepEqual(errors, []);
    console.log('Independent motion, connected edges, signals, offscreen pause/resume, reduced motion, mobile, and static fallbacks passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
