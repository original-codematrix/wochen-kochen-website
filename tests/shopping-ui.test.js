'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('both current shopping views use the active plan', () => {
  assert.match(app, /function renderPlanShoppingViews\(\)/);
  assert.match(app, /renderPlanShoppingInto\('#planShoppingGroups'/);
  assert.match(app, /renderPlanShoppingInto\('#shoppingGroups'/);
  assert.doesNotMatch(app, /function renderShopping\(\)\{const items=aggregateShopping/);
});

test('shopping actions use the active plan and shared checked state', () => {
  assert.match(app, /shoppingClipboardText\(activePlan\)/);
  assert.match(app, /state\.checked\.plan=\{\}/);
  assert.doesNotMatch(app, /copyShopping'\)\.onclick=.*aggregateShopping/);
  assert.doesNotMatch(app, /state\.checked\['week'\+state\.week\]=\{\}/);
});

test('shopping tab has an explicit no-plan state', () => {
  assert.match(app, /Aktueller Sparplan ist nicht verfügbar/);
});

test('status failure says the current savings plan remains unchanged', () => {
  assert.match(app, /Wochenlauf nicht erreichbar – aktueller Sparplan bleibt unverändert/);
  assert.doesNotMatch(app, /Wochenlauf nicht erreichbar – Vorlagenpreise bleiben aktiv/);
});
