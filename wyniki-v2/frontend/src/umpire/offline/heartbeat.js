export const HEARTBEAT_INTERVAL_MS = 120_000;
export const APP_VERSION = '2.0.0';

export function heartbeatBody({
  courtId = '',
  screen = '',
  matchId = null,
  clientMatchUuid = null,
  nowMs = Date.now(),
  appVersion = APP_VERSION,
} = {}) {
  const body = {
    court_id: courtId || '',
    screen,
    app_version: appVersion,
    timestamp: String(nowMs),
  };
  if (matchId != null) body.match_id = String(matchId);
  if (clientMatchUuid) body.client_match_uuid = clientMatchUuid;
  return body;
}

export function createHeartbeat({
  send,
  getBody,
  intervalMs = HEARTBEAT_INTERVAL_MS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  let timer = null;

  async function sendNow() {
    try {
      return await send(getBody());
    } catch {
      return null;
    }
  }

  return {
    start() {
      if (timer != null) return;
      sendNow();
      timer = setIntervalFn(sendNow, intervalMs);
    },
    stop() {
      if (timer != null) clearIntervalFn(timer);
      timer = null;
    },
    sendNow,
  };
}
