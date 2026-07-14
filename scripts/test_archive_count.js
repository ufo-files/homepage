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
  const standardTree = [
    { type: "blob", path: "README.md" },
    ...Array.from({ length: 11 }, (_, index) => ({
      type: "blob",
      path: `originals/AARO-UAP-Records/pdfs/source-${index}.pdf`,
    })),
    { type: "blob", path: "originals/AARO-UAP-Records/manifest.json" },
    { type: "blob", path: "originals/AARO-UAP-Records/metadata/manifest.json" },
    { type: "blob", path: "originals/Black-Vault-UFO/audio/radio.wav" },
    { type: "blob", path: "originals/Black-Vault-UFO/documents/report.txt" },
    { type: "blob", path: "originals/Black-Vault-UFO/pdfs/report.pdf" },
    { type: "blob", path: "originals/Black-Vault-UFO/zips/convenience.zip" },
    { type: "blob", path: "originals/DPIArchive/documents/source.pdf" },
    { type: "blob", path: "originals/DPIArchive/pdfs/source.pdf" },
    { type: "blob", path: "originals/FBI-Vault-UFO/pdfs/ufo-part-01.pdf" },
    { type: "blob", path: "originals/FBI-Vault-UFO/documents/ufo-part-01.pdf" },
    { type: "blob", path: "originals/American-Alchemy/videos/excluded.mp4" },
  ];
  const largeTree = [
    { type: "blob", path: "originals/Black-Vault-UFO/pdfs/large.pdf" },
    { type: "blob", path: "originals/War-Gov-PURSUE/release-01/videos/large.mp4" },
    { type: "blob", path: "originals/Black-Vault-UFO/zips/convenience.zip" },
  ];

  const combined = await renderCount(async (url) => {
    const tree = url.includes("data-archive-large-files") ? largeTree : standardTree;
    return response(200, { truncated: false, tree });
  });
  assert.equal(combined.elements["archive-count"].textContent, "18");
  assert.match(combined.elements["archive-count-status"].textContent, /16 standard files \+ 2 large files/);

  const unavailable = await renderCount(async () => response(500, {}));
  assert.equal(unavailable.elements["archive-count"].textContent, "Unavailable");
  assert.match(unavailable.elements["archive-count-status"].textContent, /temporarily unavailable/);

  const live = await renderCount(
    async () => response(200, { truncated: false, tree: [] }),
    { screenshot: false },
  );
  assert.equal(live.interval.delay, 2 * 60 * 1000);
  assert.equal(typeof live.listeners.visibilitychange, "function");

  const rateLimitedLargeRepo = await renderCount(async (url) => {
    if (url.includes("data-archive-large-files")) return response(403, {});
    return response(200, {
      truncated: false,
      tree: [{ type: "blob", path: "originals/AARO-UAP-Records/pdfs/source.pdf" }],
    });
  });
  assert.equal(rateLimitedLargeRepo.elements["archive-count"].textContent, "1");
  assert.match(rateLimitedLargeRepo.elements["archive-count-status"].textContent, /1 standard files \+ 0 large files/);

  const truncated = await renderCount(async (url) => {
    if (url.includes("data-archive-large-files")) {
      return response(200, { truncated: false, tree: [] });
    }
    return response(200, { truncated: true, tree: standardTree });
  });
  assert.equal(truncated.elements["archive-count"].textContent, "Unavailable");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
