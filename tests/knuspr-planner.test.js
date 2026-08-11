'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildIngredientDemands,
  buildKnusprPlan,
  isVegetarianRecipe,
  selectKnusprWeek,
} = require('../server/planner');
const { recipes: realCatalog } = require('../data');
const { createKnusprService } = require('../server/knuspr-service');
const { createKnusprStore } = require('../server/knuspr/store');

function recipe(id, {
  vegetarian = true,
  category = id,
  ingredients = [`500 g ${id}`],
  cost = 8,
} = {}) {
  return {
    id,
    name: id,
    cat: category,
    vegetarian,
    tags: vegetarian ? ['fleischfrei'] : ['Fleisch'],
    ingredients,
    servings: 4,
    cost,
    rating: 4.5,
    time: 25,
    freeze: 'Ja',
    steps: [`${id} vorbereiten.`, `${id} garen.`],
  };
}

function product(id, name, price = 1, amount = 500, unit = 'g') {
  return {
    id,
    name,
    brand: null,
    available: true,
    imageUrl: null,
    package: { amount, unit, label: `${amount} ${unit}` },
    price: { current: price, regular: null, unit: null, unitLabel: null, offer: false },
    qualityTags: [],
  };
}

function memoryStore(initial = {}) {
  const files = new Map(Object.entries(structuredClone(initial)));
  return {
    async read(name, fallback) {
      return files.has(name) ? structuredClone(files.get(name)) : fallback;
    },
    async write(name, value) {
      files.set(name, structuredClone(value));
    },
    async remove(name) {
      files.delete(name);
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function schemaFivePlan(recipeIds = ['one', 'two', 'three', 'four', 'five', 'six', 'seven']) {
  const days = recipeIds.map((recipeId, index) => ({
    date: `2026-08-${String(17 + index).padStart(2, '0')}`,
    day: `Tag ${index + 1}`,
    recipeId,
    name: recipeId,
    vegetarian: index < 4,
  }));
  return {
    schemaVersion: 5,
    generatedAt: '2026-08-10T10:00:00.000Z',
    planRevision: 'saved',
    variation: 0,
    servings: 2,
    days,
    shoppingPreview: { generatedAt: '2026-08-10T10:00:00.000Z', days, revision: 'saved', lines: [] },
    mealPrep: { batches: [], steps: [] },
    excludedIngredients: [],
  };
}

function catalog() {
  return [
    recipe('spinach-pasta', { category: 'Nudeln', ingredients: ['500 g Spinat'] }),
    recipe('potato-pan', { category: 'Kartoffeln', ingredients: ['1 kg Kartoffeln'] }),
    recipe('rice-bowl', { category: 'Reis', ingredients: ['400 g Reis'] }),
    recipe('broccoli-bake', { category: 'Ofen', ingredients: ['500 g Brokkoli'] }),
    recipe('gnocchi', { category: 'Nudeln', ingredients: ['500 g Gnocchi'] }),
    recipe('chicken', { vegetarian: false, category: 'Fleisch', ingredients: ['600 g Hähnchenbrust'] }),
    recipe('pork', { vegetarian: false, category: 'Fleisch', ingredients: ['600 g Schweineschnitzel'] }),
    recipe('beef', { vegetarian: false, category: 'Fleisch', ingredients: ['600 g Rindergeschnetzeltes'] }),
  ];
}

function adapterForProducts({ fail, onSearch } = {}) {
  return {
    async searchProducts(query) {
      onSearch?.(query);
      if (fail) throw new Error('Knuspr ist vorübergehend nicht erreichbar');
      if (/Kartoffeln/i.test(query)) return [product('potatoes', 'Kartoffeln', 1.99, 1000)];
      if (/Reis/i.test(query)) return [product('rice', 'Reis', 1.49, 500)];
      if (/Pasta/i.test(query)) return [product('pasta', 'Pasta', 1.29, 500)];
      if (/Spinat/i.test(query)) return [product('spinach', 'Spinat', 2.49, 500)];
      if (/Hähnchenbrust/i.test(query)) return [product('chicken', 'Hähnchenbrustfilet', 5.49, 600)];
      if (/Schweineschnitzel/i.test(query)) return [product('pork', 'Schweineschnitzel', 4.49, 600)];
      if (/Rindergeschnetzeltes/i.test(query)) return [product('beef', 'Rindergeschnetzeltes', 6.49, 600)];
      return [product(`product-${query}`, query, 1.99, 500)];
    },
  };
}

function serviceWithCatalog(recipes, options = {}) {
  return createKnusprService({
    adapter: options.adapter || adapterForProducts(),
    store: options.store || memoryStore(),
    recipes,
    now: options.now || (() => new Date('2026-08-11T10:00:00.000Z')),
    concurrency: options.concurrency || 3,
  });
}

test('planner selects seven unique dinners for two and at least four vegetarian meals', async () => {
  const recipes = catalog();
  const plan = await serviceWithCatalog(recipes).generatePlan({ excludedIngredients: [], variation: 0 });

  assert.equal(plan.schemaVersion, 5);
  assert.equal(plan.days.length, 7);
  assert.equal(new Set(plan.days.map((day) => day.recipeId)).size, 7);
  assert.ok(plan.days.filter((day) => recipes.find((item) => item.id === day.recipeId).vegetarian).length >= 4);
  assert.equal(plan.servings, 2);
  assert.equal(plan.excludedIngredients.length, 0);
  assert.equal('recommendation' in plan, false);
  assert.equal('shopping' in plan, false);
});

test('generation rejects fewer than seven eligible dinners and preserves the saved plan and preview', async () => {
  const savedPlan = schemaFivePlan();
  const store = memoryStore({
    'current-plan.json': savedPlan,
    'knuspr-preview.json': savedPlan.shoppingPreview,
  });
  let searches = 0;
  const service = serviceWithCatalog(catalog().slice(0, 6), {
    store,
    adapter: adapterForProducts({ onSearch: () => { searches += 1; } }),
  });

  await assert.rejects(service.generatePlan({ excludedIngredients: [] }), /sieben.*Gerichte|7.*Gerichte/i);

  assert.equal(searches, 0);
  assert.deepEqual(await store.read('current-plan.json', null), savedPlan);
  assert.deepEqual(await store.read('knuspr-preview.json', null), savedPlan.shoppingPreview);
});

test('schema-5 reads reject duplicate dinner recipe ids', async () => {
  const duplicate = schemaFivePlan(['one', 'two', 'three', 'four', 'five', 'six', 'one']);
  const service = serviceWithCatalog(catalog(), {
    store: memoryStore({ 'current-plan.json': duplicate }),
  });

  assert.equal(await service.getPlan(), null);
});

test('vegetarian balance does not misclassify meat in German compound names', () => {
  assert.equal(isVegetarianRecipe(realCatalog.find(item => item.id === 'burger')), false);
  assert.equal(isVegetarianRecipe(realCatalog.find(item => item.id === 'meatball-orzo-pan')), false);
  assert.equal(isVegetarianRecipe(realCatalog.find(item => item.id === 'lentil-bolognese')), true);
});

test('planner filters exclusions before selection and rotates deterministic alternatives', () => {
  const recipes = catalog();
  const choices = buildIngredientDemands(recipes, { servings: 2 }).map((demand) => ({ demand, status: 'missing' }));
  const first = selectKnusprWeek({ recipes, productChoices: choices, exclusions: ['Schwein'], variation: 0, now: new Date('2026-08-11') });
  const rerolled = selectKnusprWeek({ recipes, productChoices: choices, exclusions: ['Schwein'], variation: 1, now: new Date('2026-08-11') });

  assert.equal(first.some((item) => item.id === 'pork'), false);
  assert.notDeepEqual(first.map((item) => item.id), rerolled.map((item) => item.id));
});

test('Ei exclusion rejects egg recipes without false-positive matching Reis', () => {
  const recipes = [
    recipe('egg-meal', { ingredients: ['4 Eier'] }),
    recipe('rice-meal', { ingredients: ['400 g Reis'] }),
    ...catalog().slice(0, 6),
  ];
  const choices = buildIngredientDemands(recipes, { servings: 2 }).map(demand => ({ demand, status: 'missing' }));
  const selected = selectKnusprWeek({ recipes, productChoices: choices, exclusions: ['Ei'], variation: 0 });

  assert.equal(selected.length, 7);
  assert.equal(selected.some(item => item.id === 'egg-meal'), false);
  assert.equal(selected.some(item => item.id === 'rice-meal'), true);
});

test('Nuss and folded Nüsse exclusions reject Walnüsse in compound ingredients', () => {
  const recipes = [
    recipe('walnut-meal', { ingredients: ['100 g Walnüsse'] }),
    ...catalog().slice(0, 7),
  ];
  const choices = buildIngredientDemands(recipes, { servings: 2 }).map(demand => ({ demand, status: 'missing' }));

  for (const exclusion of ['Nuss', 'Nüsse']) {
    const selected = selectKnusprWeek({ recipes, productChoices: choices, exclusions: [exclusion], variation: 0 });
    assert.equal(selected.length, 7, exclusion);
    assert.equal(selected.some(item => item.id === 'walnut-meal'), false, exclusion);
  }
});

test('planner reuses a purchased pack across recipes instead of charging it twice', async () => {
  const recipes = [
    recipe('spinach-gnocchi', { ingredients: ['400 g Spinat'] }),
    recipe('spinach-pasta', { ingredients: ['600 g Spinat'] }),
    recipe('potato-pan'), recipe('rice-bowl'), recipe('broccoli-bake'),
    recipe('chicken', { vegetarian: false }), recipe('beef', { vegetarian: false }),
  ];
  const plan = await serviceWithCatalog(recipes).generatePlan({ variation: 0 });
  const spinach = plan.shoppingPreview.lines.find((line) => line.demand.searchTerm === 'Spinat');

  assert.equal(spinach.productPackages, 1);
  assert.equal(spinach.totalPrice, 2.49);
  assert.deepEqual(spinach.recipeIds.slice().sort(), ['spinach-gnocchi', 'spinach-pasta']);
});

test('planner consolidates compatible potato wording mapped to the same SKU and charges one pack', async () => {
  const recipes = [
    recipe('plain-potatoes', { ingredients: ['600 g Kartoffeln'] }),
    recipe('waxy-potatoes', { ingredients: ['400 g festkochende Kartoffeln'] }),
    recipe('rice-bowl'), recipe('broccoli-bake'), recipe('gnocchi'),
    recipe('chicken', { vegetarian: false }), recipe('beef', { vegetarian: false }),
  ];
  const sharedPotatoes = product('potato-sku', 'festkochende Kartoffeln', 1.99, 1000);
  const adapter = {
    async searchProducts(query) {
      if (/Kartoffeln/i.test(query)) return [sharedPotatoes];
      return adapterForProducts().searchProducts(query);
    },
  };
  const plan = await serviceWithCatalog(recipes, { adapter }).generatePlan({ variation: 0 });
  const potatoLines = plan.shoppingPreview.lines.filter(line => line.product && line.product.id === 'potato-sku');

  assert.equal(potatoLines.length, 1);
  assert.equal(potatoLines[0].demand.amount, 500);
  assert.equal(potatoLines[0].productPackages, 1);
  assert.equal(potatoLines[0].totalPrice, 1.99);
  assert.deepEqual(potatoLines[0].recipeIds.slice().sort(), ['plain-potatoes', 'waxy-potatoes']);
  assert.deepEqual(potatoLines[0].ingredientIds.slice().sort(), ['plain-potatoes:0', 'waxy-potatoes:0']);
});

test('planner does not consolidate the same product id across incompatible units or variants', async () => {
  const recipes = [
    recipe('mass-special', { ingredients: ['500 g Spezialprodukt'] }),
    recipe('volume-special', { ingredients: ['500 ml Spezialprodukt'] }),
    recipe('rice-bowl'), recipe('broccoli-bake'), recipe('gnocchi'),
    recipe('chicken', { vegetarian: false }), recipe('beef', { vegetarian: false }),
  ];
  const adapter = {
    async searchProducts(query) {
      if (/Spezialprodukt/i.test(query)) {
        return [
          product('special-sku', 'Spezialprodukt', 1.99, 500, 'g'),
          product('special-sku', 'Spezialprodukt', 1.49, 500, 'ml'),
        ];
      }
      return adapterForProducts().searchProducts(query);
    },
  };
  const plan = await serviceWithCatalog(recipes, { adapter }).generatePlan({ variation: 0 });
  const specialLines = plan.shoppingPreview.lines.filter(line => line.product && line.product.id === 'special-sku');

  assert.equal(specialLines.length, 2);
  assert.deepEqual(specialLines.map(line => line.demand.unit).sort(), ['mass', 'volume']);
});

test('plan covers every required selected ingredient exactly once and retains meal prep', async () => {
  const recipes = catalog();
  const plan = await serviceWithCatalog(recipes).generatePlan({ variation: 0 });
  const selected = new Set(plan.days.map((day) => day.recipeId));
  const expected = recipes
    .filter((item) => selected.has(item.id))
    .flatMap((item) => item.ingredients.flatMap((ingredient, index) => (
      /\boptional\b/i.test(ingredient) ? [] : [`${item.id}:${index}`]
    )))
    .sort();
  const covered = plan.shoppingPreview.lines.flatMap((line) => line.ingredientIds || []).sort();

  assert.deepEqual(covered, expected);
  assert.equal(new Set(covered).size, covered.length);
  assert.equal(plan.mealPrep.batches.length, 7);
  assert.ok(plan.mealPrep.steps.length >= 8);
});

test('product searches are deduplicated, cached for ten minutes, and concurrency is bounded', async () => {
  let active = 0;
  let maximum = 0;
  const calls = [];
  let current = new Date('2026-08-11T10:00:00.000Z');
  const adapter = {
    async searchProducts(query) {
      calls.push(query);
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return adapterForProducts().searchProducts(query);
    },
  };
  const service = serviceWithCatalog(catalog(), { adapter, concurrency: 2, now: () => current });

  await service.generatePlan({ variation: 0 });
  const firstCallCount = calls.length;
  await service.generatePlan({ variation: 1 });
  assert.equal(calls.length, firstCallCount);
  current = new Date(current.getTime() + 10 * 60 * 1000 + 1);
  await service.generatePlan({ variation: 2 });

  assert.equal(calls.length, firstCallCount * 2);
  assert.ok(firstCallCount > 1);
  assert.ok(maximum <= 2);
});

test('service-level search limiter clamps concurrency to four across overlapping requests', async () => {
  let active = 0;
  let maximum = 0;
  const adapter = {
    async searchProducts(query) {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise(resolve => setImmediate(resolve));
      active -= 1;
      return adapterForProducts().searchProducts(query);
    },
  };
  const service = serviceWithCatalog(catalog(), { adapter, concurrency: 8 });

  await Promise.all([
    service.generatePlan({ variation: 0 }),
    service.generatePlan({ variation: 1 }),
  ]);

  assert.equal(maximum, 4);
});

test('parallel cache misses serialize atomic cache persistence', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'knuspr-planner-cache-'));
  const store = createKnusprStore({ dataDir });
  const adapter = {
    async searchProducts() {
      await new Promise(resolve => setImmediate(resolve));
      return [];
    },
  };
  const service = serviceWithCatalog(catalog(), { adapter, store, concurrency: 4 });

  const plan = await service.generatePlan({ variation: 0 });

  assert.equal(plan.schemaVersion, 5);
  assert.ok(Object.keys((await store.read('knuspr-product-cache.json', null)).entries).length > 1);
});

test('additional items are validated, persisted, and included only while active', async () => {
  const store = memoryStore();
  const service = serviceWithCatalog(catalog(), { store });
  const items = await service.saveAdditionalItems([
    { id: 'water', label: 'Wasser', searchTerm: 'Mineralwasser', quantity: 2, category: 'getraenke', enabled: true },
    { id: 'foil', label: 'Folie', searchTerm: 'Alufolie', quantity: 1, category: 'haushalt', enabled: false },
  ]);
  const plan = await service.generatePlan({ variation: 0 });

  assert.equal(items[0].pinnedProductId, null);
  assert.deepEqual(await service.getAdditionalItems(), items);
  assert.ok(plan.shoppingPreview.lines.some((line) => line.additionalItemId === 'water'));
  assert.equal(plan.shoppingPreview.lines.some((line) => line.additionalItemId === 'foil'), false);
  await assert.rejects(() => service.saveAdditionalItems([{ id: 'x' }]), /Kategorie/);
});

test('preview lines can be removed or assigned an explicit alternative without changing the saved plan', async () => {
  const store = memoryStore();
  const service = serviceWithCatalog(catalog(), { store });
  const plan = await service.generatePlan({ variation: 0 });
  const line = plan.shoppingPreview.lines[0];
  const originalRevision = plan.shoppingPreview.revision;
  const replacement = product('replacement', line.demand.searchTerm, 3.25, 500);
  const updated = await service.updatePreviewLine({ lineId: line.id, product: replacement, productPackages: 2 });

  assert.equal(updated.lines.find((item) => item.id === line.id).product.id, 'replacement');
  assert.equal(updated.lines.find((item) => item.id === line.id).cartQuantity, 2);
  assert.notEqual(updated.revision, originalRevision);
  assert.equal((await service.getPlan()).shoppingPreview.revision, originalRevision);

  const removed = await service.updatePreviewLine({ lineId: line.id, removed: true });
  assert.equal(removed.lines.find((item) => item.id === line.id).removed, true);
});

test('preview line updates accept a listed product id and quantity alias', async () => {
  const adapter = {
    async searchProducts(query) {
      const primary = await adapterForProducts().searchProducts(query);
      return primary.concat(primary.map(item => ({
        ...item,
        id: `${item.id}-alternative`,
        price: { ...item.price, current: item.price.current + 1 },
      })));
    },
  };
  const service = serviceWithCatalog(catalog(), { adapter });
  const plan = await service.generatePlan({ variation: 0 });
  const line = plan.shoppingPreview.lines.find(item => item.alternatives.length > 0);
  const alternative = line.alternatives[0];

  const updated = await service.updatePreviewLine({ lineId: line.id, productId: alternative.id, quantity: 2 });
  const changed = updated.lines.find(item => item.id === line.id);

  assert.equal(changed.product.id, alternative.id);
  assert.equal(changed.cartQuantity, 2);
  assert.equal(changed.totalPrice, alternative.price.current * 2);
});

test('failed MCP refresh leaves the last schema-5 plan and preview untouched', async () => {
  const savedPlan = {
    schemaVersion: 5,
    generatedAt: '2026-08-10T10:00:00.000Z',
    planRevision: 'saved',
    servings: 2,
    days: [],
    shoppingPreview: { generatedAt: '2026-08-10T10:00:00.000Z', days: [], revision: 'saved', lines: [] },
    mealPrep: { batches: [], steps: [] },
    excludedIngredients: [],
  };
  const savedPreview = savedPlan.shoppingPreview;
  const store = memoryStore({ 'current-plan.json': savedPlan, 'knuspr-preview.json': savedPreview });
  const failingService = serviceWithCatalog(catalog(), { store, adapter: adapterForProducts({ fail: true }) });

  await assert.rejects(failingService.generatePlan({}), /Knuspr/);
  assert.deepEqual(await store.read('current-plan.json', null), savedPlan);
  assert.deepEqual(await store.read('knuspr-preview.json', null), savedPreview);
});

test('overlapping generation serializes rollback so a failed request cannot overwrite later success', async () => {
  const savedPlan = schemaFivePlan();
  const files = new Map([
    ['current-plan.json', structuredClone(savedPlan)],
    ['knuspr-preview.json', structuredClone(savedPlan.shoppingPreview)],
  ]);
  const releaseFirstFailure = deferred();
  const firstCurrentWriteStarted = deferred();
  let secondCurrentWritten = false;
  const store = {
    async read(name, fallback) {
      return files.has(name) ? structuredClone(files.get(name)) : fallback;
    },
    async write(name, value) {
      if (name === 'current-plan.json' && value.planRevision !== 'saved' && value.variation === 0) {
        firstCurrentWriteStarted.resolve();
        await releaseFirstFailure.promise;
        throw new Error('erster Plan-Schreibfehler');
      }
      files.set(name, structuredClone(value));
      if (name === 'current-plan.json' && value.variation === 1) secondCurrentWritten = true;
    },
    async remove(name) {
      files.delete(name);
    },
  };
  const service = serviceWithCatalog(catalog(), { store });

  const failed = service.generatePlan({ variation: 0 });
  await firstCurrentWriteStarted.promise;
  const successful = service.generatePlan({ variation: 1 });
  for (let turn = 0; turn < 20 && !secondCurrentWritten; turn += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  releaseFirstFailure.resolve();
  await assert.rejects(failed, /erster Plan-Schreibfehler/);
  const successfulPlan = await successful;

  assert.equal((await store.read('current-plan.json', null)).planRevision, successfulPlan.planRevision);
  assert.equal((await store.read('knuspr-preview.json', null)).revision, successfulPlan.shoppingPreview.revision);
});

test('first-generation write failure removes partially created plan and preview files', async () => {
  const base = memoryStore();
  let failed = false;
  const store = {
    ...base,
    async write(name, value) {
      await base.write(name, value);
      if (name === 'current-plan.json' && !failed) {
        failed = true;
        throw new Error('Plan konnte nicht gespeichert werden');
      }
    },
  };
  const service = serviceWithCatalog(catalog(), { store });

  await assert.rejects(service.generatePlan({ variation: 0 }), /nicht gespeichert/);

  assert.equal(await store.read('current-plan.json', null), null);
  assert.equal(await store.read('knuspr-preview.json', null), null);
});

test('service requires remove support for transactional rollback', () => {
  const store = memoryStore();
  assert.throws(() => createKnusprService({
    adapter: adapterForProducts(),
    store: { read: store.read, write: store.write },
    recipes: catalog(),
  }), /remove|Entfernen/i);
});

test('buildKnusprPlan rejects incomplete ingredient coverage before persistence', () => {
  assert.throws(() => buildKnusprPlan({
    recipes: catalog(),
    productChoices: [],
    additionalItems: [],
    exclusions: [],
    variation: 0,
    now: new Date('2026-08-11T10:00:00.000Z'),
  }), /Einkaufsvorschau unvollständig/);
});
