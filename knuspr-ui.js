
'use strict';
(function (window) {
  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function additionalItemMarkup(item) {
    return `<li data-additional-id="${escapeAttribute(item.id)}" class="additional-item${item.enabled ? '' : ' paused'}"><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.searchTerm)} · ${escapeHtml(item.quantity)}</small></span><div class="item-actions"><button type="button" data-action="edit-additional">Bearbeiten</button><button type="button" data-action="toggle-additional">${item.enabled ? 'Pausieren' : 'Aktivieren'}</button><button type="button" data-action="delete-additional">Löschen</button></div></li>`;
  }

  function connectionStatusView(status) {
    if (status && status.connected) return { text: 'Verbunden mit Knuspr', className: 'success' };
    if (status && status.authorizationPending) return { text: 'Anmeldung läuft – Fenster abschließen, danach automatisch verbunden.', className: 'pending' };
    return { text: 'Nicht verbunden – bitte erneut mit Knuspr verbinden.', className: 'error' };
  }

  function generateId() {
    if (typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function init({ api, document: doc } = {}) {
    if (!api) throw new Error('KNUSPR_UI.init benötigt eine api-Instanz');
    const activeDocument = doc || window.document;
    if (!activeDocument) throw new Error('KNUSPR_UI.init benötigt ein document');

    const $ = selector => activeDocument.querySelector(selector);
    const $$ = selector => [...activeDocument.querySelectorAll(selector)];

    let items = [];
    let editingId = null;

    function toast(message) {
      const el = $('#toast');
      if (!el) return;
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
    }

    function renderStatus(status) {
      const el = $('#knusprConnectionStatus');
      const connectBtn = $('#connectKnuspr');
      const disconnectBtn = $('#disconnectKnuspr');
      const view = connectionStatusView(status);
      if (el) {
        el.textContent = view.text;
        el.className = `status ${view.className}`;
      }
      if (connectBtn) connectBtn.hidden = Boolean(status && status.connected);
      if (disconnectBtn) disconnectBtn.hidden = !(status && status.connected);
    }

    async function refreshStatus() {
      try {
        const status = await api.getKnusprStatus();
        renderStatus(status);
        return status;
      } catch (error) {
        renderStatus(null);
        return null;
      }
    }

    function resetForm() {
      editingId = null;
      const form = $('#additionalItemForm');
      if (form) form.reset();
      const submitBtn = $('#saveAdditionalItems');
      if (submitBtn) submitBtn.textContent = 'Hinzufügen';
    }

    function fillForm(item) {
      editingId = item.id;
      if ($('#additionalItemLabel')) $('#additionalItemLabel').value = item.label;
      if ($('#additionalItemSearchTerm')) $('#additionalItemSearchTerm').value = item.searchTerm;
      if ($('#additionalItemQuantity')) $('#additionalItemQuantity').value = item.quantity;
      if ($('#additionalItemCategory')) $('#additionalItemCategory').value = item.category;
      const submitBtn = $('#saveAdditionalItems');
      if (submitBtn) submitBtn.textContent = 'Aktualisieren';
    }

    function renderItems() {
      const list = $('#additionalItems');
      if (!list) return;
      list.innerHTML = items.length
        ? items.map(additionalItemMarkup).join('')
        : '<li class="empty">Noch keine zusätzlichen Artikel.</li>';
      bindItemActions();
    }

    // Persists the full next state to the server and only ever stores the
    // server's validated echo back into local view state (never the
    // optimistic client-side array), per the "save only validated server
    // responses" contract. api.saveAdditionalItems() itself throws if the
    // response isn't a validated array, so there is no fallback here to the
    // caller-supplied nextItems.
    async function persist(nextItems) {
      items = await api.saveAdditionalItems(nextItems);
      renderItems();
      return items;
    }

    function bindItemActions() {
      $$('#additionalItems [data-additional-id]').forEach(li => {
        const id = li.dataset.additionalId;
        const item = items.find(candidate => String(candidate.id) === id);
        if (!item) return;
        const editBtn = li.querySelector('[data-action="edit-additional"]');
        const toggleBtn = li.querySelector('[data-action="toggle-additional"]');
        const deleteBtn = li.querySelector('[data-action="delete-additional"]');
        if (editBtn) editBtn.onclick = () => fillForm(item);
        if (toggleBtn) toggleBtn.onclick = async () => {
          try {
            await persist(items.map(candidate => (candidate.id === item.id ? { ...candidate, enabled: !candidate.enabled } : candidate)));
            toast(item.enabled ? 'Artikel pausiert' : 'Artikel aktiviert');
          } catch (error) {
            toast(error.message || 'Aktualisierung fehlgeschlagen');
          }
        };
        if (deleteBtn) deleteBtn.onclick = async () => {
          try {
            await persist(items.filter(candidate => candidate.id !== item.id));
            if (editingId === item.id) resetForm();
            toast('Artikel gelöscht');
          } catch (error) {
            toast(error.message || 'Löschen fehlgeschlagen');
          }
        };
      });
    }

    async function loadItems() {
      try {
        items = await api.getAdditionalItems();
        renderItems();
      } catch (error) {
        toast('Zusatzliste konnte nicht geladen werden');
      }
    }

    function bindForm() {
      const form = $('#additionalItemForm');
      if (!form) return;
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const label = ($('#additionalItemLabel') || {}).value?.trim() || '';
        const searchTerm = ($('#additionalItemSearchTerm') || {}).value?.trim() || '';
        const quantity = Number(($('#additionalItemQuantity') || {}).value);
        const category = ($('#additionalItemCategory') || {}).value;
        if (!label || !searchTerm || !(quantity > 0) || !category) {
          toast('Bitte alle Felder gültig ausfüllen');
          return;
        }
        const nextItems = editingId
          ? items.map(candidate => (candidate.id === editingId ? { ...candidate, label, searchTerm, quantity, category } : candidate))
          : [...items, { id: generateId(), label, searchTerm, quantity, category, enabled: true, pinnedProductId: null }];
        try {
          const wasEditing = Boolean(editingId);
          await persist(nextItems);
          resetForm();
          toast(wasEditing ? 'Artikel aktualisiert' : 'Artikel hinzugefügt');
        } catch (error) {
          toast(error.message || 'Speichern fehlgeschlagen');
        }
      });
    }

    function bindConnection() {
      const connectBtn = $('#connectKnuspr');
      const disconnectBtn = $('#disconnectKnuspr');
      if (connectBtn) connectBtn.onclick = async () => {
        try {
          const result = await api.connectKnuspr();
          if (result && result.authorizationUrl && typeof window.open === 'function') {
            window.open(result.authorizationUrl, '_blank', 'noopener');
          }
          await refreshStatus();
        } catch (error) {
          toast(error.message || 'Verbindung fehlgeschlagen');
        }
      };
      if (disconnectBtn) disconnectBtn.onclick = async () => {
        try {
          await api.disconnectKnuspr();
          await refreshStatus();
          toast('Knuspr-Verbindung getrennt');
        } catch (error) {
          toast(error.message || 'Trennen fehlgeschlagen');
        }
      };
    }

    bindForm();
    bindConnection();
    refreshStatus();
    loadItems();

    return { refreshStatus, loadItems, renderItems };
  }

  window.KNUSPR_UI = { init, escapeHtml, escapeAttribute, additionalItemMarkup };
})(typeof window !== 'undefined' ? window : globalThis);
