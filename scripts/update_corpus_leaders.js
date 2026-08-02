const fs = require("node:fs");
const path = require("node:path");

const catalogUrl = process.env.GRAPH_BUILDER_CATALOG_URL ||
  "https://ufo-files.github.io/relationship-graph-builder/data/catalog.json";
const outputPath = path.resolve(__dirname, "../data/corpus-leaders.json");
const categories = [
  ["person", "People"],
  ["government_agency", "Government Agencies"],
  ["organization", "Organizations"],
  ["location", "Places"],
  ["program", "Programs"],
  ["subject", "Terms"],
  ["date", "Dates"],
];

async function main() {
  const response = await fetch(catalogUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Graph Builder catalog returned ${response.status}`);
  const catalog = await response.json();
  if (!Array.isArray(catalog.entities) || catalog.entities.length === 0) {
    throw new Error("Graph Builder catalog contains no entities");
  }

  const payload = {
    generatedAt: catalog.generatedAt || new Date().toISOString(),
    ranking: ["mentions", "distinct source coverage", "document coverage", "name"],
    categories: categories.map(([id, label]) => ({
      id,
      label,
      leaders: catalog.entities
        .filter((entity) => entity.category === id)
        .sort((left, right) =>
          (right.mentions || 0) - (left.mentions || 0) ||
          (right.sourceCount || 0) - (left.sourceCount || 0) ||
          (right.documentCount || 0) - (left.documentCount || 0) ||
          String(left.name).localeCompare(String(right.name))
        )
        .slice(0, 3)
        .map((entity) => ({
          id: entity.id,
          name: entity.name,
          sources: entity.sourceCount || 0,
        })),
    })).filter((category) => category.leaders.length > 0),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${payload.categories.length} Graph Builder category rankings`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
