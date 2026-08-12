'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

// Knuspr-only boundary: required files must exist, legacy retailer modules
// must be gone, and the active (non-test, non-docs) surface must be free of
// legacy retailer copy while still describing the Knuspr flow.
for (const required of ['knuspr-api.js', 'knuspr-ui.js', 'server/knuspr-service.js', 'server/knuspr/adapter.js']) {
  assert.equal(fs.existsSync(path.join(root, required)), true, `${required} fehlt`);
}
for (const removed of [
  'api/rewe-prices.js',
  'server/refresh.js',
  'server/regular-prices.js',
  'server/browser-setup.js',
  'server/price-baselines.json',
  'rewe-preise-beispiel.json',
]) {
  assert.equal(fs.existsSync(path.join(root, removed)), false, `${removed} muss entfernt sein`);
}
const active = ['index.html', 'app.js', 'knuspr-ui.js', 'README.md', 'config.example.json']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8'))
  .join('\n');
assert.doesNotMatch(active, /REWE|EDEKA|Kaufland|HTML-Import/i);
assert.match(active, /Knuspr/);

const required = ['index.html', 'styles.css', 'import.css', 'data.js', 'app.js', 'manifest.webmanifest', 'service-worker.js', 'README.md'];
for (const f of required) {
  if (!fs.existsSync(path.join(root, f))) throw new Error('Fehlt: ' + f);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const ref of ['styles.css', 'import.css', 'data.js', 'app.js', 'knuspr-api.js', 'knuspr-ui.js']) {
  if (!html.includes(ref)) throw new Error('Referenz fehlt: ' + ref);
}
for (const id of ['knusprFlow', 'generateKnusprPlan', 'dietaryExclusions', 'applyExclusions', 'prepTitle', 'prepSummary']) {
  if (!html.includes(`id="${id}"`)) throw new Error('Planungsbereich fehlt: ' + id);
}

const data = fs.readFileSync(path.join(root, 'data.js'), 'utf8');
if (!data.includes('window.KOCHBUCH_DATA')) throw new Error('Datenobjekt fehlt');
for (const recipe of ['frosta-evening', 'mexico-pork', 'spinach-pasta', 'leberkaese-eggs', 'pesto-pea-pasta', 'vegetable-egg-rice', 'spinach-tortellini', 'chicken-potato-pan']) {
  if (!data.includes(`"id": "${recipe}"`)) throw new Error('Angebotsrezept fehlt: ' + recipe);
}
if (data.includes('"id": "schlemmer-fish"')) throw new Error('Fischrezept darf nicht enthalten sein');

const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
if (app.includes('Liveabruf nicht verbunden')) throw new Error('Veraltete Liveabruf-Meldung darf nicht erscheinen');
if (!app.includes('r.seasoningTip')) throw new Error('Rezeptdialog muss die Gewürzempfehlung aus dem Rezept rendern');

const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
if (!worker.includes("const CACHE = 'kochbuch-v17';") || !worker.includes("pathname.startsWith('/api/')")) {
  throw new Error('Service Worker muss API-Antworten frisch laden und Cache-Version v15 verwenden');
}
const workerContext = { self: { addEventListener(){}, skipWaiting(){}, clients: { claim(){} } } };
vm.runInNewContext(`${worker}\nglobalThis.__cachedAssets=ASSETS;`, workerContext);
const cachedAssets = workerContext.__cachedAssets;
if (!Array.isArray(cachedAssets)) throw new Error('Service-Worker-ASSETS-Array fehlt');
const seasoningIndex = cachedAssets.indexOf('./recipe-seasonings.js');
const expansionIndex = cachedAssets.indexOf('./recipe-expansion.js');
const dataIndex = cachedAssets.indexOf('./data.js');
const knusprApiIndex = cachedAssets.indexOf('./knuspr-api.js');
const knusprUiIndex = cachedAssets.indexOf('./knuspr-ui.js');
const appIndex = cachedAssets.indexOf('./app.js');
if (seasoningIndex < 0 || expansionIndex < 0) throw new Error('Service-Worker-ASSETS fehlen Rezeptdatenmodule');
if (dataIndex < 0 || !(seasoningIndex < expansionIndex && expansionIndex < dataIndex)) {
  throw new Error('Service-Worker-ASSETS müssen recipe-seasonings.js, recipe-expansion.js und data.js in Browser-Ladereihenfolge cachen');
}
if (knusprApiIndex < 0 || knusprUiIndex < 0 || appIndex < 0 || !(knusprApiIndex < knusprUiIndex && knusprUiIndex < appIndex)) {
  throw new Error('Service-Worker-ASSETS müssen knuspr-api.js und knuspr-ui.js vor app.js cachen');
}

console.log('Website-Struktur OK');
