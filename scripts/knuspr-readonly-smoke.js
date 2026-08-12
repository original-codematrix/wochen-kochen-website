'use strict';

const { createRuntime } = require('../server/knuspr-service');

async function runReadonlySmoke({ adapter, write = value => console.log(value) }) {
  const capabilities = await adapter.capabilities();
  if (!capabilities.searchProducts || !capabilities.readCart || !capabilities.addCartItems) {
    throw new Error('Benötigte Knuspr-Fähigkeiten fehlen');
  }
  const products = await adapter.searchProducts('Kartoffeln');
  write(JSON.stringify({
    capabilities,
    productCount: products.length,
    sample: products.slice(0, 3).map(({ id, name, available }) => ({ id, name, available })),
  }, null, 2));
}

if (require.main === module) {
  // createRuntime() builds and returns its runtime object synchronously (not a Promise) —
  // see server/knuspr-service.js. Destructure directly instead of chaining `.then()`.
  const { adapter } = createRuntime();
  runReadonlySmoke({ adapter }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { runReadonlySmoke };
