// background.js
// background.js - minimal background script for UNO Picker

function storageSet(items) {
  if (!chrome?.storage?.local?.set) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, () => {
        const err = chrome?.runtime?.lastError;
        if (err) {
          console.warn('[UNO Picker] storage.set failed', err.message || err);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (err) {
      console.warn('[UNO Picker] storage.set error', err);
      resolve(false);
    }
  });
}

// Keep a minimal listener to store broadcasted bridge info (token/app instance)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  try {
    if (msg?.type === 'UNO_BRIDGE_BROADCAST') {
      storageSet({ unoToken: msg.token || null, unoApp: msg.appInstance || null }).then(() => sendResponse({ ok: true }));
      return true; // async
    }
  } catch (err) {
    console.warn('[UNO Picker][BG] message handling failed', err);
  }
  sendResponse({ ok: true });
  return false;
});
