const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "assets", "relationship-graph-canvas.svg");
const GRAPH_URL = process.env.RELATIONSHIP_GRAPH_URL || "https://ufo-files.github.io/relationship-graph/?view=network";
const VIEWPORT = { width: 1440, height: 1000 };

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await page.goto(GRAPH_URL, { waitUntil: "networkidle" });
    await page.waitForSelector("#graph .graph-node", { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector("#graph-loading")?.hidden, { timeout: 30000 });
    await page.waitForTimeout(700);

    const svg = await page.locator("#graph").evaluate((graph, viewport) => {
      const clone = graph.cloneNode(true);
      const sourceElements = [graph, ...graph.querySelectorAll("*")];
      const clonedElements = [clone, ...clone.querySelectorAll("*")];
      const visualProperties = [
        "color",
        "fill",
        "fill-opacity",
        "fill-rule",
        "opacity",
        "paint-order",
        "shape-rendering",
        "stroke",
        "stroke-dasharray",
        "stroke-dashoffset",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-opacity",
        "stroke-width",
        "vector-effect",
      ];

      sourceElements.forEach((source, index) => {
        const target = clonedElements[index];
        const computed = getComputedStyle(source);
        const declarations = visualProperties
          .map((property) => `${property}:${computed.getPropertyValue(property)}`)
          .join(";");
        target.setAttribute("style", declarations);
        target.removeAttribute("tabindex");
        target.removeAttribute("role");
        target.removeAttribute("aria-label");
      });

      const viewBox = graph.viewBox.baseVal;
      const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      background.setAttribute("x", String(viewBox.x));
      background.setAttribute("y", String(viewBox.y));
      background.setAttribute("width", String(viewBox.width));
      background.setAttribute("height", String(viewBox.height));
      background.setAttribute("fill", getComputedStyle(graph).backgroundColor || "#f6f5ef");

      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = "UFO Files relationship graph";

      clone.removeAttribute("id");
      clone.removeAttribute("class");
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(viewport.width));
      clone.setAttribute("height", String(viewport.height));
      clone.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
      clone.setAttribute("preserveAspectRatio", "xMidYMid slice");
      clone.prepend(background);
      clone.prepend(title);

      return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
    }, VIEWPORT);

    if (/<image\b/i.test(svg)) {
      throw new Error("Relationship graph SVG export unexpectedly contains raster image elements.");
    }
    if (!/<(?:circle|path|line)\b/i.test(svg)) {
      throw new Error("Relationship graph SVG export contains no graph geometry.");
    }

    fs.writeFileSync(OUTPUT_PATH, svg);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
