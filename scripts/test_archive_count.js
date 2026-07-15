const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(new URL("../script.js", `file://${__filename}`), "utf8");

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

async function renderCount(fetch, { screenshot = true } = {}) {
  const context2d = new Proxy({}, { get: () => () => {} });
  const listeners = {};
  let interval = null;
  const elements = {
    field: { getContext: () => context2d, style: {} },
    "archive-count": { textContent: "Loading" },
    "archive-count-status": { textContent: "Loading" },
  };
  const window = {
    devicePixelRatio: 1,
    innerWidth: 1200,
    innerHeight: 800,
    location: { search: screenshot ? "?screenshot" : "" },
    matchMedia: () => ({ matches: true }),
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
      addEventListener: (name, callback) => {
        listeners[name] = callback;
      },
    },
    fetch,
    Intl,
    URLSearchParams,
    window,
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, interval, listeners };
}

async function main() {
  const liveCount = await renderCount(async () => response(200, {
    count: 1675,
    generated_utc: "2026-07-15T01:30:00Z",
  }));
  assert.equal(liveCount.elements["archive-count"].textContent, "1,675");
  assert.match(liveCount.elements["archive-count-status"].textContent, /Live Data Archive index/);
  assert.match(liveCount.elements["archive-count-status"].textContent, /July 15, 2026/);

  const unavailable = await renderCount(async () => response(500, {}));
  assert.equal(unavailable.elements["archive-count"].textContent, "Unavailable");
  assert.match(unavailable.elements["archive-count-status"].textContent, /temporarily unavailable/);

  const live = await renderCount(
    async () => response(200, { truncated: false, tree: [] }),
    { screenshot: false },
  );
  assert.equal(live.interval.delay, 2 * 60 * 1000);
  assert.equal(typeof live.listeners.visibilitychange, "function");

  const malformed = await renderCount(async () => response(200, { count: "1675" }));
  assert.equal(malformed.elements["archive-count"].textContent, "Unavailable");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
