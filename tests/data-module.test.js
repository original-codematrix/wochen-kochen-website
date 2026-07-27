const test = require('node:test');
const assert = require('node:assert/strict');

const ORIGINAL_RECIPE_IDS = [
  'garlic-pasta', 'teriyaki', 'gyros', 'nuggets', 'cajun',
  'honey-soy', 'pizza', 'beef-onion', 'coconut-curry', 'bbq-pasta',
  'burger', 'sheet-pan', 'sweet-chili', 'hoisin-noodles', 'wings',
  'beef-pasta', 'mustard-chicken', 'lemon-garlic', 'pepper-beef',
  'garlic-rice', 'kebab-bowl', 'crispy-chicken', 'soy-sesame',
  'curry-noodles', 'bbq-tray', 'beef-rice', 'garlic-parmesan',
  'oven-pizza', 'mustard-pasta', 'crispy-wrap', 'garlic-beef-noodles',
  'chicken-rice-bake', 'hoisin-rice', 'frosta-evening', 'mexico-pork',
  'spinach-pasta', 'spinach-potatoes-eggs', 'leberkaese-eggs',
  'leberkaese-spinach', 'ham-cream-pasta', 'spinach-gnocchi',
  'schnitzel-potatoes', 'meatballs-cream', 'pork-tenderloin-pasta',
  'chicken-spinach-lasagna', 'potato-mince-bake', 'kaesespaetzle',
  'paprika-cream-pork', 'beef-fried-noodles', 'sausage-spinach-pasta',
  'chicken-spinach-rice', 'pesto-pea-pasta', 'vegetable-egg-rice',
  'broccoli-potato-bake', 'lentil-bolognese',
  'garlic-oil-spinach-pasta', 'veggie-coconut-curry',
  'potato-egg-skillet', 'spinach-feta-bake', 'broccoli-cheese-pasta',
  'pea-carrot-rice', 'oven-potato-herb-quark', 'egg-noodle-stirfry',
  'chicken-pesto-pasta', 'pork-noodle-skillet', 'spinach-tortellini',
  'vegetable-noodle-bake', 'chicken-potato-pan',
  'spinach-rice-omelette', 'paprika-cream-pasta',
  'sausage-potato-skillet', 'roast-vegetable-couscous',
  'chicken-schnitzel-pasta', 'broccoli-rice-bake',
  'beef-potato-bowl'
];

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

test('all measured broth ingredients explain that broth is prepared liquid', () => {
  const { recipes } = require('../data');
  const measured = recipes
    .flatMap(recipe => recipe.ingredients || [])
    .filter(item => /\d+\s*ml .*Brühe/i.test(item));

  assert.ok(measured.length > 0);
  assert.equal(measured.every(item => (
    /zubereitete (?:[A-Za-zÄÖÜäöüß-]*)?Brühe/i.test(item)
    && /Wasser/i.test(item)
    && /Brühenpulver\/-würfel/i.test(item)
  )), true);
});

test('all original recipes have measured seasoning and an individual seasoning tip', () => {
  const { recipes } = require('../data');
  const originals = recipes.filter(recipe => ORIGINAL_RECIPE_IDS.includes(recipe.id));
  assert.equal(originals.length, 75);
  for (const recipe of originals) {
    assert.equal(typeof recipe.seasoningTip, 'string', recipe.id);
    assert.ok(recipe.seasoningTip.trim().length >= 20, recipe.id);
    assert.ok(recipe.ingredients.some(item => (
      /(?:TL|EL|Prise) .*(?:salz|pfeffer|paprika|curry|muskat|oregano|thymian|rosmarin|kümmel|chili|knoblauch|kräuter)/i.test(item)
    )), `messbare Würzung fehlt: ${recipe.id}`);
    assert.equal(recipe.ingredients.some(item => /^Gewürze$/i.test(item)), false, recipe.id);
    assert.equal(recipe.ingredients.some(item => /^(?:Salz|Pfeffer)(?:,| und )/i.test(item)), false, recipe.id);
  }
});
