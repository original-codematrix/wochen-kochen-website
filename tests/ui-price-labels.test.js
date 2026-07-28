'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('expanded seasoned recipe catalog labels public, stale and estimated shopping prices', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  assert.match(app, /Normalpreis · öffentlich geprüft/);
  assert.match(app, /zuletzt gesehen/);
  assert.match(app, /geschätzt/);
  assert.match(app, /regularPriceCount/);
});

test('service worker cache stays synchronized with the expanded seasoned recipe catalog UI', () => {
  const worker = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
  assert.match(worker, /const CACHE = 'kochbuch-v14';/);
});
