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
  const combined = await renderCount(async (url) => {
    if (url.includes("/releases?")) {
      return response(200, [
        {
          assets: Array.from({ length: 1000 }, (_, index) => ({
            id: index,
            updated_at: "2026-07-14T04:34:19Z",
          })),
        },
        {
          assets: Array.from({ length: 33 }, (_, index) => ({
            id: 1000 + index,
            updated_at: "2026-07-14T04:08:28Z",
          })),
        },
      ]);
    }
    if (url.includes("raw.githubusercontent.com")) {
      return response(200, {
        release_asset_count: 1200,
        generated_utc: "2026-07-14T00:00:00Z",
      });
    }
    return response(200, {
      truncated: false,
      tree: [
        { type: "blob", path: "README.md" },
        { type: "blob", path: "originals/Source/large.zip" },
        { type: "blob", path: "originals/Source/large.pdf" },
      ],
    });
  });
  assert.equal(combined.elements["archive-count"].textContent, "1,035");
  assert.match(combined.elements["archive-count-status"].textContent, /1,033 release assets \+ 2 large files/);

  const unavailable = await renderCount(async (url) => {
    if (url.includes("/releases?")) return response(500, {});
    if (url.includes("raw.githubusercontent.com")) return response(404, {});
    return response(500, {});
  });
  assert.equal(unavailable.elements["archive-count"].textContent, "Unavailable");

  const live = await renderCount(async (url) => {
    if (url.includes("/releases?")) return response(500, {});
    if (url.includes("raw.githubusercontent.com")) return response(404, {});
    return response(200, { truncated: false, tree: [] });
  }, { screenshot: false });
  assert.equal(live.interval.delay, 60 * 1000);
  assert.equal(typeof live.listeners.visibilitychange, "function");

  const fallback = await renderCount(async (url) => {
    if (url.includes("/releases?")) return response(403, {});
    if (url.includes("raw.githubusercontent.com")) {
      return response(200, {
        release_asset_count: 1200,
        generated_utc: "2026-07-14T00:00:00Z",
      });
    }
    return response(200, { truncated: false, tree: [] });
  });
  assert.equal(fallback.elements["archive-count"].textContent, "1,200");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
