'use strict';

const { createHash } = require('node:crypto');

const { validatePreview } = require('./contracts');

const applyQueues = new WeakMap();

function domainError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function invalid(message) {
  return domainError('KNUSPR_CART_INPUT_INVALID', message);
}

function conflict(message) {
  return domainError('KNUSPR_PREVIEW_CONFLICT', message, 409);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function positiveQuantity(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validateCartPreview(value) {
  const preview = validatePreview(value);
  if (!nonEmptyString(preview.revision) || !Array.isArray(preview.lines)) {
    throw invalid('Knuspr-Vorschau ist ungültig');
  }
  const ids = new Set();
  for (const line of preview.lines) {
    if (!isRecord(line) || !nonEmptyString(line.id) || ids.has(line.id)) {
      throw invalid('Knuspr-Vorschauposition ist ungültig');
    }
    ids.add(line.id);
  }
  return { ...preview, revision: preview.revision.trim(), lines: [...preview.lines] };
}

function cartQuantities(currentCart) {
  if (!Array.isArray(currentCart)) throw invalid('Knuspr-Warenkorb ist ungültig');
  const quantities = new Map();
  for (const line of currentCart) {
    if (!isRecord(line) || !nonEmptyString(line.productId) || !positiveQuantity(line.quantity)) {
      throw invalid('Knuspr-Warenkorbposition ist ungültig');
    }
    const productId = line.productId.trim();
    quantities.set(productId, (quantities.get(productId) || 0) + line.quantity);
  }
  return quantities;
}

function computeCartDelta(previewLines, currentCart) {
  if (!Array.isArray(previewLines)) throw invalid('Vorschaupositionen sind ungültig');
  const remaining = cartQuantities(currentCart);
  const delta = [];
  for (const line of previewLines) {
    if (!isRecord(line)) throw invalid('Vorschauposition ist ungültig');
    if (line.removed === true || line.product === null || line.product === undefined) continue;
    const lineId = nonEmptyString(line.id) ? line.id.trim() : null;
    const productId = isRecord(line.product) && nonEmptyString(line.product.id) ? line.product.id.trim() : null;
    const requested = line.cartQuantity;
    if (!lineId || !productId || !positiveQuantity(requested)) {
      throw invalid('Vorschauposition ist nicht übertragbar');
    }
    const covered = Math.min(requested, remaining.get(productId) || 0);
    remaining.set(productId, Math.max(0, (remaining.get(productId) || 0) - covered));
    const missing = requested - covered;
    if (missing > 0) delta.push({ lineId, productId, quantity: missing });
  }
  return delta;
}

function searchTerms(line) {
  const demand = isRecord(line && line.demand) ? line.demand : null;
  if (!demand) throw invalid('Suchangabe der Vorschauposition fehlt');
  const terms = [demand.searchTerm, ...(Array.isArray(demand.searchTerms) ? demand.searchTerms : [])]
    .filter(nonEmptyString)
    .map(term => term.trim());
  if (terms.length === 0) throw invalid('Suchangabe der Vorschauposition fehlt');
  return [...new Set(terms)];
}

function validateFreshProducts(products) {
  if (!Array.isArray(products)) throw invalid('Knuspr-Produktsuche ist ungültig');
  for (const candidate of products) {
    if (
      !isRecord(candidate)
      || !nonEmptyString(candidate.id)
      || typeof candidate.available !== 'boolean'
      || !isRecord(candidate.price)
      || typeof candidate.price.current !== 'number'
      || !Number.isFinite(candidate.price.current)
      || candidate.price.current < 0
    ) {
      throw invalid('Knuspr-Produkt ist ungültig');
    }
  }
  return products;
}

function productSafetySnapshot(product) {
  if (!isRecord(product)) return null;
  return {
    id: nonEmptyString(product.id) ? product.id.trim() : null,
    available: product.available,
    currentPrice: product.price && product.price.current,
    packageAmount: product.package && product.package.amount,
    packageUnit: product.package && product.package.unit,
    packageLabel: product.package && product.package.label,
  };
}

function sameSafetySnapshot(left, right) {
  return JSON.stringify(productSafetySnapshot(left)) === JSON.stringify(productSafetySnapshot(right));
}

function refreshedRevision(preview, lines) {
  return createHash('sha256')
    .update(JSON.stringify([preview.revision, lines]))
    .digest('hex')
    .slice(0, 20);
}

async function revalidatePreview(value, adapter) {
  const preview = validateCartPreview(value);
  if (!adapter || typeof adapter.searchProducts !== 'function') throw invalid('Knuspr-Produktsuche fehlt');

  const relevant = preview.lines.filter(line => line.removed !== true && isRecord(line.product));
  const queries = [...new Set(relevant.flatMap(searchTerms))];
  const productsByQuery = new Map();
  for (const query of queries) {
    productsByQuery.set(query, validateFreshProducts(await adapter.searchProducts(query)));
  }

  let changed = false;
  const lines = preview.lines.map((line) => {
    if (line.removed === true || !isRecord(line.product)) return line;
    const products = searchTerms(line).flatMap(query => productsByQuery.get(query) || []);
    const selectedId = nonEmptyString(line.product.id) ? line.product.id.trim() : null;
    if (!selectedId) throw invalid('Produkt der Vorschauposition ist ungültig');
    const fresh = products.find(candidate => candidate.id === selectedId) || null;
    if (fresh && sameSafetySnapshot(line.product, fresh)) return line;

    changed = true;
    const available = Boolean(fresh && fresh.available === true);
    const quantity = line.cartQuantity;
    const alternatives = products.filter(candidate => candidate.available === true && candidate.id !== selectedId);
    return {
      ...line,
      status: available ? 'selected' : 'missing',
      product: fresh,
      alternatives,
      totalPrice: fresh && positiveQuantity(quantity)
        ? Math.round((fresh.price.current * quantity + Number.EPSILON) * 100) / 100
        : null,
      reason: available ? line.reason : 'Produkt ist aktuell nicht lieferbar',
    };
  });

  if (!changed) return { changed: false, preview };
  const generatedAt = new Date().toISOString();
  const refreshed = {
    ...preview,
    generatedAt,
    revision: refreshedRevision(preview, lines),
    lines,
    estimatedTotal: Math.round((lines
      .filter(line => line.removed !== true)
      .reduce((sum, line) => sum + (Number(line.totalPrice) || 0), 0) + Number.EPSILON) * 100) / 100,
    openLineCount: lines.filter(line => line.removed !== true && line.status !== 'selected').length,
  };
  return { changed: true, preview: refreshed };
}

function acceptedLines(preview, acceptedLineIds) {
  if (!Array.isArray(acceptedLineIds) || acceptedLineIds.some(id => !nonEmptyString(id))) {
    throw invalid('Bestätigte Vorschaupositionen sind ungültig');
  }
  const accepted = new Set(acceptedLineIds.map(id => id.trim()));
  const byId = new Map(preview.lines.map(line => [line.id, line]));
  for (const lineId of accepted) {
    const line = byId.get(lineId);
    if (!line) throw invalid('Bestätigte Vorschauposition wurde nicht gefunden');
    if (line.removed === true || line.status !== 'selected' || !isRecord(line.product)) {
      throw invalid('Bestätigte Vorschauposition ist nicht übertragbar');
    }
  }
  return preview.lines.filter(line => accepted.has(line.id));
}

function mutationErrorCode(error) {
  return nonEmptyString(error && error.code) ? error.code.trim() : 'KNUSPR_CART_ADD_FAILED';
}

async function applyDeltaSequentially(delta, adapter, currentCart, previewRevision) {
  const observed = cartQuantities(currentCart);
  const receipt = {
    previewRevision,
    attemptedAt: new Date().toISOString(),
    lines: [],
  };

  for (const item of delta) {
    const before = observed.get(item.productId) || 0;
    try {
      await adapter.addCartItems([{ productId: item.productId, quantity: item.quantity }]);
      observed.set(item.productId, before + item.quantity);
      receipt.lines.push({
        lineId: item.lineId,
        productId: item.productId,
        requested: item.quantity,
        added: item.quantity,
        status: 'added',
        errorCode: null,
      });
    } catch (error) {
      const errorCode = mutationErrorCode(error);
      let reconciled;
      try {
        reconciled = cartQuantities(await adapter.getCart());
      } catch {
        receipt.lines.push({
          lineId: item.lineId,
          productId: item.productId,
          requested: item.quantity,
          added: 0,
          status: 'failed',
          errorCode: 'KNUSPR_CART_STATE_UNCERTAIN',
        });
        break;
      }
      const after = reconciled.get(item.productId) || 0;
      const added = Math.min(item.quantity, Math.max(0, after - before));
      observed.clear();
      for (const [productId, quantity] of reconciled) observed.set(productId, quantity);
      receipt.lines.push({
        lineId: item.lineId,
        productId: item.productId,
        requested: item.quantity,
        added,
        status: added === item.quantity ? 'added' : 'failed',
        errorCode,
      });
    }
  }
  return receipt;
}

async function applyPreviewTransaction({ previewRevision, acceptedLineIds, adapter, store }) {
  if (!adapter
    || typeof adapter.searchProducts !== 'function'
    || typeof adapter.getCart !== 'function'
    || typeof adapter.addCartItems !== 'function') {
    throw invalid('Knuspr-Warenkorbadapter fehlt');
  }
  const preview = validateCartPreview(await store.read('knuspr-preview.json', null));
  if (!nonEmptyString(previewRevision) || preview.revision !== previewRevision.trim()) {
    throw conflict('Vorschau ist veraltet');
  }
  const requestedLines = acceptedLines(preview, acceptedLineIds);
  const refreshed = await revalidatePreview(preview, adapter);
  if (refreshed.changed) {
    await store.write('knuspr-preview.json', refreshed.preview);
    return { status: 'reconfirm-required', preview: refreshed.preview };
  }
  const currentCart = await adapter.getCart();
  const delta = computeCartDelta(requestedLines, currentCart);
  const receipt = await applyDeltaSequentially(delta, adapter, currentCart, preview.revision);
  await store.write('knuspr-cart-receipt.json', receipt);
  return {
    status: receipt.lines.some(line => line.status === 'failed') ? 'partial' : 'complete',
    receipt,
  };
}

async function applyPreview(input = {}) {
  const store = input && input.store;
  if (!store || typeof store.read !== 'function' || typeof store.write !== 'function') {
    throw invalid('Knuspr-Speicher fehlt');
  }
  const previous = applyQueues.get(store) || Promise.resolve();
  const result = previous.then(
    () => applyPreviewTransaction(input),
    () => applyPreviewTransaction(input),
  );
  const tail = result.catch(() => {});
  applyQueues.set(store, tail);
  try {
    return await result;
  } finally {
    if (applyQueues.get(store) === tail) applyQueues.delete(store);
  }
}

module.exports = { applyPreview, computeCartDelta, revalidatePreview };
