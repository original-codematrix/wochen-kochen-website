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

  assert.deepEqual(actualIngredientIds.slice().sort(), expectedIngredientIds.slice().sort());
  assert.equal(new Set(actualIngredientIds).size, actualIngredientIds.length);
  assert.equal(items.some(item => /^Weitere Zutaten für |^Senf, Öl und Gewürze$/i.test(item.name)), false);
  assert.equal(items.some(item => /schnitzel/i.test(item.name)), true);
});
