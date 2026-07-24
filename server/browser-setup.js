'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { browserFetchHtml, parseRewe, parseEdeka, filterAllowedOffers } = require('./refresh');

const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '..', 'runtime-data');
const rawDir = path.join(dataDir, 'browser-raw');

const sources = [
  {
    name: 'REWE Eching',
    url: 'https://www.rewe.de/angebote/eching/440303/rewe-markt-schlesierstr-4/',
    parse: parseRewe
  },
  {
    name: 'EDEKA Morsestraße',
    url: 'https://www.edeka.de/maerkte/234100/',
    parse: parseEdeka
  }
];

(async () => {
  fs.mkdirSync(rawDir, { recursive: true });
  const captured = [];
  console.log('Ein Browser öffnet sich. Falls eine Händlerprüfung erscheint, bitte dort bestätigen.');
  for (const source of sources) {
    try {
      console.log(`${source.name} wird geöffnet …`);
      const html = await browserFetchHtml(source.url, { headless: false, manual: true });
      const offers = filterAllowedOffers(source.parse(html));
      fs.writeFileSync(path.join(rawDir, `${source.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`), html);
      captured.push({ market: source.name, url: source.url, offers });
      const count = offers.length;
      console.log(`${source.name}: Browserprofil gespeichert, ${count} zulässige Angebote erkannt.`);
    } catch (error) {
      console.error(`${source.name}: ${error.message}`);
    }
  }
  fs.writeFileSync(path.join(dataDir, 'browser-offers.json'), JSON.stringify({
    capturedAt: new Date().toISOString(),
    sources: captured
  }, null, 2));
  console.log('Einrichtung beendet. Jetzt `npm run refresh` ausführen.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
