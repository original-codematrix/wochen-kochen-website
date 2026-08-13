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
  'ham-cheese-potato-bake',
  'teriyaki-chicken-noodles',
  'peanut-sesame-noodles',
  'red-coconut-chicken-curry',
  'sweet-sour-chicken-rice',
  'cashew-veggie-noodles',
  'mushroom-cream-penne',
  'tomato-cream-mozzarella-penne',
  'tomato-cream-chicken-pasta',
  'gnocchi-tomato-cream',
  'tortellini-tomato-cream',
  'tortellini-cream-spinach',
  'mac-and-cheese',
  'cheese-spaetzle',
  'four-cheese-pasta',
  'broccoli-cheese-bake',
  'cauliflower-cheese-gratin',
  'gorgonzola-gnocchi',
  'cheese-leek-mince-pasta',
  'ham-cheese-pasta',
  'cheesy-mince-pasta',
  'cream-cheese-spinach-pasta',
  'mushroom-gorgonzola-pasta',
  'carbonara-style',
  'nasi-goreng-veggie',
  'chow-mein-chicken',
  'cheese-leek-soup',
  'curry-schmand-potatoes',
  'chicken-cheese-broccoli-pasta',
  'chicken-mushroom-cream-pasta'
];

const EXPANSION_MATRIX = [
  ['lemon-pea-pasta', 'Zitronige Erbsen-Frischkäse-Pasta', 'Nudeln'],
  ['mushroom-spinach-tagliatelle', 'Champignon-Spinat-Tagliatelle', 'Nudeln'],
  ['pumpkin-sage-gnocchi', 'Kürbis-Salbei-Gnocchi', 'Nudeln'],
  ['cauliflower-cheese-pasta', 'Blumenkohl-Käse-Pasta', 'Nudeln'],
  ['creamy-bean-orzo', 'Cremige Bohnen-Orzo-Pfanne', 'Nudeln'],
  ['potato-zucchini-fritters', 'Kartoffel-Zucchini-Puffer', 'Kartoffeln'],
  ['mushroom-potato-goulash', 'Champignon-Kartoffel-Gulasch', 'Kartoffeln'],
  ['cauliflower-potato-curry', 'Blumenkohl-Kartoffel-Curry', 'Reis'],
  ['spinach-potato-gratin', 'Spinat-Kartoffel-Gratin', 'Kartoffeln'],
  ['crispy-potato-egg-tray', 'Knusperkartoffeln mit Ofeneiern', 'TK & Ofen'],
  ['lentil-spinach-curry', 'Linsen-Spinat-Curry', 'Reis'],
  ['bean-cheese-quesadillas', 'Bohnen-Käse-Quesadillas', 'Bowls & Wraps'],
  ['vegetable-bulgur-bowl', 'Ofengemüse-Bulgur-Bowl', 'Reis'],
  ['beef-mushroom-one-pan-pasta', 'One-Pan-Hack-Pasta mit Champignons', 'Nudeln'],
  ['salsiccia-spinach-rigatoni', 'Salsiccia-Spinat-Rigatoni', 'Nudeln'],
  ['paprika-chicken-rice', 'Paprika-Hähnchen-Reis', 'Reis'],
  ['pork-mustard-strips', 'Senf-Schweinegeschnetzeltes', 'Fleisch'],
  ['turkey-leek-pasta', 'Puten-Lauch-Pasta', 'Nudeln'],
  ['chicken-broccoli-potato-bake', 'Hähnchen-Brokkoli-Kartoffelauflauf', 'TK & Ofen'],
  ['beef-bean-burrito-bowl', 'Rind-Bohnen-Burrito-Bowl', 'Bowls & Wraps'],
  ['meatball-orzo-pan', 'Hackbällchen-Orzo-Pfanne', 'Nudeln'],
  ['bratwurst-apple-onion-pan', 'Bratwurst-Apfel-Zwiebel-Pfanne', 'Kartoffeln'],
  ['bacon-pea-gnocchi', 'Speck-Erbsen-Gnocchi', 'Nudeln'],
  ['chicken-fajita-tray', 'Hähnchen-Fajita-Blech', 'TK & Ofen'],
  ['ham-cheese-potato-bake', 'Schinken-Käse-Kartoffelauflauf', 'TK & Ofen'],
  ['teriyaki-chicken-noodles', 'Teriyaki-Hähnchen-Nudeln', 'Asiatisch'],
  ['peanut-sesame-noodles', 'Erdnuss-Sesam-Nudeln mit Gemüse', 'Asiatisch'],
  ['red-coconut-chicken-curry', 'Rotes Kokos-Curry mit Hähnchen und Reis', 'Asiatisch'],
  ['sweet-sour-chicken-rice', 'Süß-saures Hähnchen mit Reis', 'Asiatisch'],
  ['cashew-veggie-noodles', 'Cashew-Gemüse-Nudeln', 'Asiatisch'],
  ['mushroom-cream-penne', 'Champignon-Rahm-Penne', 'Nudeln'],
  ['tomato-cream-mozzarella-penne', 'Tomatensahne-Penne mit Mozzarella', 'Nudeln'],
  ['tomato-cream-chicken-pasta', 'Tomaten-Sahne-Hähnchen-Pasta', 'Nudeln'],
  ['gnocchi-tomato-cream', 'Gnocchi in Tomatensahne', 'Nudeln'],
  ['tortellini-tomato-cream', 'Tortellini in Tomatensahnesoße', 'Nudeln'],
  ['tortellini-cream-spinach', 'Tortellini-Sahne mit Spinat', 'Nudeln'],
  ['mac-and-cheese', 'Käse-Makkaroni (Mac & Cheese)', 'Nudeln'],
  ['cheese-spaetzle', 'Käsespätzle mit Röstzwiebeln', 'Nudeln'],
  ['four-cheese-pasta', 'Vier-Käse-Pasta', 'Nudeln'],
  ['broccoli-cheese-bake', 'Brokkoli-Käse-Nudelauflauf', 'Aufläufe'],
  ['cauliflower-cheese-gratin', 'Blumenkohl-Käse-Gratin', 'Aufläufe'],
  ['gorgonzola-gnocchi', 'Gorgonzola-Gnocchi', 'Nudeln'],
  ['cheese-leek-mince-pasta', 'Käse-Lauch-Nudeln mit Hackfleisch', 'Nudeln'],
  ['ham-cheese-pasta', 'Schinken-Käse-Nudeln', 'Nudeln'],
  ['cheesy-mince-pasta', 'Käse-Hack-Nudeln', 'Nudeln'],
  ['cream-cheese-spinach-pasta', 'Frischkäse-Spinat-Pasta', 'Nudeln'],
  ['mushroom-gorgonzola-pasta', 'Champignon-Gorgonzola-Pasta', 'Nudeln'],
  ['carbonara-style', 'Sahne-Speck-Spaghetti', 'Nudeln'],
  ['nasi-goreng-veggie', 'Nasi Goreng mit Ei und Gemüse', 'Asiatisch'],
  ['chow-mein-chicken', 'Chow Mein mit Hähnchen', 'Asiatisch'],
  ['cheese-leek-soup', 'Käse-Lauch-Suppe mit Hackfleisch', 'Suppen'],
  ['curry-schmand-potatoes', 'Curry-Schmand-Kartoffeln mit Hähnchen', 'Kartoffeln'],
  ['chicken-cheese-broccoli-pasta', 'Hähnchen-Brokkoli-Käse-Pasta', 'Nudeln'],
  ['chicken-mushroom-cream-pasta', 'Hähnchen-Champignon-Rahm-Pasta', 'Nudeln']
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

test('catalog exposes the exact 25-recipe expansion contract with valid metrics', () => {
  const { recipes } = require('../data');
  const additions = recipes.filter(recipe => EXPANSION_IDS.includes(recipe.id));
  assert.equal(recipes.length, 129);
  assert.equal(additions.length, 54);
  assert.equal(new Set(recipes.map(recipe => recipe.id)).size, recipes.length);
  assert.deepEqual(
    additions.map(recipe => [recipe.id, recipe.name, recipe.cat]),
    EXPANSION_MATRIX
  );
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
  for (const recipe of recipes) {
    for (const field of ['cost', 'kcal', 'protein', 'rating']) {
      assert.ok(Number.isFinite(recipe[field]) && recipe[field] > 0, `${recipe.id}: ${field}`);
    }
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

test('all original recipes apply their individual measured seasoning in the exported steps', () => {
  const { recipes } = require('../data');
  const seasoningData = require('../recipe-seasonings');
  const originals = recipes.filter(recipe => ORIGINAL_RECIPE_IDS.includes(recipe.id));
  assert.equal(originals.length, 75);
  assert.deepEqual(Object.keys(seasoningData), ORIGINAL_RECIPE_IDS);
  assert.equal(new Set(Object.values(seasoningData).map(seasoning => seasoning.application)).size, 75);
  for (const recipe of originals) {
    const seasoning = seasoningData[recipe.id];
    assert.equal(typeof recipe.seasoningTip, 'string', recipe.id);
    assert.ok(recipe.seasoningTip.trim().length >= 20, recipe.id);
    assert.equal(typeof seasoning.application, 'string', `${recipe.id}: application`);
    assert.ok(seasoning.application.trim().length >= 30, `${recipe.id}: application`);
    assert.ok(recipe.steps.includes(seasoning.application), `${recipe.id}: Anwendung fehlt im Export`);
    for (const required of seasoning.required) {
      const keyword = required.match(
        /\b(Paprikapulver|Knoblauchpulver|Chiliflocken|Kurkuma|Muskat|Salz|Pfeffer|Oregano|Thymian|Rosmarin|Majoran|Petersilie|Basilikum|Schnittlauch|Kräuter)\b/i
      )?.[1];
      assert.ok(keyword, `${recipe.id}: unbekannte Pflichtwürzung ${required}`);
      assert.match(
        seasoning.application,
        new RegExp(`\\b${keyword}\\b`, 'i'),
        `${recipe.id}: ${required} fehlt im Anwendungsschritt`
      );
    }
    assert.ok(recipe.ingredients.some(item => (
      /(?:TL|EL|Prise) .*(?:salz|pfeffer|paprika|curry|muskat|oregano|thymian|rosmarin|kümmel|chili|knoblauch|kräuter)/i.test(item)
    )), `messbare Würzung fehlt: ${recipe.id}`);
    assert.equal(recipe.ingredients.some(item => /^Gewürze$/i.test(item)), false, recipe.id);
    assert.equal(recipe.ingredients.some(item => /^(?:Salz|Pfeffer)(?:,| und )/i.test(item)), false, recipe.id);
    assert.doesNotMatch(recipe.steps.join(' '), /\bGewürze\b/i, `${recipe.id}: pauschaler Schritt`);
    for (const seasoningName of ['Salz', 'Pfeffer']) {
      if (new RegExp(`\\b${seasoningName}\\b`, 'i').test(recipe.steps.join(' '))) {
        assert.ok(
          recipe.ingredients.some(item => new RegExp(`(?:TL|EL|Prise) [^,]*\\b${seasoningName}\\b`, 'i').test(item)),
          `${recipe.id}: ${seasoningName} im Schritt ohne gemessene Pflichtzutat`
        );
      }
    }
  }
});

test('all original recipes insert seasoning chronologically without reordering preparation steps', () => {
  const { recipes } = require('../data');
  const seasoningData = require('../recipe-seasonings');
  const representativeOriginalSteps = {
    'garlic-pasta': [
      'Nudeln kochen und 250 ml Nudelwasser auffangen.',
      'Brokkoli in den letzten 7–8 Minuten mitkochen, damit er weich wird.',
      'Hähnchen würfeln, würzen und kräftig anbraten.',
      'Zwiebel und Knoblauch zufügen, mit Brühe ablöschen.',
      'Nudeln, Brokkoli und nach Bedarf Nudelwasser unterheben, bis die Soße cremig bindet.'
    ],
    teriyaki: [
      'Reis garen.',
      'Brokkoli separat sehr weich kochen.',
      'Hähnchen scharf anbraten.',
      'Teriyaki-Soße zugeben und 3–4 Minuten glasieren.',
      'Mit Reis, Brokkoli und Sesam servieren.'
    ],
    nuggets: [
      'Ofen oder Airfryer vorheizen.',
      'Pommes und Nuggets nach Packungsangabe zubereiten.',
      'Dips und eine einfache Beilage bereitstellen.'
    ],
    'chicken-rice-bake': [
      'Reis und Brühe in eine Form geben.',
      'Hähnchen darauf verteilen.',
      '35–40 Minuten backen.',
      'Vorgegarten Brokkoli und optional Käse in den letzten 10 Minuten ergänzen.'
    ]
  };
  const expectedApplicationIndices = {
    'garlic-pasta': 2,
    teriyaki: 3,
    nuggets: 1,
    'chicken-rice-bake': 1,
    'spinach-rice-omelette': 2,
    'schnitzel-potatoes': 1
  };
  const indices = [];

  for (const id of ORIGINAL_RECIPE_IDS) {
    const seasoning = seasoningData[id];
    const recipe = recipes.find(candidate => candidate.id === id);
    assert.ok(Number.isInteger(seasoning.applicationIndex), `${id}: applicationIndex`);
    assert.ok(
      seasoning.applicationIndex >= 0 && seasoning.applicationIndex < recipe.steps.length,
      `${id}: applicationIndex außerhalb der Schritte`
    );
    assert.equal(recipe.steps[seasoning.applicationIndex], seasoning.application, `${id}: falsche Position`);
    assert.equal(
      recipe.steps.filter(step => step === seasoning.application).length,
      1,
      `${id}: Anwendung muss genau einmal vorkommen`
    );
    indices.push(seasoning.applicationIndex);
  }
  assert.ok(new Set(indices).size >= 5, 'Anwendungspositionen müssen rezeptbezogen variieren');

  for (const [id, expectedIndex] of Object.entries(expectedApplicationIndices)) {
    assert.equal(seasoningData[id].applicationIndex, expectedIndex, id);
  }

  for (const [id, expectedSteps] of Object.entries(representativeOriginalSteps)) {
    const seasoning = seasoningData[id];
    const recipe = recipes.find(candidate => candidate.id === id);
    assert.deepEqual(
      recipe.steps.filter(step => step !== seasoning.application),
      expectedSteps,
      `${id}: ursprüngliche Schrittreihenfolge verändert`
    );
  }
});

test('expansion recipes explicitly consume split seasoning quantities', () => {
  const { recipes } = require('../data');
  const bulgur = recipes.find(recipe => recipe.id === 'vegetable-bulgur-bowl');
  const chickenRice = recipes.find(recipe => recipe.id === 'paprika-chicken-rice');

  assert.match(bulgur.steps.join(' '), /restliche[mn]? Pfeffer/i);
  assert.match(chickenRice.steps.join(' '), /restliche[sn]? Salz/i);
  assert.match(chickenRice.steps.join(' '), /restliche[sn]? Pfeffer/i);
});

test('spinach potato gratin cooks 1.2 kg potato slices through reliably', () => {
  const { recipes } = require('../data');
  const gratin = recipes.find(recipe => recipe.id === 'spinach-potato-gratin');
  const steps = gratin.steps.join(' ');
  const precooksSlices = /Kartoffelscheiben.*(?:8|acht)[–-](?:10|zehn) Minuten.*vorkochen/i.test(steps);
  const longBake = /(?:50|fünfzig|55|fünfundfünfzig|60|sechzig) Minuten backen/i.test(steps);

  assert.ok(precooksSlices || longBake, steps);
});
