const assert = require("node:assert/strict");
const leaders = require("../data/corpus-leaders.json");

assert.equal(leaders.ranking[0], "mentions");

const people = leaders.categories.find((category) => category.id === "person");
assert.ok(people, "People ranking is present");
assert.equal(people.leaders.length, 3, "People ranking contains three entities");
assert.ok(people.leaders.every((entity) => entity.id.startsWith("ent-")));

const places = leaders.categories.find((category) => category.id === "location");
assert.ok(places, "Places ranking is present");
assert.equal(places.leaders.length, 3, "Places ranking contains three entities");

console.log("Homepage corpus leaders use Graph Builder data");
