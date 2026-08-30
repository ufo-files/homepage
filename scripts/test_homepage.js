const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert.match(html, /id="intro-title"/);
assert.match(html, /class="research-hero"/);
assert.match(html, /id="field"/);
assert.match(html, /Big Data for UFO Files Research/);
assert.match(html, /largest open-source collection of over 117,000 global UFO files/);
assert.match(html, /Start exploring the data/);
assert.match(html, /https:\/\/ufo-files\.github\.io\/relationship-graph-builder\//);
assert.match(html, /href="https:\/\/tips\.hushline\.app\/to\/ufo-files" rel="me"/);
assert.match(html, /<script\b/);

assert.match(css, /min-height:\s*100svh/);
assert.match(css, /\.research-hero\s*\{/);
assert.match(css, /@media \(max-width: 820px\)/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /#field\s*\{[^}]*position:\s*fixed/s);

for (const asset of ["logo.svg"]) {
  assert.ok(fs.statSync(path.join(root, "assets", asset)).size > 0, `${asset} is present`);
}

assert.doesNotMatch(html, /folder|classified|government dossier/i);
assert.doesNotMatch(html, /Open source research infrastructure/);
assert.doesNotMatch(html, /Data and methods on GitHub/);
assert.equal((html.match(/<section\b/g) || []).length, 1);

console.log("Homepage contains one focused, animated research introduction");
