'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  collectNeededQueries,
  parsePublicProducts,
  chooseMatchingPrice,
  fetchTargetedRegularPrices
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

test('fetchTargetedRegularPrices reuses fresh cached query results', async () => {
  const now = new Date('2026-07-24T15:00:00+02:00');
  let fetchCalls = 0;
  const result = await fetchTargetedRegularPrices({
    queries: ['Nudeln'],
    markets: [{ market: 'REWE Eching', searchUrl: query => `https://example.test/${query}` }],
    cache: {
      records: [{
        market: 'REWE Eching',
        query: 'Nudeln',
        name: 'ja! Spaghetti',
        package: '500 g',
        price: 0.79,
        priceType: 'regular',
        sourceUrl: 'https://example.test/Nudeln',
        capturedAt: '2026-07-22T15:00:00+02:00'
      }]
    },
    now,
    fetchHtml: async () => {
      fetchCalls++;
      throw new Error('fresh cache should avoid fetch');
    }
  });

  assert.equal(fetchCalls, 0);
  assert.equal(result.records[0].priceType, 'regular');
  assert.equal(result.coverage[0].status, 'cached-current');
});

test('fetchTargetedRegularPrices labels old cache entries and survives a blocked source', async () => {
  const result = await fetchTargetedRegularPrices({
    queries: ['Spinat'],
    markets: [{ market: 'EDEKA Morsestraße', searchUrl: query => `https://example.test/${query}` }],
    cache: {
      records: [{
        market: 'EDEKA Morsestraße',
        query: 'Spinat',
        name: 'EDEKA Bio Spinat',
        package: '450 g',
        price: 1.49,
        priceType: 'regular',
        sourceUrl: 'https://example.test/Spinat',
        capturedAt: '2026-07-04T15:00:00+02:00'
      }]
    },
    now: new Date('2026-07-24T15:00:00+02:00'),
    fetchHtml: async () => {
      throw new Error('HTTP 403');
    }
  });

  assert.equal(result.records[0].priceType, 'stale-regular');
  assert.equal(result.coverage[0].status, 'cached-stale');
});

test('fetchTargetedRegularPrices stores a newly published matching price atomically', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kochbuch-prices-'));
  try {
    const result = await fetchTargetedRegularPrices({
      queries: ['Nudeln'],
      markets: [{ market: 'Kaufland Lohhof', searchUrl: query => `https://example.test/${query}` }],
      dataDir,
      now: new Date('2026-07-24T15:00:00+02:00'),
      fetchHtml: async () => `<script type="application/ld+json">
        {"@type":"Product","name":"K-Classic Spaghetti","size":"500 g","offers":{"price":"0.89","priceCurrency":"EUR"}}
      </script>`
    });
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'regular-price-cache.json'), 'utf8'));

    assert.equal(result.records[0].query, 'Nudeln');
    assert.equal(saved.records[0].price, 0.89);
    assert.equal(fs.existsSync(path.join(dataDir, 'regular-price-cache.json.tmp')), false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
