'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  collectNeededQueries,
  parsePublicProducts,
  chooseMatchingPrice
} = require('../server/regular-prices');

test('collectNeededQueries returns only categorized ingredients used by visible recipes', () => {
  const recipes = [
    {
      id: 'spinach-pasta',
      ingredients: [
        '500 g Nudeln',
        '400 g TK-Spinat',
        'Salz',
        'optional Parmesan'
      ]
    },
    { id: 'unused', ingredients: ['1 kg Kartoffeln'] }
  ];
  const plan = {
    weekend: [{ recipeId: 'spinach-pasta' }],
    nextWeek: [{ recipeId: 'spinach-pasta' }]
  };

  assert.deepEqual(collectNeededQueries(plan, recipes), ['Nudeln', 'Spinat']);
});

test('parsePublicProducts reads JSON-LD products with a visible EUR price', () => {
  const html = `<script type="application/ld+json">
    {
      "@type": "Product",
      "name": "ja! Spaghetti",
      "size": "500 g",
      "offers": {
        "@type": "Offer",
        "price": "0.79",
        "priceCurrency": "EUR"
      }
    }
  </script>`;

  assert.deepEqual(parsePublicProducts(html, 'REWE Eching', 'https://www.rewe.de/shop/suche?search=Nudeln'), [{
    market: 'REWE Eching',
    query: null,
    name: 'ja! Spaghetti',
    package: '500 g',
    price: 0.79,
    priceType: 'regular',
    sourceUrl: 'https://www.rewe.de/shop/suche?search=Nudeln'
  }]);
});

test('parsePublicProducts rejects comparison-only and non-EUR prices', () => {
  const html = `
    <article data-product-name="30-Tage-Preis" data-product-price="1,29" data-price-type="30-day-low"></article>
    <script type="application/ld+json">
      {"@type":"Product","name":"US-Produkt","offers":{"price":"2.99","priceCurrency":"USD"}}
    </script>`;

  assert.deepEqual(parsePublicProducts(html, 'EDEKA Morsestraße', 'https://www.edeka.de/suche.jsp'), []);
});

test('chooseMatchingPrice prefers a current matching own-brand product', () => {
  const records = [
    { name: 'Barilla Spaghetti 500 g', price: 1.99, priceType: 'regular' },
    { name: 'ja! Spaghetti 500 g', price: 0.79, priceType: 'regular' },
    { name: 'ja! Spaghetti 500 g', price: 0.69, priceType: 'stale-regular' }
  ];

  assert.equal(chooseMatchingPrice('Nudeln', records).price, 0.79);
});

