const { chromium } = require("@playwright/test");
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "docs", "pr-screenshots");
const VIEWPORTS = [
  { name: "homepage-redesign-desktop", width: 1440, height: 1000 },
  { name: "homepage-redesign-tablet", width: 900, height: 1100 },
  { name: "homepage-redesign-mobile", width: 390, height: 1200 },
];

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function startServer(port) {
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => process.stdout.write(`[server] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));
  return server;
}

async function waitForServer(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1", () => {
          socket.end();
          resolve();
        });
        socket.on("error", reject);
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error("Timed out waiting for screenshot server");
}

async function addScreenshotOutline(page) {
  await page.evaluate(() => {
    if (!document.getElementById("screenshot-outline-style")) {
      const style = document.createElement("style");
      style.id = "screenshot-outline-style";
      style.textContent = `
        html.screenshot-outline::after {
          content: "";
          position: fixed;
          inset: 0;
          border: 1px solid #111;
          pointer-events: none;
          z-index: 2147483647;
        }
      `;
      document.head.appendChild(style);
    }
    document.documentElement.classList.add("screenshot-outline");
  });
}

async function capture(page, viewport, baseUrl) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("#intro-title", { timeout: 30000 });
  await page.waitForTimeout(500);
  await addScreenshotOutline(page);
  const outputPath = path.join(OUTPUT_DIR, `${viewport.name}.png`);
  await page.screenshot({ path: outputPath, fullPage: false });
  console.log(`Wrote ${path.relative(ROOT, outputPath)}`);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const port = await findOpenPort();
  const server = startServer(port);
  const baseUrl = `http://127.0.0.1:${port}/?screenshot=1`;

  try {
    await waitForServer(port);
    const browser = await chromium.launch();
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const viewport of VIEWPORTS) {
      await capture(page, viewport, baseUrl);
    }
    await browser.close();
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
