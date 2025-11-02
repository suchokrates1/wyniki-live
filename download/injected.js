// injected.js
(function () {
  function post(info) {
    try {
      window.postMessage({ type: 'UNO_BRIDGE_INFO', ...info }, '*');
      // plus do backgroundu -> storage
      chrome.runtime?.sendMessage?.({ type: 'UNO_BRIDGE_BROADCAST', ...info }, () => {});
    } catch {}
  }

  // 1) globalne zmienne w ramce control
  try {
    const token = window.singularAccessToken;
    const appInstance = window.singularAppInstance?.id || null;
    if (token || appInstance) post({ token, appInstance });
  } catch {}

  // We intentionally do not hook fetch/XHR/WebSocket or bridge methods any more.
  // The extension must not capture or forward UNO traffic. Only send basic
  // bridge info (token/app) when available.
})();
