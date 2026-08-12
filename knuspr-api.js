
'use strict';
(function (window) {
  function identityHeaders(extra) {
    return extra || {};
  }

  function createKnusprApi({ authHeaders, fetchImpl } = {}) {
    const getAuthHeaders = typeof authHeaders === 'function' ? authHeaders : identityHeaders;
    const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(window) : undefined);
    if (typeof doFetch !== 'function') throw new Error('Kein fetch verfügbar');

    async function request(path, options = {}) {
      const response = await doFetch(path, { ...options, headers: getAuthHeaders(options.headers || {}) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(body.error || `HTTP ${response.status}`), { status: response.status, details: body });
      return body;
    }

    // A successful (response.ok) reply whose body isn't array-shaped (e.g. an
    // empty body, a stripped 204, or a malformed proxy response) must fail
    // loudly rather than silently falling back to the caller's own
    // optimistic array — that fallback would let unvalidated client state
    // masquerade as the server's validated echo. A wrapped `{ items: [...] }`
    // shape is still accepted defensively in case the response format ever
    // changes, but the real server always returns a bare array.
    function asItems(body) {
      if (Array.isArray(body)) return body;
      if (body && Array.isArray(body.items)) return body.items;
      throw Object.assign(new Error('Antwort der Zusatzliste ist ungültig'), { details: body });
    }

    return {
      getKnusprStatus: () => request('/api/knuspr/status'),
      connectKnuspr: () => request('/api/knuspr/connect', { method: 'POST' }),
      disconnectKnuspr: () => request('/api/knuspr/disconnect', { method: 'POST' }),
      getAdditionalItems: () => request('/api/additional-items').then(asItems),
      saveAdditionalItems: items => request('/api/additional-items', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(items),
      }).then(asItems),
      generatePlan: (input = {}) => request('/api/plan/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
      getPreview: () => request('/api/preview'),
      patchPreview: (input = {}) => request('/api/preview', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
      applyCart: (input = {}) => request('/api/knuspr/cart/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    };
  }

  window.KNUSPR_API = { createKnusprApi };
})(typeof window !== 'undefined' ? window : globalThis);
