'use strict';

(function () {
  const configElement = document.getElementById('admin-initial-data');
  const feedbackElement = document.getElementById('admin-feedback');
  const loginSection = document.getElementById('login-section');
  const historySection = document.getElementById('history-section');
  const loginForm = document.getElementById('admin-login-form');
  const refreshButton = document.getElementById('refresh-history');
  const historyTableBody = document.getElementById('history-rows');
  const bodyElement = document.body;

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

  const intFields = new Set(initialConfig.int_fields || []);

  const fieldDefinitions = [
    { name: 'kort_id', type: 'text' },
    { name: 'ended_ts', type: 'text' },
    { name: 'duration_seconds', type: 'number' },
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

  function toggleAuthenticated(isAuthenticated) {
    if (loginSection) {
      loginSection.hidden = Boolean(isAuthenticated);
    }
    if (historySection) {
      historySection.hidden = !isAuthenticated;
    }
    if (bodyElement) {
      bodyElement.dataset.authenticated = isAuthenticated ? 'true' : 'false';
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
    historyTableBody.innerHTML = '';
    entries.forEach((entry) => {
      historyTableBody.appendChild(createRow(entry));
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
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  }

  async function refreshHistory() {
    try {
      const data = await requestJson('/api/admin/history', { method: 'GET' });
      if (Array.isArray(data.history)) {
        renderHistory(data.history);
        setFeedback('Lista zaktualizowana.', 'success');
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

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  if (refreshButton) {
    refreshButton.addEventListener('click', refreshHistory);
  }
  if (historyTableBody) {
    historyTableBody.addEventListener('click', handleTableClick);
  }

  toggleAuthenticated(Boolean(initialConfig.is_authenticated));
  if (Array.isArray(initialConfig.history) && initialConfig.history.length > 0) {
    renderHistory(initialConfig.history);
  }
})();
