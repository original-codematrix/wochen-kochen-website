'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('shopping UI distinguishes public, stale and estimated prices', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  assert.match(app, /Normalpreis · öffentlich geprüft/);
  assert.match(app, /zuletzt gesehen/);
  assert.match(app, /geschätzt/);
  assert.match(app, /regularPriceCount/);
});

test('service worker cache is incremented for the changed application shell', () => {
  const worker = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
  assert.match(worker, /kochbuch-v12/);
});

