'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'knuspr-api.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'knuspr-ui.js'), 'utf8');

test('settings expose OAuth connection without password fields', () => {
  assert.match(html, /id="connectKnuspr"/);
  assert.match(html, /id="knusprConnectionStatus"/);
  assert.doesNotMatch(html, /rhl-pass|Knuspr-Passwort/i);
});

test('additional list has create, edit, pause, and delete controls', () => {
  for (const id of ['additionalItemForm', 'additionalItems', 'additionalItemCategory', 'saveAdditionalItems']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const action of ['edit-additional', 'toggle-additional', 'delete-additional']) {
    assert.match(uiSource, new RegExp(action));
  }
});

test('additional item category select offers exactly the allowed server categories', () => {
  assert.match(html, /id="additionalItemCategory"[\s\S]*?<\/select>/);
  const [select] = html.match(/id="additionalItemCategory"[\s\S]*?<\/select>/);
  assert.match(select, /value="getraenke"/);
  assert.match(select, /value="vorrat"/);
  assert.match(select, /value="haushalt"/);
  assert.doesNotMatch(select, /value="sonstiges"/);
});

test('knuspr-api.js exposes the required thin client methods', () => {
  for (const method of [
    'getKnusprStatus', 'connectKnuspr', 'disconnectKnuspr',
    'getAdditionalItems', 'saveAdditionalItems',
    'generatePlan', 'getPreview', 'patchPreview', 'applyCart',
  ]) {
    assert.match(apiSource, new RegExp(method));
  }
});

test('knuspr-api.js request helper attaches caller-supplied auth headers and throws on non-ok responses', () => {
  assert.match(apiSource, /authHeaders/);
  assert.match(apiSource, /response\.ok/);
  assert.match(apiSource, /createKnusprApi/);
});

test('knuspr-ui.js escapes user-provided strings before DOM insertion', () => {
  assert.match(uiSource, /function escapeHtml/);
  assert.match(uiSource, /function escapeAttribute/);
  assert.match(uiSource, /escapeHtml\(item\.label\)/);
  assert.match(uiSource, /escapeAttribute\(item\.id\)/);
  assert.doesNotMatch(uiSource, /innerHTML\s*=\s*item\./);
});

test('knuspr-ui.js exposes window.KNUSPR_UI.init({ api, document })', () => {
  assert.match(uiSource, /window\.KNUSPR_UI\s*=/);
  assert.match(uiSource, /function init\(/);
});

test('knuspr-ui.js renders connected, disconnected, and reconnect-pending states', () => {
  assert.match(uiSource, /status\s*&&\s*status\.connected/);
  assert.match(uiSource, /authorizationPending/);
});

test('knuspr-ui.js persists mutations through the API and re-renders from validated server responses', () => {
  assert.match(uiSource, /api\.saveAdditionalItems/);
  assert.match(uiSource, /api\.getAdditionalItems/);
  assert.match(uiSource, /api\.connectKnuspr/);
  assert.match(uiSource, /api\.disconnectKnuspr/);
});

test('app.js wires KNUSPR_UI.init using its existing authHeaders convention', () => {
  assert.match(appSource, /KNUSPR_UI\.init/);
  assert.match(appSource, /createKnusprApi\(\{\s*authHeaders/);
});

test('index.html loads the new Knuspr scripts', () => {
  assert.match(html, /src="knuspr-api\.js"/);
  assert.match(html, /src="knuspr-ui\.js"/);
});
