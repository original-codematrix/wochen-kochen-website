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

const EXPANSION_IDS = [
  'lemon-pea-pasta',
  'mushroom-spinach-tagliatelle',
  'pumpkin-sage-gnocchi',
  'cauliflower-cheese-pasta',
  'creamy-bean-orzo',
  'potato-zucchini-fritters',
  'mushroom-potato-goulash',
  'cauliflower-potato-curry',
  'spinach-potato-gratin',
  'crispy-potato-egg-tray',
  'lentil-spinach-curry',
  'bean-cheese-quesadillas',
  'vegetable-bulgur-bowl',
  'beef-mushroom-one-pan-pasta',
  'salsiccia-spinach-rigatoni',
  'paprika-chicken-rice',
  'pork-mustard-strips',
  'turkey-leek-pasta',
  'chicken-broccoli-potato-bake',
  'beef-bean-burrito-bowl',
  'meatball-orzo-pan',
  'bratwurst-apple-onion-pan',
  'bacon-pea-gnocchi',
  'chicken-fajita-tray',
  'ham-cheese-potato-bake'
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

test('catalog adds exactly 25 complete fish-free Feierabend recipes', () => {
  const { recipes } = require('../data');
  const additions = recipes.filter(recipe => EXPANSION_IDS.includes(recipe.id));
  assert.equal(recipes.length, 100);
  assert.equal(additions.length, 25);
  assert.equal(new Set(additions.map(recipe => recipe.id)).size, 25);
  assert.ok(additions.filter(recipe => recipe.tags.includes('fleischfrei')).length >= 13);
  for (const recipe of additions) {
    for (const field of ['name', 'cat', 'desc', 'freeze', 'lowcarb', 'difficulty', 'seasoningTip']) {
      assert.ok(String(recipe[field] || '').trim(), `${recipe.id}: ${field}`);
    }
    assert.equal(recipe.servings, 4, recipe.id);
    assert.ok(recipe.time >= 20 && recipe.time <= 50, recipe.id);
    assert.ok(recipe.ingredients.length >= 6, recipe.id);
    assert.ok(recipe.steps.length >= 4, recipe.id);
    assert.doesNotMatch(`${recipe.name} ${recipe.ingredients.join(' ')}`, /fisch|lachs|thunfisch|garnele|hummer|meeresfr/i);
  }
});

test('expansion recipes do not introduce unmeasured salt through their steps', () => {
  const { recipes } = require('../data');
  const additions = recipes.filter(recipe => EXPANSION_IDS.includes(recipe.id));
  for (const recipe of additions) {
    assert.doesNotMatch(recipe.steps.join(' '), /\bSalzwasser\b/i, recipe.id);
  }
});

test('mustard pork strips include their declared rice side dish', () => {
  const { recipes } = require('../data');
  const recipe = recipes.find(candidate => candidate.id === 'pork-mustard-strips');
  assert.ok(recipe.ingredients.some(item => /^300 g Langkornreis$/i.test(item)));
  assert.match(recipe.steps.join(' '), /\bReis\b/i);
  assert.match(recipe.lowcarb, /\bstatt Reis\b/i);
});

test('bean and cheese quesadilla calories reflect the listed full meal', () => {
  const { recipes } = require('../data');
  const recipe = recipes.find(candidate => candidate.id === 'bean-cheese-quesadillas');
  assert.ok(recipe.kcal >= 850 && recipe.kcal <= 1000, String(recipe.kcal));
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
