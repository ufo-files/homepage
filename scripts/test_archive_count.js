const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(new URL("../script.js", `file://${__filename}`), "utf8");
const html = fs.readFileSync(new URL("../index.html", `file://${__filename}`), "utf8");
assert.match(source, /ufo-files\.github\.io\/relationship-graph\/data/);
assert.match(html, /script\.js\?v=research-infrastructure-20260723/);
assert.match(html, /An open research index of the UAP record/);
assert.doesNotMatch(html, /Dog Whistle|rabbit hole|Trust no one|Fides Soli Veritati/);

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

async function renderMetrics(fetch, { screenshot = true, random = 0 } = {}) {
  const context2d = new Proxy({}, { get: () => () => {} });
  const listeners = {};
  let interval = null;
  const elements = {
    field: { getContext: () => context2d, style: {} },
    "metric-sources": { textContent: "Loading" },
    "metric-entities": { textContent: "Loading" },
    "metric-relationships": { textContent: "Loading" },
    "metric-mentions": { textContent: "Loading" },
    "metric-needs-review": { textContent: "Loading" },
    "metric-last-build": { textContent: "Loading" },
    "health-reviewed": { textContent: "Loading" },
    "health-accepted": { textContent: "Loading" },
    "health-needs-review": { textContent: "Loading" },
    "health-provenance": { textContent: "Loading" },
    "health-invalid": { textContent: "Loading" },
    "corpus-status": { textContent: "Loading" },
    announcement: { textContent: "" },
  };
  const window = {
    devicePixelRatio: 1,
    innerWidth: 1200,
    innerHeight: 800,
    location: { search: screenshot ? "?screenshot" : "", href: "" },
    matchMedia: () => ({ matches: true, addEventListener: () => {} }),
    addEventListener: () => {},
    setInterval: (callback, delay) => {
      interval = { callback, delay };
      return 1;
    },
  };
  vm.runInNewContext(source, {
    console,
    document: {
      hidden: false,
      getElementById: (id) => elements[id] || null,
      querySelector: (selector) => selector === ".announcement-banner p" ? elements.announcement : null,
      addEventListener: (name, callback) => {
        listeners[name] = callback;
      },
    },
    fetch,
    Intl,
    Math: Object.assign(Object.create(Math), { random: () => random }),
    URLSearchParams,
    window,
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, interval, listeners };
}

async function main() {
  const requests = [];
  const liveMetrics = await renderMetrics(async (url) => {
    requests.push(url);
    if (url.includes("classification-decisions")) {
      return response(200, { summary: { reviewed_entities: 120, accepted_entities: 84, needs_review: 7, invalid_references: 2 } });
    }
    return response(200, {
      generated_utc: "2026-07-15T01:30:00Z",
      counts: {
        sources: 5774,
        entities: 89717,
        relationships: 448312,
        mentions: 596630,
        relationships_with_evidence: 448310,
      },
    });
  });
  assert.ok(requests.some((url) => url.includes("manifest.json")));
  assert.equal(liveMetrics.elements["metric-sources"].textContent, "5,774");
  assert.equal(liveMetrics.elements["metric-entities"].textContent, "89,717");
  assert.equal(liveMetrics.elements["metric-relationships"].textContent, "448,312");
  assert.equal(liveMetrics.elements["metric-mentions"].textContent, "596,630");
  assert.equal(liveMetrics.elements["metric-needs-review"].textContent, "7");
  assert.equal(liveMetrics.elements["metric-last-build"].textContent, "Jul 15, 2026");
  assert.equal(liveMetrics.elements["health-reviewed"].textContent, "120");
  assert.equal(liveMetrics.elements["health-accepted"].textContent, "84");
  assert.equal(liveMetrics.elements["health-provenance"].textContent, "100%");
  assert.equal(liveMetrics.elements["health-invalid"].textContent, "2");
  assert.equal(liveMetrics.elements.announcement.textContent, "Open-source infrastructure for research into the UAP record.");

  const announcementMessages = [
    "Open-source infrastructure for research into the UAP record.",
    "Evidence-linked public research infrastructure.",
    "Source-centric, inspectable, and reproducible.",
  ];
  for (const [index, expected] of announcementMessages.entries()) {
    const rendered = await renderMetrics(async () => response(500, {}), {
      screenshot: false,
      random: (index + 0.5) / announcementMessages.length,
    });
    assert.equal(rendered.elements.announcement.textContent, expected);
  }

  const unavailable = await renderMetrics(async () => response(500, {}));
  assert.equal(unavailable.elements["metric-sources"].textContent, "Unavailable");
  assert.match(unavailable.elements["corpus-status"].textContent, /temporarily unavailable/);

  const live = await renderMetrics(async () => response(200, { counts: {} }), { screenshot: false });
  assert.equal(live.interval.delay, 60 * 1000);
  assert.equal(typeof live.listeners.visibilitychange, "function");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
