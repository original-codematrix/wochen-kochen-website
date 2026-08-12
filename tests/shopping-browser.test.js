'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { createServer } = require('../server');

const PLAN = {
  generatedAt: '2026-07-26T10:00:00.000Z',
  planRevision: 7,
  notice: 'Deterministischer Browser-Testplan',
  preferences: { excludedIngredients: [] },
  sources: [],
  weekend: [],
  nextWeek: [],
  mealPrep: { title: 'Test-Prep', summary: 'Reproduzierbar', steps: [] },
  recommendation: {
    market: 'Testmarkt Eching',
    estimatedTotal: 12.34,
    confirmedOfferTotal: 4.99,
    confirmedRegularTotal: 0,
    estimatedNormalPriceTotal: 7.35,
    publishedNormalPriceTotal: 6.49,
    publishedSavings: 1.5,
    normalPriceCoverage: 50,
    summary: 'Testmarkt bündelt den Testeinkauf.',
    qualityNote: 'Nur für den Browser-Integrationstest.'
  },
  shopping: [
    {
      department: 'Fleisch',
      items: [{
        name: 'Testschnitzel',
        quantity: '2 Packungen',
        note: 'Angebot für zwei Abende',
        price: 4.99,
        regularPrice: 6.49,
        savings: 1.5,
        status: 'offer'
      }]
    },
    {
      department: 'Beilagen',
      items: [{
        name: 'Testkartoffeln',
        quantity: '1 Sack',
        note: 'am Regal prüfen',
        price: 7.35,
        status: 'estimated'
      }]
    }
  ]
};

function normalize(value) {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

async function shoppingSnapshot(page, selector) {
  return page.locator(selector).evaluate(root => [...root.querySelectorAll(':scope > .shopping-group')].map(group => ({
    department: group.querySelector('h3').textContent.trim(),
    items: [...group.querySelectorAll('.shopping-item')].map(label => {
      const content = label.children[1];
      const price = label.children[2];
      return {
        name: content.firstChild.textContent.trim(),
        quantityAndNote: content.querySelector('small').textContent.trim(),
        price: price.firstChild.textContent.trim(),
        priceDetails: [...price.querySelectorAll('small')].map(detail => detail.textContent.trim())
      };
    })
  })));
}

test('current-plan shopping views stay identical and interactive in a real browser', { timeout: 30_000 }, async () => {
  const server = createServer({ loadPlan: () => PLAN });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;

  try {
    browser = await chromium.launch({ headless: true, timeout: 10_000 });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(() => {
      window.__copiedShoppingText = null;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async text => {
            window.__copiedShoppingText = text;
          }
        }
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 10_000 });
    await page.locator('#shoppingDone').waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.querySelector('#shoppingDone')?.textContent === '0 / 2');

    const planView = await shoppingSnapshot(page, '#planShoppingGroups');
    const shoppingView = await shoppingSnapshot(page, '#shoppingGroups');
    assert.deepEqual(shoppingView, planView);
    assert.deepEqual(planView, [
      {
        department: 'Fleisch',
        items: [{
          name: 'Testschnitzel',
          quantityAndNote: '2 Packungen · Angebot für zwei Abende',
          price: '4,99 €',
          priceDetails: ['Angebot', 'statt 6,49 € · spart 1,50 €']
        }]
      },
      {
        department: 'Beilagen',
        items: [{
          name: 'Testkartoffeln',
          quantityAndNote: '1 Sack · am Regal prüfen',
          price: '7,35 €',
          priceDetails: ['geschätzt']
        }]
      }
    ]);
    assert.equal(normalize(await page.locator('#shoppingWeekLabel').textContent()), 'Testmarkt Eching');
    assert.equal(normalize(await page.locator('#shoppingTotal').textContent()), '12,34 €');
    assert.equal(await page.locator('#shoppingDone').textContent(), '0 / 2');

    await page.locator('#planShoppingGroups [data-current-shop]').nth(0).check();
    assert.equal(await page.locator('#shoppingGroups [data-current-shop]').nth(0).isChecked(), true);
    assert.equal(await page.locator('#shoppingDone').textContent(), '1 / 2');

    await page.locator('[data-view="shopping"]').click();
    await page.locator('#shoppingGroups [data-current-shop]').nth(1).check();
    assert.equal(await page.locator('#planShoppingGroups [data-current-shop]').nth(1).isChecked(), true);
    assert.equal(await page.locator('#shoppingDone').textContent(), '2 / 2');

    await page.locator('#resetShopping').click();
    assert.deepEqual(await page.locator('[data-current-shop]').evaluateAll(inputs => inputs.map(input => input.checked)), [false, false, false, false]);
    assert.equal(await page.locator('#shoppingDone').textContent(), '0 / 2');

    await page.locator('#copyShopping').click();
    const clipboardText = normalize(await page.evaluate(() => window.__copiedShoppingText));
    assert.equal(
      clipboardText,
      '☐ 2 Packungen Testschnitzel – Angebot für zwei Abende – 4,99 € (Angebot) ☐ 1 Sack Testkartoffeln – am Regal prüfen – 7,35 € (geschätzt)'
    );
    await context.close();

    const failedContext = await browser.newContext({ serviceWorkers: 'block' });
    const failedPage = await failedContext.newPage();
    failedPage.setDefaultTimeout(5_000);
    await failedPage.route(/\/(?:api\/current-plan|server\/current-plan\.json)$/, route => (
      route.fulfill({ status: 503, contentType: 'application/json', body: '' })
    ));
    await failedPage.goto(baseUrl, { timeout: 10_000 });
    await failedPage.getByText('Wochenplan konnte nicht geladen werden.').waitFor();
    assert.equal(await failedPage.locator('#planShoppingGroups').textContent(), 'Aktueller Wochenplan ist nicht verfügbar.');
    assert.equal(await failedPage.locator('#shoppingGroups').textContent(), 'Aktueller Wochenplan ist nicht verfügbar.');
    assert.equal(await failedPage.locator('#shoppingWeekLabel').textContent(), '–');
    assert.equal(await failedPage.locator('#shoppingTotal').textContent(), '–');
    assert.equal(await failedPage.locator('#shoppingDone').textContent(), '0 / 0');
    assert.equal(await failedPage.locator('#priceStatus').textContent(), 'Aktueller Wochenplan ist nicht verfügbar.');
    await failedContext.close();
  } finally {
    if (browser) await browser.close();
    server.close();
    await once(server, 'close');
  }
});
