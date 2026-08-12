'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const net = require('node:net');
const { chromium } = require('playwright');
const { createServer } = require('../server');

// The server only allows mutating requests whose Origin header matches its
// configured appOrigin (see server.js mutationAllowed). Real browser fetches
// send an Origin header for POST/PATCH requests, so the fixture server must
// be told its exact http://127.0.0.1:<port> origin up front - which means
// picking the port before constructing it.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const LEGACY_FALLBACK_PLAN = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  planRevision: 1,
  notice: 'Kein Knuspr-Plan gespeichert',
  preferences: { excludedIngredients: [] },
  sources: [],
  weekend: [],
  nextWeek: [],
  mealPrep: { title: 'Meal-Prep-Vorlage', summary: 'Wird ersetzt.', steps: [] },
  recommendation: {
    market: '–',
    estimatedTotal: 0,
    confirmedOfferTotal: 0,
    confirmedRegularTotal: 0,
    estimatedNormalPriceTotal: 0,
    publishedNormalPriceTotal: 0,
    publishedSavings: 0,
    normalPriceCoverage: 0,
    summary: 'Noch kein Knuspr-Plan.',
    qualityNote: 'Testfixture.'
  },
  shopping: []
};

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const RECIPE_NAMES = ['Hähnchen-Bowl', 'Pasta Pesto', 'Gemüsecurry', 'Rindergulasch', 'Ofengemüse', 'Linsensuppe', 'Kartoffelpfanne'];

function days() {
  return DAY_NAMES.map((day, index) => ({
    date: `2026-08-${10 + index}`,
    day,
    recipeId: `recipe-${index + 1}`,
    name: RECIPE_NAMES[index],
    vegetarian: index % 2 === 0
  }));
}

function product(id, name, price, { amount = 500, unit = 'g', brand = null } = {}) {
  return {
    id,
    name,
    brand,
    available: true,
    imageUrl: null,
    package: { amount, unit, label: `${amount} ${unit}` },
    price: { current: price, regular: null, unit: null, unitLabel: null, offer: false },
    qualityTags: []
  };
}

const MEAT = product('meat-1', 'Hähnchenbrust', 6.49);
const VEGGIE = product('veg-1', 'Brokkoli', 1.99, { amount: 400 });
const VEGGIE_ALT = product('veg-2', 'Brokkoli Bio', 2.49, { amount: 400 });
const PASTA = product('pasta-1', 'Vollkornnudeln', 1.49);
const WATER = product('water-1', 'Mineralwasser', 0.59, { amount: 1, unit: 'l' });
const FOIL = product('foil-1', 'Alufolie', 2.49, { amount: 1, unit: 'Stück' });

function recipeLine(id, department, item, { status = 'selected', cartQuantity = 1, alternatives = [] } = {}) {
  return {
    id,
    source: 'recipe',
    department,
    demand: { searchTerm: item.name, amount: cartQuantity * item.package.amount, unit: item.package.unit, ingredient: item.name },
    recipeIds: ['recipe-1'],
    ingredientIds: [`${id}-ing`],
    status,
    product: status === 'selected' ? item : null,
    alternatives,
    productPackages: cartQuantity,
    cartQuantity,
    totalAmount: cartQuantity * item.package.amount,
    wasteAmount: 0,
    totalPrice: status === 'selected' ? Math.round(item.price.current * cartQuantity * 100) / 100 : null,
    reason: status === 'selected' ? 'Passendes Produkt gefunden' : 'Mehrere passende Produkte gefunden',
    removed: false
  };
}

function additionalLine(id, category, item, quantity) {
  return {
    id,
    source: 'additional',
    additionalItemId: id,
    additionalCategory: category,
    department: category === 'getraenke' ? 'Getränke' : 'Haushalt & Vorrat',
    demand: { searchTerm: item.name, amount: quantity, unit: 'piece', ingredient: item.name },
    recipeIds: [],
    ingredientIds: [],
    status: 'selected',
    product: item,
    alternatives: [],
    productPackages: quantity,
    cartQuantity: quantity,
    totalAmount: null,
    wasteAmount: null,
    totalPrice: Math.round(item.price.current * quantity * 100) / 100,
    reason: 'Verfügbares Produkt für die Zusatzliste',
    removed: false
  };
}

function readyPreview(revision) {
  const lines = [
    recipeLine('recipe-1-line', 'Fleisch & Tiefkühl', MEAT, { cartQuantity: 2 }),
    recipeLine('recipe-2-line', 'Obst & Gemüse', VEGGIE, { cartQuantity: 3 }),
    recipeLine('recipe-3-line', 'Nudeln, Reis & Beilagen', PASTA, { cartQuantity: 2 }),
    additionalLine('additional-water', 'getraenke', WATER, 6),
    additionalLine('additional-foil', 'haushalt', FOIL, 1)
  ];
  return {
    generatedAt: '2026-08-10T09:00:00.000Z',
    days: days(),
    revision,
    lines,
    estimatedTotal: Math.round(lines.reduce((sum, line) => sum + (line.totalPrice || 0), 0) * 100) / 100,
    openLineCount: 0
  };
}

function needsReviewPreview(revision) {
  const base = readyPreview(revision);
  const lines = base.lines.map((line, index) => (
    index === 1
      ? {
        ...line,
        status: 'ambiguous',
        product: null,
        totalPrice: null,
        alternatives: [VEGGIE, VEGGIE_ALT],
        reason: 'Mehrere passende Produkte gefunden'
      }
      : line
  ));
  return { ...base, lines, openLineCount: 1 };
}

function planFor(preview) {
  return {
    schemaVersion: 5,
    generatedAt: preview.generatedAt,
    planRevision: preview.revision,
    variation: 0,
    servings: 2,
    days: preview.days,
    shoppingPreview: preview,
    mealPrep: { title: 'Meal-Prep für euren Plan', summary: 'Testzusammenfassung', steps: [] },
    excludedIngredients: []
  };
}

function toValue(candidate, input) {
  if (candidate instanceof Error) throw candidate;
  return typeof candidate === 'function' ? candidate(input) : candidate;
}

function buildServer({ savedPlan = null, generatePlan, getPreview, updatePreviewLine, applyPreview } = {}, appOrigin) {
  const calls = { generatePlan: [], updatePreviewLine: [], applyPreview: [] };
  const client = { async status() { return { connected: true, authorizationPending: false }; } };
  const service = {
    async getPlan() { return savedPlan; },
    async getPreview() { return (toValue(getPreview, undefined)) || null; },
    async generatePlan(input) { calls.generatePlan.push(input); return toValue(generatePlan, input); },
    async regeneratePlan(input) { calls.generatePlan.push(input); return toValue(generatePlan, input); },
    async updatePreviewLine(input) { calls.updatePreviewLine.push(input); return toValue(updatePreviewLine, input); },
    async getAdditionalItems() { return []; },
    async saveAdditionalItems(items) { return items; }
  };
  const cart = {
    async applyPreview(input) { calls.applyPreview.push(input); return toValue(applyPreview, input); }
  };
  const server = createServer({ loadPlan: () => LEGACY_FALLBACK_PLAN, knuspr: { client, service, cart }, appOrigin });
  return { server, calls };
}

async function withPage(serverOptions, run, { viewport = { width: 1280, height: 900 } } = {}) {
  const port = await getFreePort();
  const appOrigin = `http://127.0.0.1:${port}`;
  const { server, calls } = buildServer(serverOptions, appOrigin);
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ headless: true, timeout: 10_000 });
    const baseUrl = appOrigin;
    const context = await browser.newContext({ serviceWorkers: 'block', viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error));
    await run({ page, context, baseUrl, calls, pageErrors });
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.close();
    await once(server, 'close');
  }
}

async function openReadyPreview(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 10_000 });
  await page.getByRole('button', { name: 'Wochenplan erstellen' }).click();
  await page.getByRole('button', { name: 'Warenkorb prüfen' }).click();
  await page.getByRole('button', { name: /Zu Knuspr übertragen/ }).waitFor();
}

test('320px flow renders without horizontal overflow and keeps cart action reachable', { timeout: 30_000 }, async () => {
  const revision = 'preview-320';
  await withPage(
    { generatePlan: () => planFor(readyPreview(revision)) },
    async ({ page, baseUrl, pageErrors }) => {
      await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 10_000 });
      await page.getByRole('button', { name: 'Wochenplan erstellen' }).click();
      await page.getByRole('heading', { name: '7 Abende. Ein Warenkorb.' }).waitFor({ state: 'visible' });
      await page.getByRole('button', { name: /Warenkorb prüfen/ }).click();
      await page.getByRole('button', { name: /Zu Knuspr übertragen/ }).waitFor({ state: 'visible' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.equal(overflow, false);
      assert.deepEqual(pageErrors, []);
    },
    { viewport: { width: 320, height: 700 } }
  );
});

test('changed price requires a second confirmation and does not call checkout', { timeout: 30_000 }, async () => {
  const revision = 'preview-reconfirm';
  const refreshed = { ...readyPreview(revision), revision: 'preview-reconfirm-2', estimatedTotal: 99.99 };
  await withPage(
    {
      generatePlan: () => planFor(readyPreview(revision)),
      applyPreview: () => ({ status: 'reconfirm-required', preview: refreshed })
    },
    async ({ page, baseUrl, calls }) => {
      const requests = [];
      page.on('request', request => requests.push(request));
      await openReadyPreview(page, baseUrl);
      await page.getByRole('button', { name: /Zu Knuspr übertragen/ }).click();
      await page.getByText(/Preis wurde aktualisiert/).waitFor({ state: 'visible' });
      assert.equal(requests.some(request => /checkout|order|payment/i.test(request.url())), false);
      assert.equal(calls.applyPreview.length, 1);
    }
  );
});

test('a reconfirm-required response that reintroduces an ambiguous line keeps the apply button disabled and still shows the price-updated banner', { timeout: 30_000 }, async () => {
  const revision = 'preview-reconfirm-needs-review';
  const refreshedWithAmbiguity = needsReviewPreview('preview-reconfirm-needs-review-2');
  await withPage(
    {
      generatePlan: () => planFor(readyPreview(revision)),
      applyPreview: () => ({ status: 'reconfirm-required', preview: refreshedWithAmbiguity })
    },
    async ({ page, baseUrl, calls }) => {
      await openReadyPreview(page, baseUrl);
      const applyButton = page.getByRole('button', { name: /Zu Knuspr übertragen/ });
      await applyButton.click();
      await page.getByText(/Preis wurde aktualisiert/).waitFor({ state: 'visible' });
      await page.getByText(/Bitte offene Positionen klären/).waitFor({ state: 'visible' });
      assert.equal(await applyButton.isDisabled(), true, 'apply must stay disabled when the refreshed preview still has an unresolved line');
      assert.equal(calls.applyPreview.length, 1);
    }
  );
});

test('apply button is disabled after a complete response so the cart cannot be resubmitted', { timeout: 30_000 }, async () => {
  const revision = 'preview-terminal-complete';
  await withPage(
    {
      generatePlan: () => planFor(readyPreview(revision)),
      applyPreview: input => ({
        status: 'complete',
        receipt: {
          previewRevision: input.previewRevision,
          attemptedAt: '2026-08-10T09:05:00.000Z',
          lines: input.acceptedLineIds.map(lineId => ({ lineId, productId: 'p', requested: 1, added: 1, status: 'added', errorCode: null }))
        }
      })
    },
    async ({ page, baseUrl, calls }) => {
      await openReadyPreview(page, baseUrl);
      const applyButton = page.getByRole('button', { name: /Zu Knuspr übertragen/ });
      await applyButton.click();
      await page.getByText('Warenkorb aktualisiert').waitFor({ state: 'visible' });
      assert.equal(await applyButton.isDisabled(), true, 'apply must not stay clickable once the transfer completed');

      // Defense in depth: even a forced click must not fire a second request.
      await applyButton.click({ force: true }).catch(() => {});
      assert.equal(calls.applyPreview.length, 1);
    }
  );
});

test('a retry after a partial apply only resends the still-failed lines, never the already-added ones', { timeout: 30_000 }, async () => {
  const revision = 'preview-partial-retry';
  let attempt = 0;
  await withPage(
    {
      generatePlan: () => planFor(readyPreview(revision)),
      applyPreview: input => {
        attempt += 1;
        if (attempt === 1) {
          return {
            status: 'partial',
            receipt: {
              previewRevision: input.previewRevision,
              attemptedAt: '2026-08-10T09:05:00.000Z',
              lines: input.acceptedLineIds.map((lineId, index) => (
                index === 0
                  ? { lineId, productId: 'p', requested: 1, added: 1, status: 'added', errorCode: null }
                  : { lineId, productId: 'p', requested: 1, added: 0, status: 'failed', errorCode: 'KNUSPR_CART_ADD_REJECTED' }
              ))
            }
          };
        }
        return {
          status: 'complete',
          receipt: {
            previewRevision: input.previewRevision,
            attemptedAt: '2026-08-10T09:06:00.000Z',
            lines: input.acceptedLineIds.map(lineId => ({ lineId, productId: 'p', requested: 1, added: 1, status: 'added', errorCode: null }))
          }
        };
      }
    },
    async ({ page, baseUrl, calls }) => {
      await openReadyPreview(page, baseUrl);
      const applyButton = page.getByRole('button', { name: /Zu Knuspr übertragen/ });
      await applyButton.click();
      await page.getByText('Teilweise übertragen').waitFor({ state: 'visible' });
      assert.equal(await applyButton.isDisabled(), false, 'a partial result must still allow an explicit retry');

      const firstAcceptedLineIds = calls.applyPreview[0].acceptedLineIds;
      const alreadyAddedLineId = firstAcceptedLineIds[0];

      await applyButton.click();
      await page.getByText('Warenkorb aktualisiert').waitFor({ state: 'visible' });

      assert.equal(calls.applyPreview.length, 2);
      assert.equal(
        calls.applyPreview[1].acceptedLineIds.includes(alreadyAddedLineId),
        false,
        'a retry must exclude lines the previous receipt already marked as added'
      );
    }
  );
});

test('a failed apply whose preview resync also fails leaves the apply button clickable again (not stuck applying)', { timeout: 30_000 }, async () => {
  const revision = 'preview-double-failure';
  await withPage(
    {
      generatePlan: () => planFor(readyPreview(revision)),
      applyPreview: () => { throw Object.assign(new Error('Vorschau ist veraltet'), { status: 409 }); },
      getPreview: () => { throw new Error('Vorschau konnte nicht geladen werden'); }
    },
    async ({ page, baseUrl }) => {
      await openReadyPreview(page, baseUrl);
      const applyButton = page.getByRole('button', { name: /Zu Knuspr übertragen/ });
      await applyButton.click();
      // Neither apply nor the resync succeeded; the button must recover to a
      // clickable state instead of staying disabled forever on "applying".
      await page.waitForFunction(() => {
        const button = document.querySelector('#applyKnusprCart');
        return button && !button.disabled;
      });
      assert.equal(await applyButton.isDisabled(), false);
    }
  );
});

test('ambiguous lines block the apply button until resolved via the alternatives dialog', { timeout: 30_000 }, async () => {
  const revision = 'preview-needs-review';
  const resolved = readyPreview('preview-needs-review-resolved');
  await withPage(
    {
      generatePlan: () => planFor(needsReviewPreview(revision)),
      updatePreviewLine: () => resolved
    },
    async ({ page, baseUrl, calls }) => {
      await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 10_000 });
      await page.getByRole('button', { name: 'Wochenplan erstellen' }).click();
      await page.getByRole('button', { name: 'Warenkorb prüfen' }).click();

      const applyButton = page.getByRole('button', { name: /Zu Knuspr übertragen/ });
      await applyButton.waitFor({ state: 'visible' });
      assert.equal(await applyButton.isDisabled(), true);

      // Product groups are native, keyboard-operable disclosure buttons.
      const toggle = page.locator('.product-group-toggle').first();
      await toggle.waitFor({ state: 'visible' });
      const expandedBefore = await toggle.getAttribute('aria-expanded');
      await toggle.click();
      const expandedAfter = await toggle.getAttribute('aria-expanded');
      assert.notEqual(expandedBefore, expandedAfter);
      await toggle.click(); // reopen for the rest of the test

      // The warning for the ambiguous line must precede its own product content.
      const order = await page.locator('.product-line.needs-attention').first().evaluate(li => (
        [...li.children].findIndex(child => child.classList.contains('line-warning'))
          < [...li.children].findIndex(child => child.classList.contains('line-body'))
      ));
      assert.equal(order, true);

      const alternativesTrigger = page.locator('[data-action="alternatives"][data-line-id="recipe-2-line"]');
      await alternativesTrigger.focus();
      await alternativesTrigger.press('Enter');

      const dialog = page.locator('#knusprAlternativesDialog');
      await dialog.waitFor({ state: 'visible' });
      await page.locator('.alternative-option').first().click();

      await dialog.waitFor({ state: 'hidden' });
      const trigger = await alternativesTrigger.evaluate(node => node === document.activeElement);
      assert.equal(trigger, true, 'focus must return to the invoking control after the modal closes');

      await applyButton.waitFor({ state: 'visible' });
      assert.equal(await applyButton.isDisabled(), false);
      assert.equal(calls.updatePreviewLine.length, 1);
      assert.equal(calls.updatePreviewLine[0].changes.productId, VEGGIE.id);
    },
    { viewport: { width: 768, height: 900 } }
  );
});

test('apply sends the visible revision and accepted line ids exactly once while disabled', { timeout: 30_000 }, async () => {
  const revision = 'preview-complete';
  await withPage(
    {
      generatePlan: () => planFor(readyPreview(revision)),
      applyPreview: input => ({
        status: 'complete',
        receipt: {
          previewRevision: input.previewRevision,
          attemptedAt: '2026-08-10T09:05:00.000Z',
          lines: input.acceptedLineIds.map(lineId => ({ lineId, productId: 'p', requested: 1, added: 1, status: 'added', errorCode: null }))
        }
      })
    },
    async ({ page, baseUrl, calls }) => {
      await openReadyPreview(page, baseUrl);
      const applyButton = page.getByRole('button', { name: /Zu Knuspr übertragen/ });
      await applyButton.click();
      await page.getByText('Warenkorb aktualisiert').waitFor({ state: 'visible' });

      assert.equal(calls.applyPreview.length, 1);
      assert.equal(calls.applyPreview[0].previewRevision, revision);
      assert.deepEqual(
        [...calls.applyPreview[0].acceptedLineIds].sort(),
        ['additional-foil', 'additional-water', 'recipe-1-line', 'recipe-2-line', 'recipe-3-line']
      );
    }
  );
});

test('offline: last saved plan and recipes stay readable when a live action fails', { timeout: 30_000 }, async () => {
  const saved = planFor(readyPreview('preview-saved'));
  await withPage(
    { savedPlan: saved },
    async ({ page, baseUrl }) => {
      await page.route('**/api/plan/generate', route => route.abort());
      await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 10_000 });

      const flow = page.locator('#knusprFlow');
      // The last saved plan renders without any live Knuspr call.
      await flow.getByText(RECIPE_NAMES[0], { exact: true }).waitFor({ state: 'visible' });

      await page.getByRole('button', { name: 'Wochenplan erstellen' }).click();
      await page.getByText(/Keine Verbindung zu Knuspr/).waitFor({ state: 'visible' });
      // The plan summary is still visible underneath the offline notice.
      await flow.getByText(RECIPE_NAMES[0], { exact: true }).waitFor({ state: 'visible' });

      await page.locator('[data-view="recipes"]').click();
      await page.locator('#recipeGrid .recipe-card').first().waitFor({ state: 'visible' });
    }
  );
});

test('renders without page errors and keeps every primary action keyboard reachable at 320, 375, 768, and 1280', { timeout: 60_000 }, async () => {
  const revision = 'preview-viewports';
  for (const viewport of [{ width: 320, height: 700 }, { width: 375, height: 700 }, { width: 768, height: 900 }, { width: 1280, height: 900 }]) {
    await withPage(
      { generatePlan: () => planFor(readyPreview(revision)) },
      async ({ page, baseUrl, pageErrors }) => {
        await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 10_000 });
        const overflowAtLoad = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        assert.equal(overflowAtLoad, false, `horizontal overflow at ${viewport.width}px on load`);

        const generateButton = page.locator('#generateKnusprPlan');
        await generateButton.focus();
        assert.equal(await generateButton.evaluate(node => node === document.activeElement), true);
        await generateButton.press('Enter');

        const reviewButton = page.getByRole('button', { name: 'Warenkorb prüfen' });
        await reviewButton.waitFor({ state: 'visible' });
        await reviewButton.focus();
        assert.equal(await reviewButton.evaluate(node => node === document.activeElement), true);
        await reviewButton.press('Enter');

        const applyButton = page.getByRole('button', { name: /Zu Knuspr übertragen/ });
        await applyButton.waitFor({ state: 'visible' });
        await applyButton.focus();
        assert.equal(await applyButton.evaluate(node => node === document.activeElement), true);

        const overflowAfter = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        assert.equal(overflowAfter, false, `horizontal overflow at ${viewport.width}px after flow`);
        assert.deepEqual(pageErrors, []);
      },
      { viewport }
    );
  }
});
