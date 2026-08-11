const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { validateAdditionalItems, validatePreview } = require('../server/knuspr/contracts');
const { createKnusprStore } = require('../server/knuspr/store');

test('additional items reject unknown categories and normalize optional pins', () => {
  assert.deepEqual(
    validateAdditionalItems([{ id: 'water', label: 'Wasser', searchTerm: 'Mineralwasser', quantity: 2, category: 'getraenke', enabled: true }])[0].pinnedProductId,
    null,
  );
  assert.throws(
    () => validateAdditionalItems([{ id: 'x', label: 'X', searchTerm: 'X', quantity: 1, category: 'sonstiges', enabled: true }]),
    /Kategorie/,
  );
});

test('preview validation requires a preview object and returns a normalized copy', () => {
  const preview = { generatedAt: '2026-08-11T10:00:00.000Z', days: [{ date: '2026-08-12', items: [] }] };
  assert.deepEqual(validatePreview(preview), preview);
  assert.throws(() => validatePreview(null), /Vorschau/);
});

test('sensitive writes use mode 0600 and survive a complete read', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'knuspr-store-'));
  const store = createKnusprStore({ dataDir });
  await store.write('knuspr-auth.json', { tokens: { access_token: 'secret' } }, { sensitive: true });
  assert.deepEqual(await store.read('knuspr-auth.json', null), { tokens: { access_token: 'secret' } });
  assert.equal((await fs.stat(path.join(dataDir, 'knuspr-auth.json'))).mode & 0o777, 0o600);
});

test('writes are atomic, reads return fallback for missing files, and remove deletes a file', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'knuspr-store-'));
  const store = createKnusprStore({ dataDir });
  assert.equal(await store.read('knuspr-preview.json', 'fallback'), 'fallback');
  await store.write('knuspr-preview.json', { ok: true });
  assert.deepEqual(await store.read('knuspr-preview.json', null), { ok: true });
  await store.remove('knuspr-preview.json');
  assert.equal(await store.read('knuspr-preview.json', 'fallback'), 'fallback');
});

test('store rejects path traversal and unknown persisted names', async () => {
  const store = createKnusprStore({ dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'knuspr-store-')) });
  await assert.rejects(() => store.read('../outside.json', null), /Dateiname/);
  await assert.rejects(() => store.write('unknown.json', {}), /Dateiname/);
});
