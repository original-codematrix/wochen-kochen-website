const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  parseKaufland,
  parseEdeka,
  parseRewe,
  filterAllowedOffers,
  selectRecipes,
  fetchWithBrowserFallback,
  applyBrowserCache,
  importOfferHtml,
  hydrateReweHtml,
  looksLikeChallenge
} = require('../server/refresh');

test('parseKaufland reads product, package, current and previous price', () => {
  const html = `<a class="k-product-tile">
    <div class="k-product-tile__title">BARILLA</div>
    <div class="k-product-tile__subtitle">Classic Pasta</div>
    <div class="k-product-tile__unit-price">je 500-g-Packg.</div>
    <div class="k-price-tag__price">0.69</div>
    <div class="k-price-tag__old-price"><span>1.99</span></div>
  </a>`;
  assert.deepEqual(parseKaufland(html), [{
    name: 'BARILLA Classic Pasta',
    package: 'je 500-g-Packg.',
    price: 0.69,
    previousPrice: 1.99,
    referencePriceType: 'regular-price',
    market: 'Kaufland Lohhof',
    status: 'offer'
  }]);
});

test('parseEdeka reads visible offer cards', () => {
  const html = `<article>
    <h4><a data-dialog-action="open"><span class="sr-only">Angebot:</span> Hackfleisch</a></h4>
    <div class="sr-only">Festpreis von 0.99 €</div>
    <p class="line-clamp-2">frisch, 100g</p>
  </article>`;
  const offers = parseEdeka(html);
  assert.equal(offers[0].name, 'Hackfleisch');
  assert.equal(offers[0].price, 0.99);
  assert.equal(offers[0].package, 'frisch, 100g');
  assert.equal(offers[0].status, 'offer');
});

test('parseEdeka distinguishes app price from the regular offer price', () => {
  const html = `<article>
    <h2><a data-dialog-action="open"><span class="sr-only">Angebot:</span> Pizza</a></h2>
    <div class="sr-only">App-Preis von 1.59 €</div>
    <div class="sr-only">Rabattierter Preis von 1.79 €</div>
    <p class="line-clamp-2">350g</p>
  </article>`;
  assert.deepEqual(parseEdeka(html)[0], {
    name: 'Pizza',
    package: '350g',
    price: 1.59,
    previousPrice: 1.79,
    referencePriceType: 'non-app-offer',
    market: 'EDEKA Morsestraße',
    status: 'app-offer'
  });
});

test('parseRewe reads a page saved from regular Chrome', () => {
  const html = `<article class="cor-offer-renderer-tile cor-link">
    <div class="cor-offer-information">
      <h3><a data-offer-title="ja! Hähnchenbrustfilet">ja! Hähnchenbrustfilet</a></h3>
      <span class="cor-offer-information__additional">Frischetheke, je 100 g</span>
      <span class="cor-offer-information__additional">(1 kg = 11,00 €)</span>
    </div>
    <div class="cor-offer-price__tag-price">0,99 €</div>
  </article>`;
  assert.deepEqual(parseRewe(html), [{
    name: 'ja! Hähnchenbrustfilet',
    package: 'Frischetheke, je 100 g (1 kg = 11,00 €)',
    price: 0.99,
    previousPrice: null,
    referencePriceType: null,
    market: 'REWE Eching',
    status: 'offer'
  }]);
});

test('parseRewe reads a published crossed-out regular price', () => {
  const html = `<article class="cor-offer-renderer-tile">
    <h3 data-offer-title="Barilla Pasta">Barilla Pasta</h3>
    <span class="cor-offer-information__additional">500 g</span>
    <div class="cor-offer-price__tag-price">0,79 €</div>
    <div class="cor-offer-price__tag-old-price">statt 1,99 €</div>
  </article>`;
  const offer = parseRewe(html)[0];
  assert.equal(offer.previousPrice, 1.99);
  assert.equal(offer.referencePriceType, 'regular-price');
});

test('importOfferHtml persists only allowed offers from saved Chrome HTML', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kochbuch-import-'));
  try {
    const html = '<h3>ja! Nudeln</h3><p>500 g</p><strong>0,79 €</strong><h3>Lachsfilet</h3><strong>4,99 €</strong>';
    assert.deepEqual(await importOfferHtml({ market: 'REWE Eching', html, dataDir }), {
      market: 'REWE Eching',
      count: 1,
      hydrated: false
    });
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'browser-offers.json'), 'utf8'));
    assert.deepEqual(saved.sources[0].offers.map(offer => offer.name), ['ja! Nudeln']);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('hydrateReweHtml loads every placeholder through the accessible REWE tile endpoint', async () => {
  const savedPage = `
    <div class="sos-offer" data-offer-nan="111" data-offer-wwident="440303"></div>
    <div class="sos-offer" data-offer-nan="222" data-offer-wwident="440303"></div>`;
  let requested;
  const hydrated = await hydrateReweHtml(savedPage, {
    fetch: async (url, options) => {
      assert.equal(url, 'https://www.rewe.de/api/frontend-includes');
      requested = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => requested.map(item => ({
          id: item.id,
          content: `<article class="cor-offer-renderer-tile"><a data-offer-title="Produkt ${item.params.nan}"></a><div class="cor-offer-price__tag-price">1,29 €</div></article>`
        }))
      };
    }
  });
  assert.deepEqual(requested.map(item => item.params.nan), ['111', '222']);
  assert.match(hydrated, /Produkt 111/);
  assert.match(hydrated, /Produkt 222/);
});

test('filterAllowedOffers removes every fish and seafood product', () => {
  const offers = ['Hähnchenbrust', 'Lachsfilet', 'Garnelen', 'Hummer', 'Muscheln', 'Heringsfilets', 'Makrele']
    .map(name => ({ name }));
  assert.deepEqual(filterAllowedOffers(offers).map(item => item.name), ['Hähnchenbrust']);
});

test('selectRecipes never selects fish and uses matching offer ingredients', () => {
  const recipes = [
    { id: 'fish', name: 'Lachs', ingredients: ['500 g Lachs'], rating: 5 },
    { id: 'pasta', name: 'Hähnchen-Pasta', ingredients: ['500 g Pasta', '600 g Hähnchen'], rating: 4 },
    { id: 'potato', name: 'Ofenhähnchen', ingredients: ['1 kg Kartoffeln', '600 g Hähnchen'], rating: 4 }
  ];
  const selected = selectRecipes(recipes, [{ name: 'Barilla Pasta' }, { name: 'Kartoffeln' }], 2);
  assert.deepEqual(selected.map(recipe => recipe.id), ['pasta', 'potato']);
});

test('fetchWithBrowserFallback uses Chromium when direct access is challenged', async () => {
  let browserCalls = 0;
  const html = await fetchWithBrowserFallback('https://example.test/offers', {
    directFetch: async () => ({ ok: false, status: 403, text: async () => 'challenge' }),
    browserFetch: async () => {
      browserCalls++;
      return '<h3>Angebote</h3>';
    }
  });
  assert.equal(html, '<h3>Angebote</h3>');
  assert.equal(browserCalls, 1);
});

test('fetchWithBrowserFallback avoids Chromium when direct access works', async () => {
  let browserCalls = 0;
  const html = await fetchWithBrowserFallback('https://example.test/offers', {
    directFetch: async () => ({ ok: true, status: 200, text: async () => '<main>ok</main>' }),
    browserFetch: async () => {
      browserCalls++;
      return 'unused';
    }
  });
  assert.equal(html, '<main>ok</main>');
  assert.equal(browserCalls, 0);
});

test('applyBrowserCache restores offers captured during manual browser verification', () => {
  const results = [{ market: 'REWE Eching', offers: [], status: 'error', error: 'challenge' }];
  const cached = {
    capturedAt: new Date().toISOString(),
    sources: [{ market: 'REWE Eching', offers: [{ name: 'ja! Nudeln', price: 0.79 }] }]
  };
  const restored = applyBrowserCache(results, cached);
  assert.equal(restored[0].status, 'browser-cached');
  assert.equal(restored[0].offers[0].name, 'ja! Nudeln');
  assert.equal(restored[0].error, null);
});

test('applyBrowserCache prefers a fuller Chrome import over a partial direct result', () => {
  const results = [{ market: 'EDEKA Morsestraße', offers: [{ name: 'Direkt 1' }], status: 'current', error: null }];
  const cached = {
    capturedAt: new Date().toISOString(),
    sources: [{
      market: 'EDEKA Morsestraße',
      offers: [{ name: 'Import 1' }, { name: 'Import 2' }, { name: 'Import 3' }]
    }]
  };
  const restored = applyBrowserCache(results, cached);
  assert.equal(restored[0].status, 'browser-cached');
  assert.deepEqual(restored[0].offers.map(offer => offer.name), ['Import 1', 'Import 2', 'Import 3']);
});

test('looksLikeChallenge ignores Cloudflare script remnants after the offers are visible', () => {
  assert.equal(looksLikeChallenge({
    title: 'Angebote im REWE Markt',
    bodyText: 'Top-Angebote Milka Schokolade 0,99 €'
  }), false);
  assert.equal(looksLikeChallenge({
    title: 'Just a moment...',
    bodyText: 'Verifying you are human'
  }), true);
});
