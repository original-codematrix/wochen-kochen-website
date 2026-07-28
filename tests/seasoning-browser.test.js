'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { recipes } = require('../data');
const { createServer } = require('../server');

test('recipe dialog shows the catalog seasoning recommendation in a real browser', { timeout: 30_000 }, async () => {
  const recipe = recipes.find(candidate => candidate.id === 'garlic-pasta');
  assert.ok(recipe, 'garlic-pasta must exist in the recipe catalog');

  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;

  try {
    browser = await chromium.launch({ headless: true, timeout: 10_000 });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    await page.goto(`http://127.0.0.1:${server.address().port}`, {
      waitUntil: 'networkidle',
      timeout: 10_000
    });

    await page.locator('[data-view="recipes"]').click();
    await page.locator('#recipeGrid [data-open="garlic-pasta"]').click();
    await page.locator('#recipeDialog').waitFor({ state: 'visible' });
    const dialogText = await page.locator('#recipeDialog').innerText();

    assert.equal(dialogText.includes('Gewürzempfehlung'), true);
    assert.equal(dialogText.includes(recipe.seasoningTip), true);

    await context.close();
  } finally {
    if (browser) await browser.close();
    server.close();
    await once(server, 'close');
  }
});
