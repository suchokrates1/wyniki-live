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

  // 2) przechwytywanie fetch/XMLHttpRequest, żeby złapać endpoint API
  const putPattern = (url, method, body, raw) => {
    try {
      window.postMessage({ type: 'UNO_API_CAPTURE', url, method, body }, '*');
      if (body && typeof body === 'object' && body.command) {
        window.postMessage({
          type: 'UNO_API_EVENT',
          url,
          method,
          body,
          raw
        }, '*');
      }
    } catch {}
  };

  const _fetch = window.fetch;
  window.fetch = async function (url, opts = {}) {
    try {
      const method = (opts.method || 'GET').toUpperCase();
      if (/\/apiv2\/controlapps\/.+\/api/.test(String(url))) {
        let body = null;
        let raw = null;
        if (opts.body && typeof opts.body === 'string') {
          raw = opts.body;
          try { body = JSON.parse(opts.body); } catch {}
        }
        putPattern(String(url), method, body, raw);
      }
    } catch {}
    return _fetch.apply(this, arguments);
  };

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__uno = { method, url: String(url) };
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this.__uno && /\/apiv2\/controlapps\/.+\/api/.test(this.__uno.url)) {
        let parsed = null;
        let raw = null;
        if (body && typeof body === 'string') {
          raw = body;
          try { parsed = JSON.parse(body); } catch {}
        }
        putPattern(this.__uno.url, this.__uno.method, parsed, raw);
      }
    } catch {}
    return _send.apply(this, arguments);
  };

  function summarize(data) {
    try {
      if (data == null) return null;
      if (typeof data === 'string') return data.length > 500 ? data.slice(0, 500) + '…' : data;
      if (typeof data === 'object') {
        if (data instanceof ArrayBuffer) return `ArrayBuffer(${data.byteLength})`;
        if (ArrayBuffer.isView(data)) return `${data.constructor.name}(${data.byteLength})`;
        if (data instanceof Blob) return `Blob(${data.size},${data.type || 'unknown'})`;
        return JSON.stringify(data);
      }
      return String(data);
    } catch {
      return '[unserializable]';
    }
  }

  (function hookWebSocket() {
    if (window.__unoWsHooked) return;
    const NativeWebSocket = window.WebSocket;
    if (typeof NativeWebSocket !== 'function') return;
    window.__unoWsHooked = true;

    function WrappedWebSocket(url, protocols) {
      const ws = protocols !== undefined ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
      try { window.postMessage({ type: 'UNO_WS_OPEN', url }, '*'); } catch {}

      const origSend = ws.send;
      ws.send = function (...args) {
        try { window.postMessage({ type: 'UNO_WS_SEND', url, data: summarize(args[0]) }, '*'); } catch {}
        return origSend.apply(this, args);
      };

      ws.addEventListener('message', (event) => {
        try { window.postMessage({ type: 'UNO_WS_RECV', url, data: summarize(event.data) }, '*'); } catch {}
      });
      ws.addEventListener('error', () => {
        try { window.postMessage({ type: 'UNO_WS_ERROR', url }, '*'); } catch {}
      });
      ws.addEventListener('close', (event) => {
        try { window.postMessage({ type: 'UNO_WS_CLOSE', url, code: event.code, reason: event.reason }, '*'); } catch {}
      });

      return ws;
    }

    WrappedWebSocket.prototype = NativeWebSocket.prototype;
    try {
      WrappedWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
      WrappedWebSocket.OPEN = NativeWebSocket.OPEN;
      WrappedWebSocket.CLOSING = NativeWebSocket.CLOSING;
      WrappedWebSocket.CLOSED = NativeWebSocket.CLOSED;
    } catch {}
    try { Object.setPrototypeOf(WrappedWebSocket, NativeWebSocket); } catch {}

    window.WebSocket = WrappedWebSocket;
  })();

  function hookBridgeMethods(target, label) {
    if (!target || target.__unoHooked) return;
    const methods = ['post', 'send', 'broadcast'];
    methods.forEach((method) => {
      if (typeof target[method] !== 'function') return;
      const original = target[method];
      target[method] = function (...args) {
        try { window.postMessage({ type: 'UNO_BRIDGE_CALL', source: label, method, args: args.map(summarize) }, '*'); } catch {}
        return original.apply(this, args);
      };
    });
    target.__unoHooked = true;
  }

  (function watchBridge() {
    const attempt = () => {
      hookBridgeMethods(window.singularControlBridge, 'singularControlBridge');
      hookBridgeMethods(window.controlBridge, 'controlBridge');
      hookBridgeMethods(window.singularBridge, 'singularBridge');
      if (!(window.singularControlBridge && window.singularControlBridge.__unoHooked)) {
        setTimeout(attempt, 500);
      }
    };
    attempt();
  })();
})();
