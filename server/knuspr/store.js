const path = require('node:path');
const defaultFs = require('node:fs/promises');

const PERSISTED_NAMES = new Set([
  'knuspr-auth.json',
  'knuspr-additional-items.json',
  'knuspr-product-cache.json',
  'knuspr-preview.json',
  'current-plan.json',
  'knuspr-cart-receipt.json',
]);

function safeName(name) {
  if (typeof name !== 'string' || !PERSISTED_NAMES.has(name) || path.basename(name) !== name) {
    throw new Error('Dateiname ist nicht erlaubt');
  }
  return name;
}

function createKnusprStore({ dataDir, fsImpl = defaultFs }) {
  if (!dataDir) throw new Error('Datenverzeichnis fehlt');
  async function read(name, fallback) {
    const target = path.join(dataDir, safeName(name));
    try {
      return JSON.parse(await fsImpl.readFile(target, 'utf8'));
    } catch (error) {
      if (error && error.code === 'ENOENT') return fallback;
      throw error;
    }
  }
  async function write(name, value, { sensitive = false } = {}) {
    const target = path.join(dataDir, safeName(name));
    const temporary = `${target}.${process.pid}.tmp`;
    await fsImpl.mkdir(dataDir, { recursive: true });
    await fsImpl.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: sensitive ? 0o600 : 0o644 });
    await fsImpl.rename(temporary, target);
    if (sensitive) await fsImpl.chmod(target, 0o600);
  }
  async function remove(name) {
    const target = path.join(dataDir, safeName(name));
    try {
      await fsImpl.unlink(target);
    } catch (error) {
      if (error && error.code !== 'ENOENT') throw error;
    }
  }
  return { read, write, remove };
}

module.exports = { PERSISTED_NAMES, createKnusprStore };
