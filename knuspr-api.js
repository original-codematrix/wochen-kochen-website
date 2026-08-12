
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

    function asItems(body, fallback) {
      if (Array.isArray(body)) return body;
      if (body && Array.isArray(body.items)) return body.items;
      return fallback;
    }

    return {
      getKnusprStatus: () => request('/api/knuspr/status'),
      connectKnuspr: () => request('/api/knuspr/connect', { method: 'POST' }),
      disconnectKnuspr: () => request('/api/knuspr/disconnect', { method: 'POST' }),
      getAdditionalItems: () => request('/api/additional-items').then(body => asItems(body, [])),
      saveAdditionalItems: items => request('/api/additional-items', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(items),
      }).then(body => asItems(body, items)),
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
