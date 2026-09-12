/** How long a finished score stays on overlay + homepage before sliding off. */
export const SCOREBOARD_HOLD_MS = 5 * 60 * 1000;

/** Must match overlay.html / homepage slide CSS. */
export const SCOREBOARD_SLIDE_MS = 450;

export function isPlaceholderName(value) {
  const raw = String(value || '').trim();
  return !raw || raw === '-' || raw === '\u2014' || raw === '\u2013';
}

export function courtSideName(court, side) {
  const player = court?.[side] || {};
  const full = String(player.full_name || '').trim();
  if (full && !isPlaceholderName(full)) return full;
  const surname = String(player.surname || '').trim();
  if (surname && !isPlaceholderName(surname)) return surname;
  return '';
}

export function courtHasPlayers(court) {
  if (!court || typeof court !== 'object') return false;
  return !!(courtSideName(court, 'A') || courtSideName(court, 'B'));
}

export function courtIdentityKey(court) {
  const norm = (name) => name.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${norm(courtSideName(court, 'A'))}|${norm(courtSideName(court, 'B'))}`;
}

export function parseFinishedAtMs(court) {
  const iso = court?.match_status?.last_completed || court?.match_time?.finished_ts;
  if (iso == null || iso === '') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function cloneCourt(court) {
  if (!court || typeof court !== 'object') return null;
  return JSON.parse(JSON.stringify(court));
}

export function isScoreboardHeld(court, now = Date.now(), holdMs = SCOREBOARD_HOLD_MS) {
  if (!courtHasPlayers(court)) return false;
  if (court.match_status?.active) return true;
  const finishedAt = parseFinishedAtMs(court);
  // Names on court, match not marked finished (line-up waiting to start).
  if (finishedAt == null) return true;
  return (now - finishedAt) < holdMs;
}

export function holdRemainingMs(court, now = Date.now(), holdMs = SCOREBOARD_HOLD_MS) {
  if (!isScoreboardHeld(court, now, holdMs)) return 0;
  if (court.match_status?.active) return null;
  const finishedAt = parseFinishedAtMs(court);
  if (finishedAt == null) return 0;
  return Math.max(0, holdMs - (now - finishedAt));
}

/**
 * Pure visibility step for one board.
 * phase: hidden | visible | exiting | swapping
 */
export function planScoreboardVisibility({
  phase = 'hidden',
  displayedIdentity = '',
  court = null,
  now = Date.now(),
  holdMs = SCOREBOARD_HOLD_MS,
} = {}) {
  if (phase === 'exiting' || phase === 'swapping') {
    return { action: 'hold-exit' };
  }

  const show = isScoreboardHeld(court, now, holdMs);
  const identity = show ? courtIdentityKey(court) : '';

  if ((phase === 'visible' || phase === 'entering') && identity && displayedIdentity && identity !== displayedIdentity) {
    return { action: 'swap', identity };
  }
  if ((phase === 'visible' || phase === 'entering') && !show) {
    return { action: 'exit' };
  }
  if (phase !== 'visible' && phase !== 'entering' && show) {
    return { action: 'enter', identity };
  }
  if ((phase === 'visible' || phase === 'entering') && show) {
    return { action: 'update', identity };
  }
  return { action: 'idle-hidden' };
}

export function reduceHoldSlot(slot, court, now = Date.now(), holdMs = SCOREBOARD_HOLD_MS) {
  const current = slot || { phase: 'hidden', identity: '', frozen: null };
  const plan = planScoreboardVisibility({
    phase: current.phase,
    displayedIdentity: current.identity,
    court,
    now,
    holdMs,
  });

  if (plan.action === 'hold-exit') {
    return { slot: current, effect: 'hold-exit' };
  }
  if (plan.action === 'enter') {
    return {
      slot: { phase: 'visible', identity: plan.identity, frozen: null, lastCourt: cloneCourt(court) },
      effect: 'enter',
    };
  }
  if (plan.action === 'update') {
    return {
      slot: {
        ...current,
        phase: 'visible',
        identity: plan.identity,
        frozen: null,
        lastCourt: cloneCourt(court),
      },
      effect: 'update',
    };
  }
  if (plan.action === 'exit') {
    return {
      slot: {
        phase: 'exiting',
        identity: current.identity,
        frozen: cloneCourt(current.frozen || current.lastCourt || court),
        lastCourt: current.lastCourt || null,
      },
      effect: 'exit',
    };
  }
  if (plan.action === 'swap') {
    return {
      slot: {
        phase: 'swapping',
        identity: current.identity,
        frozen: cloneCourt(current.frozen || current.lastCourt),
        lastCourt: current.lastCourt || null,
        pendingIdentity: plan.identity,
      },
      effect: 'swap',
    };
  }
  return { slot: { phase: 'hidden', identity: '', frozen: null }, effect: 'idle-hidden' };
}
