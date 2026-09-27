const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Every local navigation target and resource must resolve in the static site.
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'IDs must be unique');
for (const [, attribute, value] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
  if (/^https?:/.test(value)) continue;
  if (value.startsWith('#')) {
    assert.ok(ids.includes(value.slice(1)), `Missing target: ${value}`);
  } else {
    assert.ok(fs.statSync(path.join(root, value)).size > 0, `Missing ${attribute}: ${value}`);
  }
}
for (const name of ['src/css/style.css', 'src/css/reset.css', 'styles.css']) {
  const stylesheet = path.join(root, name);
  const css = fs.readFileSync(stylesheet, 'utf8');
  for (const [, resource] of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) {
    assert.ok(fs.existsSync(path.resolve(path.dirname(stylesheet), resource)), `Missing CSS resource: ${resource}`);
  }
}
assert.equal((html.match(/<h1\b/g) || []).length, 1, 'One main heading');
assert.ok(html.includes('https://ufo-files.github.io/relationship-graph-builder/'), 'Research app remains accessible');
assert.ok(html.includes('https://tips.hushline.app/to/ufo-files'), 'Contact remains accessible');
console.log('Static resources, navigation targets, heading structure, and research/contact links passed.');
