const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const legacyUrl = "https://ufo-files.github.io/relationship-" + "graph/";
const builderUrl = "https://ufo-files.github.io/relationship-graph-builder/";
const sourceFiles = [
  "README.md",
  "index.html",
  "script.js",
  "scripts/export_relationship_graph_svg.js",
  "scripts/update_corpus_leaders.js",
];

for (const filename of sourceFiles) {
  const content = fs.readFileSync(path.join(root, filename), "utf8");
  assert.equal(content.includes(legacyUrl), false, `${filename} does not reference the legacy graph`);
}

const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(
  homepage.split(builderUrl).length - 1 >= 2,
  "Homepage hero and Graph Builder section link to the new builder",
);

console.log("Homepage links use the Graph Builder");
