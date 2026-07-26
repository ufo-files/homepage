const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const graphUrl = process.env.RELATIONSHIP_GRAPH_URL || "https://ufo-files.github.io/relationship-graph/";
const outputPath = path.resolve(__dirname, "../data/corpus-leaders.json");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(graphUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(
      () => typeof DATA !== "undefined" && DATA.entities.length > 0 && typeof relationshipsByEntity !== "undefined",
      { timeout: 180000 },
    );
    const payload = await page.evaluate(() => ({
      generatedAt: DATA.manifest.generated_at || new Date().toISOString(),
      ranking: ["research relevance", "distinct source coverage", "relationship degree", "mentions", "name"],
      categories: Object.keys(DATA.topCategoryLabels)
        .filter((categoryId) => DATA.entities.some((entity) => entity.topCategory === categoryId))
        .map((categoryId) => ({
          id: categoryId,
          label: DATA.topCategoryLabels[categoryId],
          leaders: DATA.entities.filter((entity) => entity.topCategory === categoryId).slice().sort((left, right) =>
            (right.navigationScore || 0) - (left.navigationScore || 0) ||
            (right.transcriptCount || right.transcripts?.length || 0) - (left.transcriptCount || left.transcripts?.length || 0) ||
            (relationshipsByEntity.get(right.id)?.length || 0) - (relationshipsByEntity.get(left.id)?.length || 0) ||
            (right.count || 0) - (left.count || 0) ||
            String(left.name).localeCompare(String(right.name))
          ).slice(0, 3).map((entity) => ({
            id: entity.id,
            name: entity.name,
            sources: entity.transcriptCount || entity.transcripts?.length || 0,
          })),
        })),
    }));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Wrote ${payload.categories.length} dynamic category rankings`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
