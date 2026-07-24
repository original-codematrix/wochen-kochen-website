const test = require('node:test');
const assert = require('node:assert/strict');

test('recipe data can be consumed by the weekly Node.js planner', () => {
  const data = require('../data');
  assert.ok(data.recipes.length >= 75);
  assert.equal(data.weeks.length, 4);
  assert.equal(data.recipes.find(recipe => recipe.id === 'mexico-pork').servings, 4);
  for (const id of ['spinach-pasta', 'spinach-potatoes-eggs', 'leberkaese-eggs', 'leberkaese-spinach']) {
    assert.ok(data.recipes.find(recipe => recipe.id === id), `Rezept ${id} fehlt`);
  }
  for (const id of ['pesto-pea-pasta', 'vegetable-egg-rice', 'broccoli-potato-bake', 'lentil-bolognese']) {
    assert.ok(data.recipes.find(recipe => recipe.id === id), `Neues Mischungsrezept ${id} fehlt`);
  }
  for (const id of ['spinach-tortellini', 'vegetable-noodle-bake', 'chicken-potato-pan']) {
    assert.ok(data.recipes.find(recipe => recipe.id === id), `Erweitertes Rezept ${id} fehlt`);
  }
});
