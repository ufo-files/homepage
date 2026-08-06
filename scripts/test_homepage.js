const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert.match(html, /id="site-title"/);
assert.match(html, /assets\/archive-folder\.svg/);
assert.match(html, /TOP SECRET \/\/ NOFORN/);
assert.match(html, /SPECIAL ACCESS REQUIRED/);
assert.match(html, /https:\/\/ufo-files\.github\.io\/relationship-graph-builder\//);
assert.match(html, /https:\/\/tips\.hushline\.app\/to\/ufo-files/);
assert.match(html, /mailto:contact@ufo-files\.app/);
assert.match(html, /CC0 1\.0/);
assert.doesNotMatch(html, /<script\b/);

assert.match(css, /height:\s*100svh/);
assert.match(css, /overflow:\s*hidden/);
assert.match(css, /@media \(max-width: 820px\)/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /\.routing-slip\s*\{[^}]*font-family:\s*"Architects Daughter"/s);
assert.match(css, /\.routing-copy\s*\{[^}]*font-size:\s*1rem/s);

for (const asset of ["archive-folder.svg"]) {
  assert.ok(fs.statSync(path.join(root, "assets", asset)).size > 0, `${asset} is present`);
}

assert.doesNotMatch(html, /\.(?:png|jpe?g|webp)/i);

console.log("Archival homepage has one viewport, SVG artwork, and primary routes");
