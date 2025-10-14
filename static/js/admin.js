'use strict';

(function () {
  const configElement = document.getElementById('admin-initial-data');
  const feedbackElement = document.getElementById('admin-feedback');
  const loginSection = document.getElementById('login-section');
  const historySection = document.getElementById('history-section');
  const courtsSection = document.getElementById('courts-section');
  const streamSection = document.getElementById('stream-section');
  const loginForm = document.getElementById('admin-login-form');
  const refreshHistoryButton = document.getElementById('refresh-history');
  const historyTableBody = document.getElementById('history-rows');
  const courtForm = document.getElementById('court-form');
  const refreshCourtsButton = document.getElementById('refresh-courts');
  const courtsTableBody = document.getElementById('courts-rows');
  const youtubeConfigForm = document.getElementById('youtube-config-form');
  const youtubeApiKeyInput = document.getElementById('youtube-api-key');
  const youtubeStreamIdInput = document.getElementById('youtube-stream-id');
  const refreshViewersButton = document.getElementById('refresh-viewers');
  const viewerCountElement = document.getElementById('viewer-count');
  const viewerStatusElement = document.getElementById('viewer-status');
  const bodyElement = document.body;
  const adminDisabledSection = document.getElementById('admin-disabled-section');

  if (!configElement) {
    return;
  }

  let initialConfig;
  try {
    initialConfig = JSON.parse(configElement.textContent || '{}');
  } catch (error) {
    console.error('Niepoprawne dane początkowe panelu administratora', error);
    initialConfig = { history: [], is_authenticated: false, int_fields: [] };
  }

  const adminEnabled = initialConfig.admin_enabled !== false;
  const disabledMessage =
    initialConfig.admin_disabled_message ||
    'Panel administracyjny jest wyłączony przez administratora.';
  const intFields = new Set(initialConfig.int_fields || []);
  const initialCourts = Array.isArray(initialConfig.courts) ? initialConfig.courts : [];

  const fieldDefinitions = [
    { name: 'kort_id', type: 'text' },
    { name: 'ended_ts', type: 'text' },
    { name: 'duration_seconds', type: 'number' },
    { name: 'category', type: 'text' },
    { name: 'phase', type: 'text' },
    { name: 'player_a', type: 'text' },
    { name: 'player_b', type: 'text' },
    { name: 'set1_a', type: 'number' },
    { name: 'set1_b', type: 'number' },
    { name: 'set2_a', type: 'number' },
    { name: 'set2_b', type: 'number' },
    { name: 'tie_a', type: 'number' },
    { name: 'tie_b', type: 'number' },
    { name: 'set1_tb_a', type: 'number' },
    { name: 'set1_tb_b', type: 'number' },
    { name: 'set2_tb_a', type: 'number' },
    { name: 'set2_tb_b', type: 'number' }
  ];

  function setFeedback(message, type = 'info') {
    if (!feedbackElement) {
      return;
    }
    feedbackElement.textContent = message || '';
    feedbackElement.dataset.type = type;
  }

  function setViewerStatus(message, type = 'info') {
    if (!viewerStatusElement) {
      return;
    }
    const text = message || '';
    viewerStatusElement.textContent = text;
    viewerStatusElement.hidden = text === '';
    if (viewerStatusElement.hidden) {
      viewerStatusElement.classList.remove('error');
      return;
    }
    if (type === 'error') {
      viewerStatusElement.classList.add('error');
    } else {
      viewerStatusElement.classList.remove('error');
    }
  }

  function toggleAuthenticated(isAuthenticated) {
    if (!adminEnabled) {
      if (loginSection) {
        loginSection.hidden = true;
      }
      if (historySection) {
        historySection.hidden = true;
      }
      if (courtsSection) {
        courtsSection.hidden = true;
      }
      if (streamSection) {
        streamSection.hidden = true;
      }
      if (adminDisabledSection) {
        adminDisabledSection.hidden = false;
      }
      if (bodyElement) {
        bodyElement.dataset.authenticated = 'false';
        bodyElement.dataset.adminEnabled = 'false';
      }
      return;
    }
    if (loginSection) {
      loginSection.hidden = Boolean(isAuthenticated);
    }
    if (historySection) {
      historySection.hidden = !isAuthenticated;
    }
    if (courtsSection) {
      courtsSection.hidden = !isAuthenticated;
    }
    if (streamSection) {
      streamSection.hidden = !isAuthenticated;
    }
    if (bodyElement) {
      bodyElement.dataset.authenticated = isAuthenticated ? 'true' : 'false';
      bodyElement.dataset.adminEnabled = 'true';
    }
  }

  function createInput(field, value) {
    const input = document.createElement('input');
    input.name = field.name;
    input.type = field.type;
    input.value = value ?? '';
    if (field.type === 'number') {
      input.inputMode = 'numeric';
      input.step = '1';
    }
    return input;
  }

  function createRow(entry) {
    const row = document.createElement('tr');
    row.dataset.entryId = String(entry.id);

    const idCell = document.createElement('td');
    idCell.className = 'id';
    idCell.textContent = String(entry.id);
    row.appendChild(idCell);

    fieldDefinitions.forEach((field) => {
      const cell = document.createElement('td');
      const value = entry[field.name];
      const input = createInput(field, value === null ? '' : value);
      cell.appendChild(input);
      row.appendChild(cell);
    });

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';
    const updateButton = document.createElement('button');
    updateButton.type = 'button';
    updateButton.className = 'update-entry';
    updateButton.textContent = 'Zapisz';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-entry';
    deleteButton.textContent = 'Usuń';
    actionsCell.appendChild(updateButton);
    actionsCell.appendChild(deleteButton);
    row.appendChild(actionsCell);

    return row;
  }

  function renderHistory(entries) {
    if (!historyTableBody) {
      return;
    }

    const fragment = document.createDocumentFragment();
    (entries || []).forEach((entry) => {
      fragment.appendChild(createRow(entry));
    });

    if (typeof historyTableBody.replaceChildren === 'function') {
      historyTableBody.replaceChildren(fragment);
    } else {
      historyTableBody.innerHTML = '';
      historyTableBody.appendChild(fragment);
    }
  }

  function createCourtRow(court) {
    const row = document.createElement('tr');
    row.dataset.kortId = String(court.kort_id);

    const kortCell = document.createElement('td');
    kortCell.className = 'kort-id';
    kortCell.textContent = String(court.kort_id);
    row.appendChild(kortCell);

    const overlayCell = document.createElement('td');
    overlayCell.className = 'overlay-id';
    overlayCell.textContent = court.overlay_id ? String(court.overlay_id) : '';
    row.appendChild(overlayCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'reset-court';
    resetButton.textContent = 'Resetuj';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-court';
    deleteButton.textContent = 'Usuń';
    actionsCell.appendChild(resetButton);
    actionsCell.appendChild(deleteButton);
    row.appendChild(actionsCell);

    return row;
  }

  function renderCourts(courts) {
    if (!courtsTableBody) {
      return;
    }

    const fragment = document.createDocumentFragment();
    (courts || []).forEach((court) => {
      fragment.appendChild(createCourtRow(court));
    });

    if (typeof courtsTableBody.replaceChildren === 'function') {
      courtsTableBody.replaceChildren(fragment);
    } else {
      courtsTableBody.innerHTML = '';
      courtsTableBody.appendChild(fragment);
    }
  }

  function applyYoutubeConfig(data, options = {}) {
    const updateInputs = options.updateInputs !== false;
    if (updateInputs && youtubeApiKeyInput) {
      youtubeApiKeyInput.value =
        data && typeof data.api_key === 'string' ? data.api_key : '';
    }
    if (updateInputs && youtubeStreamIdInput) {
      youtubeStreamIdInput.value =
        data && typeof data.stream_id === 'string' ? data.stream_id : '';
    }
    if (viewerCountElement) {
      const countValue = Number(data && typeof data.viewers !== 'undefined' ? data.viewers : 0);
      viewerCountElement.textContent = Number.isFinite(countValue)
        ? String(Math.max(0, Math.trunc(countValue)))
        : '0';
    }
    const errorMessage =
      data && typeof data.viewers_error === 'string' ? data.viewers_error : '';
    setViewerStatus(errorMessage, errorMessage ? 'error' : 'info');
  }

  async function loadYoutubeConfig(options = {}) {
    if (!adminEnabled) {
      return;
    }
    const { updateInputs = true, successMessage } = options;
    try {
      const data = await requestJson('/api/admin/youtube', { method: 'GET' });
      applyYoutubeConfig(data, { updateInputs });
      if (successMessage) {
        setFeedback(successMessage, 'success');
      }
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function handleYoutubeConfigSubmit(event) {
    event.preventDefault();
    if (!youtubeConfigForm) {
      return;
    }
    const formData = new FormData(youtubeConfigForm);
    const apiKey = String(formData.get('api_key') || '').trim();
    const streamId = String(formData.get('stream_id') || '').trim();
    const payload = { api_key: apiKey, stream_id: streamId };
    try {
      const data = await requestJson('/api/admin/youtube', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      applyYoutubeConfig(data, { updateInputs: true });
      setFeedback('Konfiguracja YouTube zapisana.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function handleRefreshViewers() {
    await loadYoutubeConfig({
      updateInputs: false,
      successMessage: 'Liczba widzów odświeżona.'
    });
  }

  function updateRowFromEntry(row, entry) {
    fieldDefinitions.forEach((field) => {
      const input = row.querySelector(`input[name="${field.name}"]`);
      if (input) {
        const value = entry[field.name];
        input.value = value === null || typeof value === 'undefined' ? '' : value;
      }
    });
  }

  function parseRow(row) {
    const payload = {};
    fieldDefinitions.forEach((field) => {
      const input = row.querySelector(`input[name="${field.name}"]`);
      if (!input) {
        return;
      }
      const value = input.value.trim();
      if (value === '') {
        payload[field.name] = null;
        return;
      }
      if (intFields.has(field.name) || field.type === 'number') {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
          throw new Error(`Pole ${field.name} musi być liczbą.`);
        }
        payload[field.name] = parsed;
      } else {
        payload[field.name] = value;
      }
    });
    return payload;
  }

  async function requestJson(url, options) {
    const requestOptions = { credentials: 'same-origin', ...(options || {}) };
    requestOptions.headers = {
      'Content-Type': 'application/json',
      ...(options && options.headers)
    };
    const response = await fetch(url, requestOptions);
    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error('Nie udało się odczytać odpowiedzi serwera.');
    }
    if (!response.ok || !data || data.ok === false) {
      const message = (data && (data.message || data.error)) || 'Wystąpił błąd serwera.';
      throw new Error(message);
    }
    return data;
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!loginForm) {
      return;
    }
    const formData = new FormData(loginForm);
    const password = formData.get('password');
    if (!password || String(password).trim() === '') {
      setFeedback('Podaj hasło administratora.', 'error');
      return;
    }
    try {
      await requestJson('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: String(password).trim() })
      });
      setFeedback('Zalogowano pomyślnie.', 'success');
      toggleAuthenticated(true);
      await refreshHistory();
      await refreshCourts();
      await loadYoutubeConfig();
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function refreshHistory() {
    try {
      const data = await requestJson('/api/admin/history', { method: 'GET' });
      if (Array.isArray(data.history)) {
        renderHistory(data.history);
        setFeedback('Historia zaktualizowana.', 'success');
      }
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function refreshCourts() {
    try {
      const data = await requestJson('/api/admin/courts', { method: 'GET' });
      if (Array.isArray(data.courts)) {
        renderCourts(data.courts);
        setFeedback('Lista kortów zaktualizowana.', 'success');
      }
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function updateEntry(row) {
    const entryId = row.dataset.entryId;
    if (!entryId) {
      setFeedback('Nie udało się odczytać identyfikatora rekordu.', 'error');
      return;
    }
    let payload;
    try {
      payload = parseRow(row);
    } catch (error) {
      setFeedback(error.message, 'error');
      return;
    }
    try {
      const data = await requestJson(`/api/admin/history/${entryId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      if (data.entry) {
        updateRowFromEntry(row, data.entry);
      }
      setFeedback('Rekord zapisany.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function handleCourtFormSubmit(event) {
    event.preventDefault();
    if (!courtForm) {
      return;
    }
    const formData = new FormData(courtForm);
    const kortId = String(formData.get('kort_id') || '').trim();
    const overlayValueRaw = formData.get('overlay_id');
    const overlayId = overlayValueRaw === null ? '' : String(overlayValueRaw).trim();
    if (!kortId) {
      setFeedback('Podaj identyfikator kortu.', 'error');
      return;
    }
    const payload = { kort_id: kortId };
    if (overlayId !== '') {
      payload.overlay_id = overlayId;
    }
    try {
      const data = await requestJson('/api/admin/courts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (Array.isArray(data.courts)) {
        renderCourts(data.courts);
      }
      if (courtForm) {
        courtForm.reset();
      }
      setFeedback(data.created ? 'Kort dodany.' : 'Kort zaktualizowany.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function deleteCourtRow(row) {
    const kortId = row.dataset.kortId;
    if (!kortId) {
      setFeedback('Nie udało się odczytać identyfikatora kortu.', 'error');
      return;
    }
    if (!window.confirm('Czy na pewno usunąć ten kort?')) {
      return;
    }
    try {
      const data = await requestJson(`/api/admin/courts/${encodeURIComponent(kortId)}`, {
        method: 'DELETE'
      });
      if (Array.isArray(data.courts)) {
        renderCourts(data.courts);
      } else {
        row.remove();
      }
      setFeedback('Kort został usunięty.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function resetCourtState(kortId) {
    if (!kortId) {
      setFeedback('Nie udało się odczytać identyfikatora kortu.', 'error');
      return;
    }
    if (!window.confirm(`Czy na pewno wyzerować stan kortu ${kortId}?`)) {
      return;
    }
    try {
      const data = await requestJson(`/api/admin/courts/${encodeURIComponent(kortId)}/reset`, {
        method: 'POST'
      });
      const message = (data && (data.message || data.detail)) || `Kort ${kortId} został wyzerowany.`;
      setFeedback(message, 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function deleteEntry(row) {
    const entryId = row.dataset.entryId;
    if (!entryId) {
      setFeedback('Nie udało się odczytać identyfikatora rekordu.', 'error');
      return;
    }
    if (!window.confirm('Czy na pewno usunąć ten rekord?')) {
      return;
    }
    try {
      await requestJson(`/api/admin/history/${entryId}`, { method: 'DELETE' });
      row.remove();
      setFeedback('Rekord został usunięty.', 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  function handleTableClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const row = target.closest('tr[data-entry-id]');
    if (!row) {
      return;
    }
    if (target.classList.contains('update-entry')) {
      updateEntry(row);
    } else if (target.classList.contains('delete-entry')) {
      deleteEntry(row);
    }
  }

  function handleCourtsTableClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const row = target.closest('tr[data-kort-id]');
    if (!row) {
      return;
    }
    if (target.classList.contains('reset-court')) {
      resetCourtState(row.dataset.kortId || '');
    } else if (target.classList.contains('delete-court')) {
      deleteCourtRow(row);
    }
  }

  if (bodyElement) {
    bodyElement.dataset.adminEnabled = adminEnabled ? 'true' : 'false';
  }

  if (!adminEnabled) {
    setFeedback(disabledMessage, 'info');
  }

  if (loginForm && adminEnabled) {
    loginForm.addEventListener('submit', handleLogin);
  }
  if (refreshHistoryButton && adminEnabled) {
    refreshHistoryButton.addEventListener('click', refreshHistory);
  }
  if (historyTableBody && adminEnabled) {
    historyTableBody.addEventListener('click', handleTableClick);
  }
  if (courtForm && adminEnabled) {
    courtForm.addEventListener('submit', handleCourtFormSubmit);
  }
  if (refreshCourtsButton && adminEnabled) {
    refreshCourtsButton.addEventListener('click', refreshCourts);
  }
  if (courtsTableBody && adminEnabled) {
    courtsTableBody.addEventListener('click', handleCourtsTableClick);
  }
  if (youtubeConfigForm && adminEnabled) {
    youtubeConfigForm.addEventListener('submit', handleYoutubeConfigSubmit);
  }
  if (refreshViewersButton && adminEnabled) {
    refreshViewersButton.addEventListener('click', handleRefreshViewers);
  }

  toggleAuthenticated(Boolean(initialConfig.is_authenticated));
  if (adminEnabled) {
    if (Array.isArray(initialConfig.history) && initialConfig.history.length > 0) {
      renderHistory(initialConfig.history);
    }
    if (Boolean(initialConfig.is_authenticated)) {
      renderCourts(initialCourts);
      loadYoutubeConfig().catch((error) => {
        if (error && error.message) {
          setFeedback(error.message, 'error');
        }
      });
    }
  }
})();
