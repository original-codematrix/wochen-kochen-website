const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseRequiredAmount,
  calculatePackChoice,
  chooseProduct,
} = require('../server/knuspr/product-selection');

function product(id, name, price, amount, unit = 'g', extra = {}) {
  return {
    id,
    name,
    available: true,
    package: { amount, unit, label: `${amount} ${unit}` },
    price: { current: price, regular: null, unit: null, unitLabel: null, offer: false },
    qualityTags: [],
    ...extra,
  };
}

function demandOf(ingredient, servingScale = 1) {
  return parseRequiredAmount(ingredient, servingScale);
}

test('exact match beats a cheaper prepared product', () => {
  const demand = demandOf('600 g Hähnchenbrust');
  const result = chooseProduct(demand, [product('ramen', 'Chicken Ramen', 0.99, 140), product('breast', 'Hähnchenbrustfilet', 5.49, 600)], {});
  assert.equal(result.selected.id, 'breast');
});

test('ranking charges whole packs and accepts modest reusable waste for a clearly lower total', () => {
  const demand = demandOf('750 g Kartoffeln');
  const result = chooseProduct(demand, [product('onekg', 'Kartoffeln', 1.99, 1000), product('two', 'Kartoffeln', 1.79, 500)], {});
  assert.deepEqual({ id: result.selected.id, packages: result.packages, totalPrice: result.totalPrice, waste: result.wasteAmount }, { id: 'onekg', packages: 1, totalPrice: 1.99, waste: 250 });
});

test('available pinned product wins after hard suitability checks', () => {
  const result = chooseProduct(demandOf('1 l Milch'), [product('a', 'Vollmilch', 1.09, 1000, 'ml'), product('b', 'Bio Vollmilch', 1.29, 1000, 'ml')], { pinnedProductId: 'b' });
  assert.equal(result.selected.id, 'b');
});

test('parses scaled metric and piece requirements into comparable amounts', () => {
  assert.deepEqual(demandOf('1,5 kg Kartoffeln', 0.5), { ingredient: '1,5 kg Kartoffeln', amount: 750, unit: 'mass', optional: false });
  assert.deepEqual(demandOf('2 Gurken', 1.5), { ingredient: '2 Gurken', amount: 3, unit: 'piece', optional: false });
});

test('calculates whole package quantities and surplus without prorating', () => {
  const choice = calculatePackChoice(demandOf('600 g Pasta'), product('pasta', 'Penne', 1.29, 500));
  assert.deepEqual({ packages: choice.packages, totalAmount: choice.totalAmount, wasteAmount: choice.wasteAmount, totalPrice: choice.totalPrice }, { packages: 2, totalAmount: 1000, wasteAmount: 400, totalPrice: 2.58 });
});

test('unknown package size remains an ambiguous position', () => {
  const result = chooseProduct(demandOf('500 g Pasta'), [product('unknown', 'Penne', 1.29, null)], {});
  assert.deepEqual({ status: result.status, selected: result.selected, packages: result.packages }, { status: 'ambiguous', selected: null, packages: null });
});

test('hard safeguards reject wrong meat cuts, pickles, prepared pasta, and unrelated cheese', () => {
  const cases = [
    ['600 g Hähnchenbrust', product('wings', 'Hähnchenflügel', 2.99, 600)],
    ['1 Gurke', product('pickle', 'Gewürzgurken', 1.29, 1, 'piece')],
    ['500 g Pasta', product('ready', 'Spaghetteria Spinaci Käse', 1.49, 500)],
    ['80 g Parmesan', product('white', 'Weißkäse', 1.99, 200)],
  ];
  for (const [ingredient, candidate] of cases) {
    const result = chooseProduct(demandOf(ingredient), [candidate], {});
    assert.equal(result.status, 'missing', ingredient);
  }
});

test('explicit beef and pork demands reject the other species before selecting the cut', () => {
  const beef = chooseProduct(demandOf('600 g Rindergeschnetzeltes'), [
    product('pork-strips', 'Schweinegeschnetzeltes', 3.99, 600),
    product('beef-strips', 'Rindergeschnetzeltes', 5.99, 600),
  ], {});
  const pork = chooseProduct(demandOf('600 g Schweinegeschnetzeltes'), [
    product('beef-strips', 'Rindergeschnetzeltes', 3.99, 600),
    product('pork-strips', 'Schweinegeschnetzeltes', 5.99, 600),
  ], {});
  assert.equal(beef.selected.id, 'beef-strips');
  assert.equal(pork.selected.id, 'pork-strips');
});

test('explicit mince species stay separate while generic mince accepts beef pork or mixed mince', () => {
  const beef = chooseProduct(demandOf('500 g Rinderhack'), [product('pork', 'Schweinehack', 2.99, 500), product('beef', 'Rinderhack', 3.99, 500)], {});
  const pork = chooseProduct(demandOf('500 g Schweinehack'), [product('beef', 'Rinderhack', 2.99, 500), product('pork', 'Schweinehack', 3.99, 500)], {});
  const generic = chooseProduct(demandOf('500 g Hackfleisch'), [product('chicken', 'Hähnchenhack', 1.99, 500), product('mixed', 'Gemischtes Hackfleisch', 3.49, 500)], {});
  assert.equal(beef.selected.id, 'beef');
  assert.equal(pork.selected.id, 'pork');
  assert.equal(generic.selected.id, 'mixed');
});

test('TK-Pommes require fries and reject raw potatoes plus unrelated potato preparations', () => {
  const result = chooseProduct(demandOf('750 g TK-Pommes'), [
    product('raw', 'Speisekartoffeln', 1.29, 1000),
    product('salad', 'Kartoffelsalat', 1.49, 1000),
    product('croquettes', 'Kartoffelkroketten', 1.99, 750),
    product('fries', 'TK Pommes Frites', 2.49, 750),
  ], {});
  assert.equal(result.selected.id, 'fries');
  assert.equal(chooseProduct(demandOf('750 g Kartoffeln'), [product('fries', 'TK Pommes Frites', 1.99, 750)], {}).status, 'missing');
});

test('missing product prices never become free selections while explicitly numeric zero remains valid', () => {
  for (const price of [null, undefined, '', '   ', NaN, -0.01]) {
    const result = chooseProduct(demandOf('1 l Milch'), [product('bad', 'Vollmilch', price, 1000, 'ml')], {});
    assert.notEqual(result.status, 'selected', String(price));
    assert.equal(result.selected, null, String(price));
  }
  const free = chooseProduct(demandOf('1 l Milch'), [product('free', 'Vollmilch Probe', 0, 1000, 'ml')], {});
  assert.equal(free.selected.id, 'free');
  assert.equal(free.totalPrice, 0);
});

test('optional ingredients are not selected automatically', () => {
  const result = chooseProduct(demandOf('Optional: 1 Chili'), [product('chili', 'Rote Chili', 0.39, 1, 'piece')], {});
  assert.equal(result.status, 'missing');
  assert.equal(result.reason, 'Optionale Zutat');
});

test('a quantity-less required ingredient auto-selects a single pack of the cheapest suitable product', () => {
  const demand = demandOf('etwas Öl');
  assert.equal(demand.amount, null);
  const result = chooseProduct(demand, [
    product('sun', 'Sonnenblumenöl', 3.69, 1000, 'ml'),
    product('rape', 'Bio Rapsöl', 2.49, 500, 'ml'),
  ], {});
  assert.equal(result.status, 'selected');
  assert.equal(result.selected.id, 'rape');
  assert.equal(result.packages, 1);
  assert.equal(result.totalPrice, 2.49);
  assert.match(result.reason, /eine Packung/i);
});

test('a quantity-less ingredient with no suitable product stays missing, not a phantom selection', () => {
  const result = chooseProduct(demandOf('etwas Blattspinat'), [product('gone', 'Blattspinat TK', 1.99, 450, 'g', { available: false })], {});
  assert.equal(result.status, 'missing');
  assert.equal(result.selected, null);
});
