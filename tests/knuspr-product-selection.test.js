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

test('optional ingredients are not selected automatically', () => {
  const result = chooseProduct(demandOf('Optional: 1 Chili'), [product('chili', 'Rote Chili', 0.39, 1, 'piece')], {});
  assert.equal(result.status, 'missing');
  assert.equal(result.reason, 'Optionale Zutat');
});
