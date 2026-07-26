'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../server/current-plan.json');
const { recipes } = require('../data');

test('checked-in fallback plan has a complete itemized shopping list', () => {
  const items = plan.shopping.flatMap(group => group.items);
  const timeline = [...plan.weekend, ...plan.nextWeek];
  const batches = timeline.filter((day, index) => index === 0 || day.recipeId !== timeline[index - 1].recipeId);
  const recipesById = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const expectedIngredientIds = batches.flatMap((day, batchIndex) => {
    const recipe = recipesById.get(day.recipeId);
    assert.ok(recipe, `Rezept ${day.recipeId} fehlt in data.js`);
    return recipe.ingredients.flatMap((ingredient, ingredientIndex) => (
      /\boptional\b/i.test(ingredient) ? [] : [`${batchIndex}|${recipe.id}:${ingredientIndex}`]
    ));
  });
  const actualIngredientIds = items.flatMap(item => item.ingredientIds || []);
  const freshCucumberIds = batches.flatMap((day, batchIndex) => {
    const recipe = recipesById.get(day.recipeId);
    return recipe.ingredients.flatMap((ingredient, ingredientIndex) => (
      /^(?:\d+\s+)?Gurke$/i.test(ingredient) ? [`${batchIndex}|${recipe.id}:${ingredientIndex}`] : []
    ));
  });
  const brothIngredientIds = batches.flatMap((day, batchIndex) => {
    const recipe = recipesById.get(day.recipeId);
    return recipe.ingredients.flatMap((ingredient, ingredientIndex) => (
      /(brühe|fond)/i.test(ingredient) ? [`${batchIndex}|${recipe.id}:${ingredientIndex}`] : []
    ));
  });
  const beefBrothIngredientIds = batches.flatMap((day, batchIndex) => {
    const recipe = recipesById.get(day.recipeId);
    return recipe.ingredients.flatMap((ingredient, ingredientIndex) => (
      /rinder(brühe|fond)/i.test(ingredient) ? [`${batchIndex}|${recipe.id}:${ingredientIndex}`] : []
    ));
  });
  const pickledCucumberItems = items.filter(item => /(gewürz|essig|cornichon|eingelegt).*gurke|gurke.*(gewürz|essig|cornichon|eingelegt)/i.test(item.name));
  const freshCucumberItems = items.filter(item => (
    /gurke/i.test(item.name) && !pickledCucumberItems.includes(item)
  ));
  const brothCoverageItems = items.filter(item => (
    (item.ingredientIds || []).some(id => brothIngredientIds.includes(id))
  ));
  const beefBrothItems = items.filter(item => /rinder(brühe|fond)/i.test(item.name));

  assert.deepEqual(actualIngredientIds.slice().sort(), expectedIngredientIds.slice().sort());
  assert.equal(new Set(actualIngredientIds).size, actualIngredientIds.length);
  assert.equal(items.some(item => /^Weitere Zutaten für |^Senf, Öl und Gewürze$/i.test(item.name)), false);
  assert.equal(items.some(item => /schnitzel/i.test(item.name)), true);
  assert.deepEqual(
    pickledCucumberItems.flatMap(item => item.ingredientIds || []).filter(id => freshCucumberIds.includes(id)),
    []
  );
  assert.ok(freshCucumberItems.length > 0, 'Konkrete frische Gurkenposition fehlt');
  assert.deepEqual(
    freshCucumberItems.flatMap(item => item.ingredientIds || []).filter(id => freshCucumberIds.includes(id)).sort(),
    freshCucumberIds.slice().sort()
  );
  assert.equal(brothCoverageItems.every(item => /(brühe|fond)/i.test(item.name)), true);
  assert.ok(beefBrothItems.length > 0, 'Konkrete Rinderbrühe- oder Rinderfondposition fehlt');
  assert.deepEqual(
    beefBrothItems.flatMap(item => item.ingredientIds || []).filter(id => beefBrothIngredientIds.includes(id)).sort(),
    beefBrothIngredientIds.slice().sort()
  );
});
