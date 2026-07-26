export function officeApiPath(slot, suffix = '') {
  const base = `/api/office/${slot}`;
  return suffix ? `${base}/${suffix.replace(/^\//, '')}` : base;
}

export function officeAuthHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function officeFetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
