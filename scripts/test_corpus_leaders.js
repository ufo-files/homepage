const assert = require("node:assert/strict");
const leaders = require("../data/corpus-leaders.json");

assert.equal(leaders.ranking[0], "research relevance");

const people = leaders.categories.find((category) => category.id === "people");
assert.ok(people, "People ranking is present");
assert.equal(
  people.leaders.some((entity) => entity.id === "people:john-greenewald"),
  false,
  "John Greenewald is not promoted by source-hosting volume",
);

console.log("Homepage corpus leaders use research relevance");
