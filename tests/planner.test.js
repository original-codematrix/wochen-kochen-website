const test = require('node:test');
const assert = require('node:assert/strict');
const {
  allocateDays,
  subtractPantry,
  recommendMarket,
  generateOfferPlan,
  buildMealPrepPlan,
  shoppingDepartment
} = require('../server/planner');
const { recipes: catalogRecipes } = require('../data');

test('allocateDays assigns a different recipe to every day when enough recipes exist', () => {
  const days = allocateDays(['pasta', 'curry', 'pizza', 'rice', 'potato', 'eggs', 'wrap'], ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
  assert.deepEqual(days, [
    { day: 'Mo', recipeId: 'pasta' },
    { day: 'Di', recipeId: 'curry' },
    { day: 'Mi', recipeId: 'pizza' },
    { day: 'Do', recipeId: 'rice' },
    { day: 'Fr', recipeId: 'potato' },
    { day: 'Sa', recipeId: 'eggs' },
    { day: 'So', recipeId: 'wrap' }
  ]);
});

test('subtractPantry removes stocked quantities and drops fully stocked items', () => {
  const result = subtractPantry(
    [{ name: 'Reis', quantity: 800, unit: 'g' }, { name: 'Brokkoli', quantity: 500, unit: 'g' }],
    [{ name: 'Reis', quantity: 500, unit: 'g' }, { name: 'Brokkoli', quantity: 500, unit: 'g' }]
  );
  assert.deepEqual(result, [{ name: 'Reis', quantity: 300, unit: 'g' }]);
});

test('recommendMarket keeps one-store shopping when splitting saves less than 20 euros', () => {
  const result = recommendMarket({
    baskets: [
      { market: 'Kaufland', total: 58.4, coverage: 1 },
      { market: 'REWE', total: 61.2, coverage: 1 }
    ],
    splitTotal: 42
  });
  assert.equal(result.mode, 'single');
  assert.equal(result.market, 'Kaufland');
  assert.equal(result.savingsBySplitting, 16.4);
});

test('recommendMarket suggests splitting a large basket when savings exceed the threshold', () => {
  const result = recommendMarket({
    baskets: [{ market: 'Kaufland', total: 96, coverage: 1 }],
    splitTotal: 72
  });
  assert.equal(result.mode, 'split');
  assert.equal(result.savingsBySplitting, 24);
});

test('generateOfferPlan changes the recipe selection when the useful offers change', () => {
  const recipes = [
    { id: 'pizza', name: 'Pizza-Abend', cat: 'TK & Ofen', cost: 12, rating: 5, ingredients: ['2 TK-Pizzen', '1 Gurke'] },
    { id: 'chicken', name: 'Hähnchen mit Reis', cat: 'Reis', cost: 18, rating: 5, ingredients: ['600 g Hähnchen', '400 g Reis'] },
    { id: 'fish', name: 'Lachs mit Reis', cat: 'Reis', cost: 10, rating: 5, ingredients: ['600 g Lachs', '400 g Reis'] }
  ];
  const base = {
    weekend: [],
    nextWeek: [],
    recommendation: {},
    shopping: []
  };
  const pizzaPlan = generateOfferPlan({
    recipes,
    offers: [{ name: 'Wagner Steinofen Pizza', package: '350 g', price: 1.59, market: 'EDEKA Morsestraße', status: 'offer' }],
    basePlan: base,
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  const chickenPlan = generateOfferPlan({
    recipes,
    offers: [{ name: 'Frisches Hähnchen-Brustfilet', package: 'je 100 g', price: 1.19, market: 'REWE Eching', status: 'offer' }],
    basePlan: base,
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  assert.equal(pizzaPlan.nextWeek[0].recipeId, 'pizza');
  assert.equal(chickenPlan.nextWeek[0].recipeId, 'chicken');
  assert.equal(pizzaPlan.nextWeek.some(day => day.recipeId === 'fish'), false);
  assert.equal(chickenPlan.computedFromOffers, true);
});

test('generateOfferPlan creates an offer-backed shopping list and transparent totals', () => {
  const plan = generateOfferPlan({
    recipes: [
      { id: 'pasta', name: 'Hähnchen-Pasta', cat: 'Nudeln', cost: 17, rating: 5, ingredients: ['600 g Hähnchen', '500 g Pasta'] }
    ],
    offers: [
      { name: 'Hähnchen-Brustfilet', package: 'je 100 g', price: 1.19, market: 'REWE Eching', status: 'offer' },
      { name: 'Barilla Pasta', package: '500 g', price: 0.69, market: 'REWE Eching', status: 'offer' }
    ],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  assert.equal(plan.recommendation.market, 'REWE Eching');
  assert.ok(plan.recommendation.confirmedOfferTotal > 0);
  assert.ok(plan.recommendation.estimatedTotal >= plan.recommendation.confirmedOfferTotal);
  assert.ok(plan.shopping.flatMap(group => group.items).some(item => item.status === 'offer'));
  assert.match(plan.nextWeek[0].reason, /Angebot/i);
});

test('generateOfferPlan does not substitute chicken wings for chicken breast', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'pasta', name: 'Hähnchen-Pasta', cat: 'Nudeln', cost: 17, rating: 5, ingredients: ['600 g Hähnchen', '500 g Pasta'] }],
    offers: [
      { name: 'Hähnchen-Flügel', package: 'je 100g', price: 0.66, market: 'EDEKA Morsestraße', status: 'offer' },
      { name: 'De Cecco Pasta', package: 'je 500g Packung, (1kg=2.58)', price: 1.29, market: 'EDEKA Morsestraße', status: 'offer' }
    ],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] },
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  const names = plan.shopping.flatMap(group => group.items).map(item => item.name);
  assert.equal(names.includes('Hähnchen-Flügel'), false);
});

test('generateOfferPlan accepts chicken wings but rejects chicken nuggets for wings', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'wings', name: 'Chicken Wings', cat: 'TK & Ofen', cost: 13, rating: 5, ingredients: ['600 g Chicken Wings'] }],
    offers: [
      { name: 'Hähnchen Wings', package: '600 g', price: 4.99, market: 'Markt A', status: 'offer' },
      { name: 'Chicken Nuggets', package: '600 g', price: 2.99, market: 'Markt A', status: 'offer' }
    ],
    basePlan: {}
  });
  const offeredNames = plan.shopping.flatMap(group => group.items)
    .filter(item => item.status === 'offer')
    .map(item => item.name);

  assert.deepEqual(offeredNames, ['Hähnchen Wings']);
});

test('generateOfferPlan accepts chicken breast but rejects a whole chicken for breast', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'breast', name: 'Hähnchenbrust', cat: 'Reis', cost: 13, rating: 5, ingredients: ['600 g Hähnchenbrust'] }],
    offers: [
      { name: 'Hähnchen-Brustfilet', package: '600 g', price: 5.99, market: 'Markt A', status: 'offer' },
      { name: 'Frisches ganzes Hähnchen', package: '1,2 kg', price: 2.99, market: 'Markt A', status: 'offer' }
    ],
    basePlan: {}
  });
  const offeredNames = plan.shopping.flatMap(group => group.items)
    .filter(item => item.status === 'offer')
    .map(item => item.name);

  assert.deepEqual(offeredNames, ['Hähnchen-Brustfilet']);
});

test('generateOfferPlan accepts chicken legs but rejects chicken breast for legs', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'legs', name: 'Hähnchenkeulen', cat: 'Kartoffeln', cost: 13, rating: 5, ingredients: ['600 g Hähnchenkeulen'] }],
    offers: [
      { name: 'Hähnchenschenkel', package: '600 g', price: 4.99, market: 'Markt A', status: 'offer' },
      { name: 'Hähnchenbrustfilet', package: '600 g', price: 2.99, market: 'Markt A', status: 'offer' }
    ],
    basePlan: {}
  });
  const offeredNames = plan.shopping.flatMap(group => group.items)
    .filter(item => item.status === 'offer')
    .map(item => item.name);

  assert.deepEqual(offeredNames, ['Hähnchenschenkel']);
});

test('generateOfferPlan requires both pork neck and steak for pork neck steaks', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'neck-steak', name: 'Nackensteaks', cat: 'Kartoffeln', cost: 14, rating: 5, ingredients: ['750 g Schweinenackensteaks'] }],
    offers: [
      { name: 'Schweinenackensteaks', package: '750 g', price: 4.99, market: 'Markt A', status: 'offer' },
      { name: 'Schweinenackenbraten', package: '750 g', price: 2.99, market: 'Markt A', status: 'offer' }
    ],
    basePlan: {}
  });
  const offeredNames = plan.shopping.flatMap(group => group.items)
    .filter(item => item.status === 'offer')
    .map(item => item.name);

  assert.deepEqual(offeredNames, ['Schweinenackensteaks']);
});

test('generateOfferPlan charges a whole retail package instead of a prorated unit price', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'cheese', name: 'Käse-Abend', cat: 'TK & Ofen', cost: 10, rating: 5, ingredients: ['80 g Käse'] }],
    offers: [{ name: 'Olympus Käse', package: '1,5kg Dose, (1kg=3.99)', price: 5.99, market: 'EDEKA Morsestraße', status: 'offer' }],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  const cheese = plan.shopping.flatMap(group => group.items).find(item => item.name === 'Olympus Käse');
  assert.equal(cheese.price, 5.99);
});

test('generateOfferPlan does not replace parmesan with unrelated white cheese', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'parmesan', name: 'Parmesan-Pasta', cat: 'Nudeln', cost: 12, rating: 5, ingredients: ['80 g Parmesan', '500 g Pasta'] }],
    offers: [
      { name: 'Olympus Weißkäse', package: '1,5kg Dose', price: 5.99, market: 'EDEKA Morsestraße', status: 'offer' },
      { name: 'De Cecco Pasta', package: '500g Packung', price: 1.29, market: 'EDEKA Morsestraße', status: 'offer' }
    ],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  const names = plan.shopping.flatMap(group => group.items).map(item => item.name);
  assert.equal(names.includes('Olympus Weißkäse'), false);
});

test('generateOfferPlan does not replace Spätzle with pasta or grated cheese with soft blue cheese', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'spaetzle', name: 'Käsespätzle', cat: 'Nudeln', cost: 10, rating: 5, ingredients: ['800 g Spätzle', '300 g Käse'] }],
    offers: [
      { market: 'Markt A', name: 'De Cecco Pasta', price: 1.11, package: '500g' },
      { market: 'Markt A', name: 'Bergader Käse', price: 1.79, package: 'Bavaria blu Weichkäse, 100g' }
    ],
    basePlan: {},
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  const offeredNames = plan.shopping.flatMap(group => group.items).filter(item => item.status === 'offer').map(item => item.name);
  assert.deepEqual(offeredNames, []);
});

test('generateOfferPlan rejects prepared salads, milk rice and snack chips as ingredient substitutes', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'meal',
      name: 'Hähnchen-Reis mit Käse',
      cat: 'Reis',
      cost: 18,
      rating: 5,
      ingredients: ['600 g Hähnchen', '400 g Reis', '80 g Käse']
    }],
    offers: [
      { name: 'High Protein Hähnchensalat', package: '310g Schale', price: 2.29, market: 'REWE Eching', status: 'offer' },
      { name: 'Müller Milch Reis', package: '200g Becher', price: 0.49, market: 'REWE Eching', status: 'offer' },
      { name: 'Käse-Chips', package: '100g', price: 1.69, market: 'REWE Eching', status: 'offer' }
    ],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  const offeredNames = plan.shopping.flatMap(group => group.items)
    .filter(item => item.status === 'offer')
    .map(item => item.name);
  assert.deepEqual(offeredNames, []);
});

test('generateOfferPlan ignores optional ingredients when choosing offers', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'pizza', name: 'Pizza', cat: 'TK & Ofen', cost: 12, rating: 5, ingredients: ['2 TK-Pizzen', '500 g Hähnchen optional'] }],
    offers: [
      { name: 'Wagner Pizza', package: '350g', price: 1.59, market: 'EDEKA Morsestraße', status: 'offer' },
      { name: 'Hähnchen-Brustfilet', package: 'je 100g', price: 1.19, market: 'EDEKA Morsestraße', status: 'offer' }
    ],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  const names = plan.shopping.flatMap(group => group.items).map(item => item.name);
  assert.equal(names.includes('Hähnchen-Brustfilet'), false);
});

test('generateOfferPlan does not replace nuggets and fries with schnitzel and potato salad', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'nuggets', name: 'Nuggets mit Pommes', cat: 'TK & Ofen', cost: 13, rating: 5, ingredients: ['500 g Chicken Nuggets', '800 g TK-Pommes'] }],
    offers: [
      { name: 'Hähnchen-Minutenschnitzel', package: '350g Packung', price: 6.79, market: 'EDEKA Morsestraße', status: 'offer' },
      { name: 'Kartoffel-Salat', package: '500g Becher', price: 2.49, market: 'EDEKA Morsestraße', status: 'offer' }
    ],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  const names = plan.shopping.flatMap(group => group.items).map(item => item.name);
  assert.equal(names.includes('Hähnchen-Minutenschnitzel'), false);
  assert.equal(names.includes('Kartoffel-Salat'), false);
});

test('generateOfferPlan scales a two-pizza recipe to one pizza for two people', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'pizza', name: 'Pizza-Abend', cat: 'TK & Ofen', cost: 12, rating: 5, ingredients: ['2 TK-Pizzen'] }],
    offers: [{ name: 'Wagner Pizza', package: '350g Packung', price: 1.59, market: 'EDEKA Morsestraße', status: 'offer' }],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  const pizza = plan.shopping.flatMap(group => group.items).find(item => item.name === 'Wagner Pizza');
  assert.equal(pizza.price, 1.59);
});

test('generateOfferPlan total never falls below confirmed package purchases', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'chicken', name: 'Hähnchen', cat: 'Reis', cost: 10, rating: 5, ingredients: ['600 g Hähnchen'] }],
    offers: [{ name: 'Hähnchen-Brustfilet', package: '350g Packung', price: 6.79, market: 'EDEKA Morsestraße', status: 'offer' }],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  assert.ok(plan.recommendation.estimatedTotal >= plan.recommendation.confirmedOfferTotal);
});

test('generateOfferPlan does not treat chicken ramen as fresh chicken or plain pasta', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'meal', name: 'Hähnchen-Nudeln', cat: 'Nudeln', cost: 17, rating: 5, ingredients: ['600 g Hähnchen', '500 g Nudeln'] }],
    offers: [
      { name: 'Samyang Hot Chicken Ramen', package: '140g Beutel', price: 1.99, market: 'REWE Eching', status: 'offer' },
      { name: 'Knorr Spaghetteria Pasta Spinaci Käse', package: '178g Beutel', price: 1.49, market: 'REWE Eching', status: 'offer' }
    ],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  const names = plan.shopping.flatMap(group => group.items).map(item => item.name);
  assert.equal(names.includes('Samyang Hot Chicken Ramen'), false);
  assert.equal(names.includes('Knorr Spaghetteria Pasta Spinaci Käse'), false);
});

test('generateOfferPlan accepts fresh cucumber but rejects pickled cucumber products for fresh cucumber', () => {
  for (const pickledName of ['K-CLASSIC Gewürzgurken', 'Essig-Gurken', 'Cornichon-Gurken']) {
    const plan = generateOfferPlan({
      recipes: [{ id: 'cucumber', name: 'Gurkensalat', cat: 'Beilagen', cost: 5, rating: 5, ingredients: ['1 Gurke'] }],
      offers: [
        { name: 'Frische Salatgurke', package: '1 Stück', price: 1.29, market: 'Markt A', status: 'offer' },
        { name: pickledName, package: '1 Glas', price: 0.49, market: 'Markt A', status: 'offer' }
      ],
      basePlan: {}
    });
    const offeredNames = plan.shopping.flatMap(group => group.items)
      .filter(item => item.status === 'offer')
      .map(item => item.name);

    assert.deepEqual(offeredNames, ['Frische Salatgurke'], pickledName);
  }
});

test('generateOfferPlan accepts pickled cucumbers for an explicitly pickled cucumber ingredient', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'pickles', name: 'Brotzeit', cat: 'Beilagen', cost: 5, rating: 5, ingredients: ['1 Glas Gewürzgurken'] }],
    offers: [{ name: 'K-CLASSIC Gewürzgurken', package: '1 Glas', price: 0.99, market: 'Markt A', status: 'offer' }],
    basePlan: {}
  });
  const offeredNames = plan.shopping.flatMap(group => group.items)
    .filter(item => item.status === 'offer')
    .map(item => item.name);

  assert.deepEqual(offeredNames, ['K-CLASSIC Gewürzgurken']);
});

test('generateOfferPlan keeps the full cucumber name when fresh cucumber has no matching price', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'cucumber', name: 'Gurkensalat', cat: 'Beilagen', cost: 5, rating: 5, ingredients: ['1 Gurke'] }],
    offers: [{ name: 'Speisekartoffeln', package: '1 kg', price: 0.99, market: 'Markt A', status: 'offer' }],
    basePlan: {}
  });
  const names = plan.shopping.flatMap(group => group.items).map(item => item.name);

  assert.equal(names.includes('Gurke'), true);
  assert.equal(names.includes('urke'), false);
});

test('generateOfferPlan accepts beef broth or stock but rejects minced-meat products for beef broth', () => {
  for (const brothName of ['Rinderbrühe', 'Rinderfond']) {
    const plan = generateOfferPlan({
      recipes: [{
        id: 'broth',
        name: 'Rinderbrühen-Suppe',
        cat: 'Suppen',
        cost: 6,
        rating: 5,
        ingredients: ['600 ml zubereitete Rinderbrühe']
      }],
      offers: [
        { name: brothName, package: '600 ml', price: 1.99, market: 'Markt A', status: 'offer' },
        { name: 'Hackfleischspieße', package: '600 g', price: 0.99, market: 'Markt A', status: 'offer' }
      ],
      basePlan: {}
    });
    const offeredNames = plan.shopping.flatMap(group => group.items)
      .filter(item => item.status === 'offer')
      .map(item => item.name);

    assert.deepEqual(offeredNames, [brothName], brothName);
  }
});

test('generateOfferPlan rejects broth and stock products for generic beef or chicken meat', () => {
  const cases = [
    {
      ingredient: '600 g Rindfleisch',
      meatName: 'Rindergeschnetzeltes',
      brothName: 'Rinderfond'
    },
    {
      ingredient: '600 g Hähnchen',
      meatName: 'Hähnchenbrustfilet',
      brothName: 'Hähnchenfond'
    }
  ];
  for (const scenario of cases) {
    const plan = generateOfferPlan({
      recipes: [{
        id: 'meat',
        name: 'Fleischgericht',
        cat: 'Pfanne',
        cost: 12,
        rating: 5,
        ingredients: [scenario.ingredient]
      }],
      offers: [
        { name: scenario.meatName, package: '600 g', price: 4.99, market: 'Markt A', status: 'offer' },
        { name: scenario.brothName, package: '600 ml', price: 0.99, market: 'Markt A', status: 'offer' }
      ],
      basePlan: {}
    });
    const offeredNames = plan.shopping.flatMap(group => group.items)
      .filter(item => item.status === 'offer')
      .map(item => item.name);

    assert.deepEqual(offeredNames, [scenario.meatName], scenario.ingredient);
  }
});

test('generateOfferPlan favors category variety for the weekly cooking batches', () => {
  const recipes = [
    { id: 'pizza-a', name: 'Pizza A', cat: 'TK & Ofen', cost: 10, rating: 5, ingredients: ['2 TK-Pizzen'] },
    { id: 'pizza-b', name: 'Pizza B', cat: 'TK & Ofen', cost: 11, rating: 5, ingredients: ['2 TK-Pizzen'] },
    { id: 'rice', name: 'Reispfanne', cat: 'Reis', cost: 13, rating: 5, ingredients: ['400 g Reis'] },
    { id: 'pasta', name: 'Nudelpfanne', cat: 'Nudeln', cost: 13, rating: 5, ingredients: ['500 g Nudeln'] }
  ];
  const plan = generateOfferPlan({
    recipes,
    offers: [
      { name: 'Wagner Pizza', package: '350g', price: 1.59, market: 'REWE Eching', status: 'offer' },
      { name: 'Basmati Reis', package: '500g', price: 1.49, market: 'REWE Eching', status: 'offer' },
      { name: 'Barilla Nudeln', package: '500g', price: 0.79, market: 'REWE Eching', status: 'offer' }
    ],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] },
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  const selected = [...new Set(plan.nextWeek.map(day => day.recipeId))];
  assert.equal(selected.filter(id => id.startsWith('pizza-')).length, 1);
});

test('generateOfferPlan uses four distinct recipe categories when enough are available', () => {
  const recipes = [
    { id: 'oven', name: 'Ofengericht', cat: 'TK & Ofen', cost: 12, rating: 5, ingredients: ['2 TK-Pizzen'] },
    { id: 'rice', name: 'Reisgericht', cat: 'Reis', cost: 13, rating: 5, ingredients: ['400 g Reis'] },
    { id: 'pasta-a', name: 'Nudelgericht A', cat: 'Nudeln', cost: 13, rating: 5, ingredients: ['500 g Nudeln'] },
    { id: 'pasta-b', name: 'Nudelgericht B', cat: 'Nudeln', cost: 12, rating: 5, ingredients: ['500 g Nudeln'] },
    { id: 'potato', name: 'Kartoffelgericht', cat: 'Kartoffeln', cost: 14, rating: 5, ingredients: ['1 kg Kartoffeln'] }
  ];
  const plan = generateOfferPlan({
    recipes,
    offers: [
      { name: 'Wagner Pizza', package: '350g', price: 1.59, market: 'REWE Eching', status: 'offer' },
      { name: 'Basmati Reis', package: '500g', price: 1.49, market: 'REWE Eching', status: 'offer' },
      { name: 'Barilla Nudeln', package: '500g', price: 0.79, market: 'REWE Eching', status: 'offer' },
      { name: 'Speisekartoffeln', package: '1kg', price: 1.29, market: 'REWE Eching', status: 'offer' }
    ],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  const ids = [...new Set([...plan.weekend, ...plan.nextWeek].map(day => day.recipeId))];
  const categories = new Set(ids.map(id => recipes.find(recipe => recipe.id === id).cat));
  assert.equal(categories.size, 4);
});

test('generateOfferPlan recognizes German compound product names', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'pork',
      name: 'Mexico-Steaks mit Kartoffeln',
      cat: 'Kartoffeln',
      cost: 14,
      rating: 5,
      ingredients: ['750 g Schweinenackensteaks', '1,2 kg Kartoffeln', '500 g Rispentomaten']
    }],
    offers: [
      { name: 'K-PURLAND Schweinenackensteaks Mexico Style', package: '750-g-Packung', price: 4.49, market: 'Kaufland Lohhof', status: 'offer' },
      { name: 'Deutsche Speisefrühkartoffeln', package: '5-kg-Sack', price: 3.99, market: 'Kaufland Lohhof', status: 'offer' },
      { name: 'Rispentomaten', package: '1 kg', price: 0.99, market: 'Kaufland Lohhof', status: 'offer' }
    ],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  const names = plan.shopping.flatMap(group => group.items).map(item => item.name);
  assert.equal(names.includes('K-PURLAND Schweinenackensteaks Mexico Style'), true);
  assert.equal(names.includes('Deutsche Speisefrühkartoffeln'), true);
  assert.equal(names.includes('Rispentomaten'), true);
});

test('generateOfferPlan does not replace nacken steaks with shoulder roast', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'steak', name: 'Nackensteaks', cat: 'Kartoffeln', cost: 14, rating: 5, ingredients: ['750 g Schweinenackensteaks'] }],
    offers: [{ name: 'Schweine-Schulter-Krustenbraten', package: '100g', price: 0.66, market: 'EDEKA Morsestraße', status: 'offer' }],
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] }
  });
  const names = plan.shopping.flatMap(group => group.items).map(item => item.name);
  assert.equal(names.includes('Schweine-Schulter-Krustenbraten'), false);
});

test('generateOfferPlan does not replace pork schnitzel or strips with nacken steak', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'pork-cuts',
      name: 'Schweinefleisch-Test',
      cat: 'Fleischklassiker',
      cost: 20,
      rating: 5,
      servings: 2,
      ingredients: ['700 g Schweineschnitzel von der Frischetheke', '700 g Schweinegeschnetzeltes']
    }],
    offers: [{
      name: 'K-PURLAND Schweinenackensteak Mexico Style',
      package: '750 g',
      price: 4.49,
      market: 'Kaufland Lohhof',
      status: 'offer'
    }],
    basePlan: {},
    now: new Date('2026-07-26T12:00:00+02:00')
  });
  const items = plan.shopping.flatMap(group => group.items);

  assert.equal(items.some(item => item.name === 'K-PURLAND Schweinenackensteak Mexico Style'), false);
  assert.equal(items.some(item => /Schweineschnitzel/i.test(item.name)), true);
  assert.equal(items.some(item => /Schweinegeschnetzeltes/i.test(item.name)), true);
});

test('generateOfferPlan prices every cooking batch across weekend and next week', () => {
  const recipes = Array.from({ length: 10 }, (_, index) => ({
    id: `potato-${index}`,
    name: `Kartoffelgericht ${index}`,
    cat: `Kategorie ${index}`,
    cost: 8,
    rating: 5,
    ingredients: ['1 kg Kartoffeln']
  }));
  const offers = [{ name: 'Speisekartoffeln', package: '1kg', price: 1, market: 'Kaufland Lohhof', status: 'offer' }];
  const plan = generateOfferPlan({
    recipes,
    offers,
    basePlan: { weekend: [], nextWeek: [], recommendation: {}, shopping: [] },
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  assert.equal(plan.recommendation.confirmedOfferTotal, 10);
});

test('buildMealPrepPlan derives chilling, freezing and fresh cooking from the generated week', () => {
  const recipes = [
    { id: 'monday', name: 'Montags-Pasta', time: 25, freeze: 'Ja', steps: ['Nudeln kochen.', 'Soße mischen.'] },
    { id: 'wednesday', name: 'Spinat-Kartoffeln', time: 30, freeze: 'Kartoffeln und Spinat ja, Spiegelei frisch', steps: ['Kartoffeln kochen.', 'Spiegelei braten.'] },
    { id: 'friday', name: 'Auflauf', time: 40, freeze: 'Ja, bis 3 Monate', steps: ['Auflauf backen.'] }
  ];
  const nextWeek = [
    { day: 'Mo 27.07.', recipeId: 'monday' },
    { day: 'Di 28.07.', recipeId: 'monday' },
    { day: 'Mi 29.07.', recipeId: 'wednesday' },
    { day: 'Do 30.07.', recipeId: 'wednesday' },
    { day: 'Fr 31.07.', recipeId: 'friday' },
    { day: 'Sa 01.08.', recipeId: 'friday' }
  ];

  const prep = buildMealPrepPlan({ recipes, nextWeek });

  assert.equal(prep.batches.length, 3);
  assert.equal(prep.batches[0].storage, 'Kühlschrank');
  assert.equal(prep.batches[2].storage, 'Gefrierschrank');
  assert.match(prep.batches[1].instruction, /Spiegelei frisch/i);
  assert.ok(prep.steps.some(step => /beschriften/i.test(step.instruction)));
});

test('generateOfferPlan treats Milch as an exclusion for dairy ingredients and persists it', () => {
  const recipes = [
    { id: 'cream', name: 'Rahmnudeln', cat: 'Nudeln', cost: 8, rating: 5, ingredients: ['500 g Nudeln', '200 ml Kochsahne'] },
    { id: 'cheese', name: 'Käseauflauf', cat: 'Auflauf', cost: 9, rating: 5, ingredients: ['200 g Käse', '1 kg Kartoffeln'] },
    { id: 'pizza', name: 'Pizza-Abend', cat: 'TK', cost: 8, rating: 5, ingredients: ['2 TK-Pizzen'], allergens: ['Milch'] },
    { id: 'plain', name: 'Bratkartoffeln', cat: 'Kartoffeln', cost: 7, rating: 4, ingredients: ['1 kg Kartoffeln', '2 Zwiebeln'] }
  ];
  const plan = generateOfferPlan({
    recipes,
    offers: [{ market: 'Markt A', name: 'Kartoffeln', price: 1.99, package: '1 kg' }],
    basePlan: {},
    excludedIngredients: ['Milch'],
    now: new Date('2026-07-24T12:00:00+02:00')
  });

  assert.deepEqual([...new Set(plan.nextWeek.map(day => day.recipeId))], ['plain']);
  assert.deepEqual(plan.preferences.excludedIngredients, ['Milch']);
});

test('generateOfferPlan limits meat-heavy batches and includes pasta plus two meat-free choices', () => {
  const recipes = [
    { id: 'veg-pasta', name: 'Spinatnudeln', cat: 'Nudeln', cost: 12, rating: 4, ingredients: ['500 g Nudeln', '500 g Spinat'] },
    { id: 'veg-potato', name: 'Kartoffel-Ei-Pfanne', cat: 'Kartoffeln', cost: 11, rating: 4, ingredients: ['1 kg Kartoffeln', '6 Eier'] },
    { id: 'veg-rice', name: 'Gemüsereis', cat: 'Reis', cost: 10, rating: 4, ingredients: ['400 g Reis', '500 g Brokkoli'] },
    { id: 'veg-bowl', name: 'Gemüse-Bowl', cat: 'Gemüse', cost: 10, rating: 4, ingredients: ['500 g Brokkoli', '6 Eier'] },
    { id: 'meat-rice', name: 'Hähnchenreis', cat: 'Reispfanne', cost: 5, rating: 5, ingredients: ['600 g Hähnchen', '400 g Reis'] },
    { id: 'meat-potato', name: 'Steak mit Kartoffeln', cat: 'Fleisch', cost: 5, rating: 5, ingredients: ['700 g Schwein', '1 kg Kartoffeln'] },
    { id: 'meat-wrap', name: 'Chicken Wrap', cat: 'Bowls', cost: 5, rating: 5, ingredients: ['600 g Chicken', '8 Wraps'] },
    { id: 'meat-oven', name: 'Hackauflauf', cat: 'Auflauf', cost: 5, rating: 5, ingredients: ['700 g Rinderhack', '200 g Käse'] }
  ];
  const plan = generateOfferPlan({
    recipes,
    offers: [
      { market: 'Markt A', name: 'Hähnchenbrust', price: 1, package: '1 kg' },
      { market: 'Markt A', name: 'Rinderhack', price: 1, package: '1 kg' },
      { market: 'Markt A', name: 'Schweinesteak', price: 1, package: '1 kg' },
      { market: 'Markt A', name: 'Nudeln', price: 1, package: '500 g' },
      { market: 'Markt A', name: 'Kartoffeln', price: 1, package: '1 kg' },
      { market: 'Markt A', name: 'Reis', price: 1, package: '500 g' }
    ],
    basePlan: {},
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  const ids = [...new Set([...plan.weekend, ...plan.nextWeek].map(day => day.recipeId))];
  const selected = ids.map(id => recipes.find(recipe => recipe.id === id));
  const meat = /(hähnchen|chicken|rind|hack|schwein|steak)/i;

  assert.equal(selected.filter(recipe => meat.test(`${recipe.name} ${recipe.ingredients.join(' ')}`)).length <= Math.floor(selected.length / 2), true);
  assert.equal(selected.filter(recipe => !meat.test(`${recipe.name} ${recipe.ingredients.join(' ')}`)).length >= Math.ceil(selected.length / 2), true);
  assert.equal(selected.some(recipe => recipe.cat === 'Nudeln'), true);
});

test('generateOfferPlan exposes published regular prices and savings for matched offers', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'pasta', name: 'Pasta', cat: 'Nudeln', cost: 8, rating: 5, ingredients: ['500 g Nudeln'] }],
    offers: [{
      market: 'Kaufland Lohhof',
      name: 'Barilla Nudeln',
      price: 0.69,
      previousPrice: 1.99,
      referencePriceType: 'regular-price',
      package: '500 g',
      status: 'offer'
    }],
    basePlan: {},
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  const item = plan.shopping.flatMap(group => group.items).find(entry => entry.name === 'Barilla Nudeln');

  assert.equal(item.regularPrice, 1.99);
  assert.equal(item.savings, 1.3);
  assert.equal(plan.recommendation.publishedSavings > 0, true);
  assert.equal(plan.recommendation.normalPriceCoverage > 0, true);
});

test('generateOfferPlan uses a matching public regular price for a needed ingredient without an offer', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'spinach-pasta',
      name: 'Spinatnudeln',
      cat: 'Nudeln',
      cost: 9,
      rating: 5,
      servings: 2,
      ingredients: ['500 g Nudeln', '400 g TK-Spinat']
    }],
    offers: [{
      market: 'REWE Eching',
      name: 'ja! Spaghetti',
      price: 0.79,
      package: '500 g',
      status: 'offer'
    }],
    regularPrices: [{
      market: 'REWE Eching',
      query: 'Spinat',
      name: 'REWE Bio Blattspinat',
      price: 1.49,
      package: '450 g',
      priceType: 'regular',
      sourceUrl: 'https://www.rewe.de/shop/suche?search=Spinat',
      capturedAt: '2026-07-24T12:00:00.000Z'
    }],
    basePlan: {},
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  const spinach = plan.shopping.flatMap(group => group.items).find(item => /Blattspinat/i.test(item.name));

  assert.equal(spinach.status, 'regular');
  assert.equal(spinach.price, 1.49);
  assert.equal(spinach.sourceUrl, 'https://www.rewe.de/shop/suche?search=Spinat');
  assert.equal(plan.recommendation.confirmedRegularTotal, 1.49);
});

test('generateOfferPlan keeps a cheaper offer ahead of a public regular price', () => {
  const plan = generateOfferPlan({
    recipes: [{ id: 'pasta', name: 'Pasta', cat: 'Nudeln', cost: 8, rating: 5, servings: 2, ingredients: ['500 g Nudeln'] }],
    offers: [{ market: 'REWE Eching', name: 'Barilla Nudeln', price: 0.69, package: '500 g', status: 'offer' }],
    regularPrices: [{
      market: 'REWE Eching',
      query: 'Nudeln',
      name: 'ja! Spaghetti',
      price: 0.79,
      package: '500 g',
      priceType: 'regular',
      capturedAt: '2026-07-24T12:00:00.000Z'
    }],
    basePlan: {},
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  const item = plan.shopping.flatMap(group => group.items).find(entry => entry.name === 'Barilla Nudeln');

  assert.equal(item.status, 'offer');
  assert.equal(plan.recommendation.confirmedOfferTotal, 0.69);
  assert.equal(plan.recommendation.confirmedRegularTotal, 0);
});

test('generateOfferPlan lists every concrete required ingredient instead of per-recipe remainder blocks', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'simple-pasta',
      name: 'Einfache Nudeln',
      cat: 'Nudeln',
      cost: 8,
      rating: 5,
      servings: 2,
      ingredients: ['500 g Nudeln', '2 Knoblauchzehen', '300 ml Gemüsebrühe', 'Salz', 'Parmesan optional']
    }],
    offers: [{ market: 'REWE Eching', name: 'ja! Spaghetti', price: 0.79, package: '500 g', status: 'offer' }],
    basePlan: {},
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  const items = plan.shopping.flatMap(group => group.items);
  const names = items.map(item => item.name);
  const salt = items.find(item => item.name === 'Salz');

  assert.equal(names.some(name => name.startsWith('Weitere Zutaten für')), false);
  assert.equal(names.some(name => /Knoblauchzehen/i.test(name)), true);
  assert.equal(names.some(name => /Gemüsebrühe/i.test(name)), true);
  assert.equal(names.includes('Salz'), true);
  assert.equal(names.some(name => /Parmesan/i.test(name)), false);
  assert.equal(salt.price, null);
});

test('generateOfferPlan keeps different ingredients from the same price category', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'two-cheeses',
      name: 'Pasta mit zwei Käsen',
      cat: 'Nudeln',
      cost: 12,
      rating: 5,
      servings: 2,
      ingredients: ['500 g Nudeln', '80 g Parmesan', '125 g Mozzarella']
    }],
    offers: [
      { market: 'REWE Eching', name: 'ja! Spaghetti', price: 0.79, package: '500 g', status: 'offer' },
      { market: 'REWE Eching', name: 'Parmesan', price: 2.49, package: '100 g', status: 'offer' }
    ],
    basePlan: {},
    now: new Date('2026-07-26T12:00:00+02:00')
  });
  const names = plan.shopping.flatMap(group => group.items).map(item => item.name);

  assert.equal(names.some(name => /Parmesan/i.test(name)), true);
  assert.equal(names.some(name => /Mozzarella/i.test(name)), true);
});

test('generateOfferPlan assigns every required ingredient to exactly one shopping item', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'complete-pasta',
      name: 'Vollständige Pasta',
      cat: 'Nudeln',
      cost: 12,
      rating: 5,
      servings: 2,
      ingredients: ['500 g Nudeln', '80 g Parmesan', '2 Knoblauchzehen', 'Salz', 'Basilikum optional']
    }],
    offers: [
      { market: 'REWE Eching', name: 'ja! Spaghetti', price: 0.79, package: '500 g', status: 'offer' },
      { market: 'REWE Eching', name: 'Parmesan', price: 2.49, package: '100 g', status: 'offer' }
    ],
    basePlan: {},
    now: new Date('2026-07-26T12:00:00+02:00')
  });
  const ingredientIds = plan.shopping
    .flatMap(group => group.items)
    .flatMap(item => item.ingredientIds || []);

  assert.equal(ingredientIds.length, 4);
  assert.equal(new Set(ingredientIds).size, 4);
});

test('generateOfferPlan groups priced and estimated items by supermarket department', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'departments',
      name: 'Abteilungs-Test',
      cat: 'Pfanne',
      cost: 20,
      rating: 5,
      servings: 2,
      ingredients: [
        '650 g Rindergeschnetzeltes',
        '600 g TK-Blattspinat',
        '1 Gurke',
        '2 Zwiebeln',
        '2 Knoblauchzehen',
        '400 g Couscous',
        '150 g Paniermehl',
        '500 ml zubereitete Rinderbrühe',
        '2 EL Öl',
        '1 EL Senf',
        '1 TL Stärke'
      ]
    }],
    offers: [{ name: 'Tafelsalz', package: '500 g', price: 0.49, market: 'Markt A', status: 'offer' }],
    basePlan: {}
  });
  const namesByDepartment = Object.fromEntries(
    plan.shopping.map(group => [group.department, group.items.map(item => item.name)])
  );

  assert.ok(namesByDepartment['Fleisch & Frischetheke'].includes('Rindergeschnetzeltes'));
  assert.ok(namesByDepartment['Kühlregal & Tiefkühl'].includes('TK-Blattspinat'));
  assert.deepEqual(
    ['Gurke', 'Zwiebeln', 'Knoblauchzehen'].every(name => namesByDepartment['Obst & Gemüse'].includes(name)),
    true
  );
  assert.deepEqual(
    ['Couscous', 'Paniermehl'].every(name => namesByDepartment['Nudeln, Reis & Beilagen'].includes(name)),
    true
  );
  assert.deepEqual(
    ['zubereitete Rinderbrühe', 'Öl', 'Senf', 'Stärke']
      .every(name => namesByDepartment['Soßen, Gewürze & Vorrat'].includes(name)),
    true
  );
  assert.equal(
    (namesByDepartment['Weitere Zutaten'] || []).some(name => /Rindergeschnetzeltes|Spinat|Gurke|Zwiebel|Knoblauch|Couscous|Paniermehl|Brühe|Öl|Senf|Stärke/i.test(name)),
    false
  );
});

test('generateOfferPlan puts priced and estimated items from the same category in the same department', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'same-department',
      name: 'Gurken-Test',
      cat: 'Salat',
      cost: 8,
      rating: 5,
      servings: 2,
      ingredients: ['1 Gurke', '200 g Gewürzgurken']
    }],
    offers: [{ name: 'Gurke', package: '1 Stück', price: 0.79, market: 'Markt A', status: 'offer' }],
    basePlan: {}
  });
  const pricedGroup = plan.shopping.find(group => (
    group.items.some(item => item.name === 'Gurke' && item.status === 'offer')
  ));
  const estimatedGroup = plan.shopping.find(group => (
    group.items.some(item => item.name === 'Gewürzgurken' && item.status === 'estimated')
  ));

  assert.equal(pricedGroup.department, estimatedGroup.department);
  assert.equal(pricedGroup.department, 'Obst & Gemüse');
});

test('shoppingDepartment assigns known catalog names to supermarket departments', () => {
  const cases = [
    ['Paprikapulver', 'peppers', 'Soßen, Gewürze & Vorrat'],
    ['Currypulver', null, 'Soßen, Gewürze & Vorrat'],
    ['Curry', null, 'Soßen, Gewürze & Vorrat'],
    ['Gewürze', null, 'Soßen, Gewürze & Vorrat'],
    ['Pfeffer', null, 'Soßen, Gewürze & Vorrat'],
    ['Kräuter', null, 'Soßen, Gewürze & Vorrat'],
    ['Rosmarin', null, 'Soßen, Gewürze & Vorrat'],
    ['Salz', null, 'Soßen, Gewürze & Vorrat'],
    ['Muskat', null, 'Soßen, Gewürze & Vorrat'],
    ['Knoblauchpulver', null, 'Soßen, Gewürze & Vorrat'],
    ['Kurkuma', null, 'Soßen, Gewürze & Vorrat'],
    ['Chiliflocken', null, 'Soßen, Gewürze & Vorrat'],
    ['getrockneter Oregano', null, 'Soßen, Gewürze & Vorrat'],
    ['getrockneter Thymian', null, 'Soßen, Gewürze & Vorrat'],
    ['getrockneter Majoran', null, 'Soßen, Gewürze & Vorrat'],
    ['Hoisin', null, 'Soßen, Gewürze & Vorrat'],
    ['Pesto', null, 'Soßen, Gewürze & Vorrat'],
    ['Honig', null, 'Soßen, Gewürze & Vorrat'],
    ['Sesam', null, 'Soßen, Gewürze & Vorrat'],
    ['Milch', null, 'Kühlregal & Tiefkühl'],
    ['Butter', null, 'Kühlregal & Tiefkühl'],
    ['Quark', null, 'Kühlregal & Tiefkühl'],
    ['Ei', 'eggs', 'Kühlregal & Tiefkühl'],
    ['Basmatireis', 'rice', 'Nudeln, Reis & Beilagen'],
    ['Bandnudeln', 'pasta', 'Nudeln, Reis & Beilagen'],
    ['Wraps', 'wraps', 'Nudeln, Reis & Beilagen'],
    ['Salat', null, 'Obst & Gemüse'],
    ['Asia-Gemüse', null, 'Obst & Gemüse'],
    ['Champignons', null, 'Obst & Gemüse'],
    ['Paprika', 'peppers', 'Obst & Gemüse'],
    ['Kräuterquark', null, 'Kühlregal & Tiefkühl'],
    ['Dressing nach Wahl', null, 'Soßen, Gewürze & Vorrat'],
    ['Käsetortellini', null, 'Kühlregal & Tiefkühl']
  ];

  for (const [name, category, department] of cases) {
    assert.equal(shoppingDepartment({ name, category }), department, name);
  }
});

test('generateOfferPlan groups known catalog ingredients outside Weitere Zutaten', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'catalog-departments',
      name: 'Katalog-Abteilungs-Test',
      cat: 'Pfanne',
      cost: 12,
      rating: 5,
      servings: 2,
      ingredients: ['250 g Bandnudeln', '2 Wraps', '1 TL Paprikapulver', '200 ml Milch', '1 Salat']
    }],
    offers: [{ name: 'Tafelsalz', package: '500 g', price: 0.49, market: 'Markt A', status: 'offer' }],
    basePlan: {}
  });
  const namesByDepartment = Object.fromEntries(
    plan.shopping.map(group => [group.department, group.items.map(item => item.name)])
  );

  assert.deepEqual(namesByDepartment['Nudeln, Reis & Beilagen'], ['Bandnudeln', 'Wraps']);
  assert.deepEqual(namesByDepartment['Soßen, Gewürze & Vorrat'], ['Paprikapulver']);
  assert.deepEqual(namesByDepartment['Kühlregal & Tiefkühl'], ['Milch']);
  assert.deepEqual(namesByDepartment['Obst & Gemüse'], ['Salat']);
  assert.equal(namesByDepartment['Weitere Zutaten'], undefined);
});

test('generateOfferPlan scales measured pantry quantities and separates them from item names', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'scaled-seasoning',
      name: 'Skalierte Gewürze',
      cat: 'Pfanne',
      cost: 8,
      rating: 5,
      servings: 4,
      ingredients: [
        '1/2 TL Muskat',
        '3/4 TL Salz',
        '1/4 TL Knoblauchpulver',
        '1 EL Olivenöl',
        '1 Prise Chili',
        '400 g Couscous',
        '2 Zwiebeln'
      ]
    }],
    offers: [{ name: 'Testartikel', package: '1 Stück', price: 0.49, market: 'Markt A', status: 'offer' }],
    basePlan: {}
  });
  const pantry = plan.shopping.find(group => group.department === 'Soßen, Gewürze & Vorrat');
  const quantityByName = new Map(pantry.items.map(item => [item.name, item.quantity]));

  assert.match(quantityByName.get('Muskat'), /^1\/4 TL\b/);
  assert.match(quantityByName.get('Salz'), /^3\/8 TL\b/);
  assert.match(quantityByName.get('Knoblauchpulver'), /^1\/8 TL\b/);
  assert.match(quantityByName.get('Olivenöl'), /^1\/2 EL\b/);
  assert.match(quantityByName.get('Chili'), /^1\/2 Prise\b/);
  const items = plan.shopping.flatMap(group => group.items);
  assert.equal(items.find(item => item.name === 'Couscous').quantity, '200 g · 1 Kochblock');
  assert.equal(items.find(item => item.name === 'Zwiebeln').quantity, '1 · 1 Kochblock');
  assert.deepEqual([...quantityByName.keys()], ['Muskat', 'Salz', 'Knoblauchpulver', 'Olivenöl', 'Chili']);
});

test('generateOfferPlan carries measured recipe seasoning into pantry shopping', () => {
  const recipe = catalogRecipes.find(item => item.id === 'garlic-pasta');
  const plan = generateOfferPlan({
    recipes: [recipe],
    offers: [{ name: 'Penne', package: '500 g', price: 0.99, market: 'Testmarkt', status: 'offer' }],
    basePlan: {},
    now: new Date('2026-07-27T12:00:00+02:00')
  });
  const pantry = plan.shopping.find(group => group.department === 'Soßen, Gewürze & Vorrat');

  assert.ok(pantry.items.some(item => /Paprikapulver/i.test(item.name)));
  assert.ok(pantry.items.some(item => /Pfeffer/i.test(item.name)));
});

test('generateOfferPlan does not substitute fresh peppers for paprika powder', () => {
  const plan = generateOfferPlan({
    recipes: [{
      id: 'paprika-powder',
      name: 'Paprikapulver-Test',
      cat: 'Pfanne',
      cost: 8,
      rating: 5,
      servings: 4,
      ingredients: ['1 TL mildes Paprikapulver']
    }],
    offers: [{ name: 'Spitzpaprika', package: '500 g', price: 1.49, market: 'Markt A', status: 'offer' }],
    basePlan: {}
  });
  const pantry = plan.shopping.find(group => group.department === 'Soßen, Gewürze & Vorrat');
  assert.ok(pantry, 'Paprikapulver fehlt als geschätzte Gewürzposition');
  const powder = pantry.items.find(item => item.name === 'mildes Paprikapulver');

  assert.equal(powder.status, 'estimated');
  assert.equal(powder.quantity, '1/2 TL · 1 Kochblock');
  assert.equal(plan.shopping.flatMap(group => group.items).some(item => item.name === 'Spitzpaprika'), false);
});

test('generateOfferPlan catalog audit leaves no required ingredient in Weitere Zutaten', () => {
  assert.equal(catalogRecipes.length, 100);
  const audit = {
    unplannedRecipes: [],
    incompleteRecipes: [],
    furtherIngredients: []
  };
  const offers = [{
    name: 'Tafelsalz',
    package: '500 g',
    price: 0.49,
    market: 'Audit-Markt',
    status: 'offer'
  }];

  for (const recipe of catalogRecipes) {
    const requiredCount = (recipe.ingredients || []).filter(ingredient => !/\boptional\b/i.test(ingredient)).length;
    const plan = generateOfferPlan({
      recipes: [recipe],
      offers,
      basePlan: {},
      now: new Date('2026-07-26T12:00:00+02:00')
    });
    if (!plan.computedFromOffers) {
      audit.unplannedRecipes.push(recipe.id);
      continue;
    }
    const shoppingItems = plan.shopping.flatMap(group => group.items);
    const coveredCount = shoppingItems.flatMap(item => item.ingredientIds || []).length;
    if (coveredCount !== requiredCount) {
      audit.incompleteRecipes.push(`${recipe.id}: ${coveredCount}/${requiredCount}`);
    }
    const furtherGroup = plan.shopping.find(group => group.department === 'Weitere Zutaten');
    for (const item of furtherGroup?.items || []) {
      audit.furtherIngredients.push(`${recipe.id}: ${item.name}`);
    }
  }

  assert.deepEqual(audit, {
    unplannedRecipes: [],
    incompleteRecipes: [],
    furtherIngredients: []
  });
});

test('generateOfferPlan uses ten different recipes across today-to-Sunday and next week', () => {
  const recipes = Array.from({ length: 12 }, (_, index) => ({
    id: `recipe-${index}`,
    name: index % 2 ? `Gemüsegericht ${index}` : `Nudelgericht ${index}`,
    cat: index % 3 === 0 ? 'Nudeln' : `Kategorie ${index}`,
    cost: 10 + index,
    rating: 4,
    ingredients: index % 2 ? ['1 kg Kartoffeln', '6 Eier'] : ['500 g Nudeln', '500 g Spinat']
  }));
  const plan = generateOfferPlan({
    recipes,
    offers: [
      { market: 'Markt A', name: 'Nudeln', price: 1, package: '500 g' },
      { market: 'Markt A', name: 'Kartoffeln', price: 2, package: '1 kg' },
      { market: 'Markt A', name: 'Eier', price: 3, package: '10 Stück' }
    ],
    basePlan: {},
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  const timeline = [...plan.weekend, ...plan.nextWeek];

  assert.equal(timeline.length, 10);
  assert.equal(new Set(timeline.map(day => day.recipeId)).size, 10);
  assert.equal(timeline.some(day => /Restetag/i.test(day.reason)), false);
});

test('generateOfferPlan scales ingredient quantities to two portions for unique daily meals', () => {
  const recipes = Array.from({ length: 10 }, (_, index) => ({
    id: `potato-${index}`,
    name: `Kartoffelgericht ${index}`,
    cat: `Kategorie ${index}`,
    cost: 8,
    rating: 4,
    servings: 4,
    ingredients: ['1.2 kg Kartoffeln']
  }));
  const plan = generateOfferPlan({
    recipes,
    offers: [{ market: 'Markt A', name: 'Kartoffeln', price: 2, package: '1 kg' }],
    basePlan: {},
    now: new Date('2026-07-24T12:00:00+02:00')
  });
  const potato = plan.shopping.flatMap(group => group.items).find(item => item.name === 'Kartoffeln');

  assert.equal(potato.price, 20);
  assert.match(potato.quantity, /10 Gerichte/);
});
