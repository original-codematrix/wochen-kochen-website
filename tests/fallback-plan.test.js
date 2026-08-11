'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../server/current-plan.json');
const { recipes } = require('../data');

test('checked-in fallback is a complete schema-5 Knuspr plan without legacy market fields', () => {
  assert.equal(plan.schemaVersion, 5);
  assert.equal(plan.servings, 2);
  assert.equal(plan.days.length, 7);
  assert.equal(new Set(plan.days.map(day => day.recipeId)).size, 7);
  assert.equal(plan.shoppingPreview.revision, plan.planRevision);
  assert.deepEqual(plan.shoppingPreview.days, plan.days);
  assert.ok(plan.mealPrep.batches.length >= 7);
  assert.ok(Array.isArray(plan.excludedIngredients));

  for (const legacyField of ['weekend', 'nextWeek', 'recommendation', 'shopping', 'sources', 'computedFromOffers']) {
    assert.equal(legacyField in plan, false, legacyField);
  }

  const recipesById = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const expectedIngredientIds = plan.days.flatMap(day => {
    const recipe = recipesById.get(day.recipeId);
    assert.ok(recipe, `Rezept ${day.recipeId} fehlt in data.js`);
    return recipe.ingredients.flatMap((ingredient, ingredientIndex) => (
      /\boptional\b/i.test(ingredient) ? [] : [`${recipe.id}:${ingredientIndex}`]
    ));
  });
  const actualIngredientIds = plan.shoppingPreview.lines.flatMap(line => line.ingredientIds || []);

  assert.deepEqual(actualIngredientIds.slice().sort(), expectedIngredientIds.slice().sort());
  assert.equal(new Set(actualIngredientIds).size, actualIngredientIds.length);
  assert.equal(plan.shoppingPreview.lines.every(line => line.demand && line.demand.searchTerm), true);
});
