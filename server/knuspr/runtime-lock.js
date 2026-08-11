'use strict';

const queues = new Map();

function storeIdentity(store) {
  const identity = store && store.identity;
  if (typeof identity === 'symbol') return identity;
  if (typeof identity !== 'string' || !identity.trim()) {
    throw new Error('Knuspr-Speicheridentität fehlt');
  }
  return identity.trim();
}

async function withRuntimeLock(store, operation) {
  if (typeof operation !== 'function') throw new Error('Knuspr-Transaktion fehlt');
  const identity = storeIdentity(store);
  const previous = queues.get(identity) || Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.catch(() => {});
  queues.set(identity, tail);
  try {
    return await result;
  } finally {
    if (queues.get(identity) === tail) queues.delete(identity);
  }
}

module.exports = { storeIdentity, withRuntimeLock };
