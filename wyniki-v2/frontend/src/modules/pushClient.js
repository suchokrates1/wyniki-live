/* Subscribing the browser to "a match just started" notifications.
 *
 * Everything here is a no-op unless the server has VAPID keys configured, so
 * the UI can ask and simply be told "not available" rather than breaking.
 */

/** VAPID keys travel as URL-safe base64; PushManager wants raw bytes. */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported(win = globalThis) {
  return !!(win?.PushManager && win?.Notification && win?.navigator?.serviceWorker);
}

export async function fetchPushKey(fetchImpl = fetch) {
  try {
    const response = await fetchImpl('/api/push/key');
    if (!response.ok) return { enabled: false, public_key: '' };
    return await response.json();
  } catch {
    return { enabled: false, public_key: '' };
  }
}

/** Ask the browser, then the push service, then tell our server. */
export async function subscribe({ registration, publicKey, courtId = null, lang = 'pl', fetchImpl = fetch }) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };

  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    // Required by Chrome, and the only honest setting: every push we send
    // results in a notification the reader sees.
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const body = { ...subscription.toJSON(), court_id: courtId, lang };
  const response = await fetchImpl('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, reason: 'server' };
  return { ok: true, subscription };
}

export async function unsubscribe({ registration, fetchImpl = fetch }) {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { ok: true };
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => false);
  try {
    await fetchImpl('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // The browser-side subscription is already gone; the server prunes the row
    // the first time the push service reports the endpoint as dead.
  }
  return { ok: true };
}
