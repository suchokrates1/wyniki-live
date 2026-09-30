/* Telling the reader when a newer version of the page is waiting.
 *
 * The worker no longer calls skipWaiting() on install: swapping the shell out
 * from under someone mid-match is the kind of surprise a scoreboard should not
 * spring. It installs, waits, and this asks the reader when to take it.
 */

export const SKIP_WAITING = 'SKIP_WAITING';

/** Call `onReady` once a new worker is installed and waiting to take over.
 *
 * `serviceWorker` is passed in rather than read off `navigator` so the rule
 * about first installs can be tested without a browser.
 */
export function watchForUpdate(registration, onReady, serviceWorker = globalThis.navigator?.serviceWorker) {
  if (!registration || typeof onReady !== 'function') return () => {};

  let announced = false;
  const announce = () => {
    if (announced) return;
    announced = true;
    onReady(registration);
  };

  // No controller means nothing was serving this page before, so an installed
  // worker is a first install, not an update, and there is nothing to announce.
  const isUpdate = () => !!serviceWorker?.controller;

  // Already waiting when the page loaded — the update arrived in an earlier visit.
  if (registration.waiting && isUpdate()) announce();

  const onUpdateFound = () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && isUpdate()) announce();
    });
  };

  registration.addEventListener('updatefound', onUpdateFound);
  return () => registration.removeEventListener('updatefound', onUpdateFound);
}

/** Shared between `applyUpdate` and `reloadOnControllerChange`.
 *
 * The controller also changes on a first visit, when the very first worker
 * activates and claims the page. Reloading then would bounce every new reader
 * once, for no reason, so the reload waits for someone to actually press
 * "refresh". Passed around explicitly rather than kept as module state, so a
 * test can hold two independent sessions.
 */
export function createUpdateSession() {
  return { requested: false };
}

/** Hand control to the waiting worker. The page reloads on `controllerchange`. */
export function applyUpdate(registration, session = null) {
  if (session) session.requested = true;
  registration?.waiting?.postMessage({ type: SKIP_WAITING });
}

/** Reload once the worker the reader asked for takes over, and only once. */
export function reloadOnControllerChange(serviceWorker, reload, session = null) {
  if (!serviceWorker) return;
  let reloaded = false;
  serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !session?.requested) return;
    reloaded = true;
    reload();
  });
}
