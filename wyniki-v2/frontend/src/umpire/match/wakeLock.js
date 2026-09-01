export function createWakeLock({ navigatorRef = globalThis.navigator } = {}) {
  let sentinel = null;

  async function request() {
    try {
      if (!navigatorRef?.wakeLock?.request) return false;
      sentinel = await navigatorRef.wakeLock.request('screen');
      sentinel.addEventListener?.('release', () => {
        sentinel = null;
      });
      return true;
    } catch {
      sentinel = null;
      return false;
    }
  }

  async function release() {
    try {
      await sentinel?.release?.();
    } catch {
      // ignore
    }
    sentinel = null;
  }

  return {
    request,
    release,
    get active() {
      return Boolean(sentinel);
    },
  };
}
