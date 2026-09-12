import {
  getRegularSetWins as getRegularSetWinsForCourt,
  getSetIndices as getSetIndicesForCourt,
  getSetScore as getSetScoreForCourt,
  getStoredSetScore as getStoredSetScoreForCourt,
  getSuperTiebreakScore as getSuperTiebreakScoreForCourt,
  getTiebreakInfo as getTiebreakInfoForCourt,
  hasSuperTiebreak as hasSuperTiebreakForCourt,
  isDecidingSuperTiebreak as isDecidingSuperTiebreakForCourt,
  isSuperTiebreak as isSuperTiebreakForCourt,
  isTiebreak as isTiebreakForCourt,
  resolveDisplayPoints as resolveDisplayPointsForCourt,
} from './liveScores.js';
import {
  getCourtDisplayLabel as getLocalizedCourtDisplayLabel,
  getSortedCourtIds,
  localizeCourtLabel as localizeCourtLabelValue,
} from '../shared/courtLabels.js';
import { formatDuration } from '../shared/date.js';
import { calcMatchTime } from '../shared/matchTime.js';
import { formatTemplate as fmt } from '../shared/text.js';
import { formatTeamLabelForWrap, isTeamDisplayName, TEAM_WRAP_BREAK } from '../shared/teamDisplay.js';
import { renderTvScoreboard } from '../shared/tvScoreboard.js';
import {
  SCOREBOARD_SLIDE_MS,
  holdRemainingMs,
  reduceHoldSlot,
} from '../shared/scoreboardHold.js';

export function createLiveCourtView() {
  return {
    serveAnimTick: 0,
    boardSlots: {},
    _exitTimers: {},
    _holdTimer: null,
    _slotsReady: false,

    viewCourt(courtId) {
      const frozen = this.boardSlots?.[courtId]?.frozen;
      if (frozen) return frozen;
      return this.courts[courtId];
    },

    isBoardOff(courtId) {
      const phase = this.boardSlots?.[courtId]?.phase;
      return phase === 'exiting' || phase === 'swapping';
    },

    syncScoreboardSlots(now = Date.now()) {
      const courts = this.courts || {};
      const next = { ...(this.boardSlots || {}) };
      const ids = new Set([...Object.keys(courts), ...Object.keys(next)]);
      for (const courtId of ids) {
        const reduced = reduceHoldSlot(next[courtId], courts[courtId] || null, now);
        if (reduced.effect === 'idle-hidden') {
          delete next[courtId];
          this._clearBoardExit(courtId);
          continue;
        }
        next[courtId] = reduced.slot;
        if (reduced.effect === 'exit' || reduced.effect === 'swap') {
          this._armBoardExit(courtId);
        }
      }
      this.boardSlots = next;
      this._slotsReady = true;
      this._scheduleHoldRefresh(now);
    },

    _clearBoardExit(courtId) {
      const timer = this._exitTimers?.[courtId];
      if (timer) {
        clearTimeout(timer);
        delete this._exitTimers[courtId];
      }
    },

    _armBoardExit(courtId) {
      if (this._exitTimers?.[courtId]) return;
      this._exitTimers = this._exitTimers || {};
      const timer = setTimeout(() => {
        this.completeBoardExit(courtId);
      }, SCOREBOARD_SLIDE_MS);
      timer.unref?.();
      this._exitTimers[courtId] = timer;
    },

    completeBoardExit(courtId) {
      this._clearBoardExit(courtId);
      const slot = this.boardSlots?.[courtId];
      if (!slot) return;
      if (slot.phase === 'swapping') {
        this.boardSlots = {
          ...this.boardSlots,
          [courtId]: {
            phase: 'visible',
            identity: '',
            frozen: null,
            lastCourt: null,
          },
        };
        this.syncScoreboardSlots();
        return;
      }
      const rest = { ...this.boardSlots };
      delete rest[courtId];
      this.boardSlots = rest;
      this.syncScoreboardSlots();
    },

    _scheduleHoldRefresh(now = Date.now()) {
      if (this._holdTimer) {
        clearTimeout(this._holdTimer);
        this._holdTimer = null;
      }
      let soonest = null;
      for (const court of Object.values(this.courts || {})) {
        const remaining = holdRemainingMs(court, now);
        if (remaining == null || remaining <= 0) continue;
        if (soonest == null || remaining < soonest) soonest = remaining;
      }
      if (soonest == null) return;
      this._holdTimer = setTimeout(() => {
        this._holdTimer = null;
        this.syncScoreboardSlots();
      }, soonest + 40);
      this._holdTimer.unref?.();
    },
    resolveDisplayPoints(court, side) {
      return resolveDisplayPointsForCourt(court, side);
    },

    getCourtIds() {
      if (!this._slotsReady && this.courts && Object.keys(this.courts).length) {
        this.syncScoreboardSlots();
      }
      const sorted = getSortedCourtIds(this.courts);
      const extras = Object.keys(this.boardSlots || {}).filter((id) => !sorted.includes(id));
      return [...sorted, ...extras].filter((id) => {
        const slot = this.boardSlots?.[id];
        return slot && slot.phase !== 'hidden';
      });
    },

    getCourtDisplayLabel(courtId) {
      return getLocalizedCourtDisplayLabel(this.courts, courtId, (court) => this.t('courtLabel', { court }));
    },

    localizeCourtLabel(label, forcePrefix = false) {
      return localizeCourtLabelValue(label, {
        forcePrefix,
        formatCourtLabel: (court) => this.t('courtLabel', { court }),
      });
    },

    isMatchActive(courtId) {
      return this.courts[courtId]?.match_status?.active || false;
    },

    getPlayerName(courtId, side) {
      const player = this.viewCourt(courtId)?.[side];
      let name = '';
      if (player) {
        const full = player.full_name;
        if (full && String(full).trim()) name = String(full).trim();
        else {
          const surname = player.surname;
          if (surname && surname !== '-') name = surname;
        }
      }
      if (!name) {
        const tr = this.tr();
        name = side === 'A' ? tr.players.defaultA : tr.players.defaultB;
      }
      return formatTeamLabelForWrap(name);
    },

    getSpokenPlayerName(courtId, side) {
      return String(this.getPlayerName(courtId, side) || '').replaceAll(TEAM_WRAP_BREAK, '');
    },

    isTeamDisplayName(value) {
      return isTeamDisplayName(value);
    },

    playerHasFlag(courtId, side) {
      const player = this.viewCourt(courtId)?.[side];
      return !!(player?.flag_url || player?.flag_code);
    },

    playerHasPartnerFlag(courtId, side) {
      const player = this.viewCourt(courtId)?.[side];
      if (!player) return false;
      const partnerCode = String(player.flag_code_partner || '').toUpperCase();
      if (!/^[A-Z]{2}$/.test(partnerCode)) return false;
      const primary = String(player.flag_code || '').toUpperCase();
      return partnerCode !== primary;
    },

    playerFlagStyle(courtId, side, partner = false) {
      const player = this.viewCourt(courtId)?.[side] || {};
      const url = partner
        ? (player.flag_url_partner || this.codeToFlag(player.flag_code_partner))
        : (player.flag_url || this.codeToFlag(player.flag_code));
      return url ? { backgroundImage: `url(${url})` } : {};
    },

    getHeadingAria(courtId) {
      // Tournament name is already announced by the H2 above the courts.
      // VoiceOver heading/region swipe lands here, so include the same
      // spoken score line that getScoreSummary() builds for .score-summary.
      const courtLabel = this.getCourtDisplayLabel(courtId);
      const nameA = this.getSpokenPlayerName(courtId, 'A');
      const nameB = this.getSpokenPlayerName(courtId, 'B');
      const vs = this.acc().versus || 'kontra';
      const names = `${courtLabel}: ${nameA} ${vs} ${nameB}`;
      const score = this.getScoreSummary(courtId);
      return score ? `${names}. ${score}` : names;
    },

    isTiebreak(courtId) {
      return isTiebreakForCourt(this.viewCourt(courtId));
    },

    getRegularSetWins(courtId) {
      return getRegularSetWinsForCourt(this.viewCourt(courtId));
    },

    isDecidingSuperTiebreak(courtId) {
      return isDecidingSuperTiebreakForCourt(this.viewCourt(courtId));
    },

    isSuperTiebreak(courtId) {
      return isSuperTiebreakForCourt(this.viewCourt(courtId));
    },

    getDisplayPoints(courtId, side) {
      return this.resolveDisplayPoints(this.viewCourt(courtId), side);
    },

    getPointsLabel(courtId) {
      const tr = this.tr();
      const cols = tr.table?.columns || {};
      if (this.isSuperTiebreak(courtId)) return cols.superTieBreak || 'Super TB';
      if (this.isTiebreak(courtId)) return cols.tieBreak || 'Tie Break';
      return cols.points || 'Punkty';
    },

    getSetIndices(courtId) {
      return getSetIndicesForCourt(this.viewCourt(courtId));
    },

    hasSuperTiebreak(courtId) {
      return hasSuperTiebreakForCourt(this.viewCourt(courtId));
    },

    getSuperTiebreakScore(courtId) {
      return getSuperTiebreakScoreForCourt(this.viewCourt(courtId));
    },

    getTiebreakInfo(courtId, setIdx) {
      return getTiebreakInfoForCourt(this.viewCourt(courtId), setIdx);
    },

    getStoredSetScore(court, side, setIdx) {
      return getStoredSetScoreForCourt(court, side, setIdx);
    },

    getSetScore(courtId, side, setIdx) {
      return getSetScoreForCourt(this.viewCourt(courtId), side, setIdx);
    },

    getCurrentSetLabel(courtId) {
      const tr = this.tr();
      const currentSet = this.viewCourt(courtId)?.current_set || 1;
      if (this.isSuperTiebreak(courtId)) {
        return tr.table?.columns?.superTieBreak || tr.superTieBreakLabel || 'Super TB';
      }
      return (tr.footer?.set || 'Set') + ' ' + currentSet;
    },

    getScoreSummary(courtId) {
      const court = this.viewCourt(courtId);
      if (!court) return '';
      const a = this.acc();
      const isTie = this.isTiebreak(courtId);
      const isSuper = this.isSuperTiebreak(courtId);
      const currentSet = parseInt(court.current_set) || 1;

      const serve = court.serve;
      const servingText = a.serving || 'serwuje';
      const servingPart = serve === 'A'
        ? `${this.getSpokenPlayerName(courtId, 'A')} ${servingText}`
        : serve === 'B'
          ? `${this.getSpokenPlayerName(courtId, 'B')} ${servingText}`
          : null;

      const pointsLabel = isTie
        ? (isSuper ? (a.superTieBreak || 'super tie-break') : (a.tieBreak || 'tie-break'))
        : (a.points || 'punkty');

      const ptsA = this.getDisplayPoints(courtId, 'A');
      const ptsB = this.getDisplayPoints(courtId, 'B');

      const parts = [];
      if (servingPart) parts.push(servingPart);
      parts.push(`${pointsLabel} ${this.spokenScore(ptsA, ptsB)}`);

      const setIndices = this.getSetIndices(courtId);
      setIndices.forEach(idx => {
        const sA = this.getSetScore(courtId, 'A', idx);
        const sB = this.getSetScore(courtId, 'B', idx);
        const numA = parseInt(sA) || 0;
        const numB = parseInt(sB) || 0;
        const include = idx === 1 || currentSet >= idx || numA > 0 || numB > 0;
        if (!include) return;

        const setLabel = isSuper && idx === currentSet
          ? (a.superTieBreak || 'super tie-break')
          : fmt(a.set || 'Set {number}', { number: idx });
        const isActive = currentSet === idx;
        const segment = isActive
          ? `${setLabel}, ${a.active || 'aktywny'}, ${this.spokenScore(sA, sB)}`
          : `${setLabel}, ${this.spokenScore(sA, sB)}`;
        parts.push(segment);
      });

      return parts.join('. ').trim();
    },

    getScore(courtId, player) {
      const court = this.viewCourt(courtId);
      if (!court) return { sets: [], points: '-' };
      const playerData = court[player];
      if (!playerData) return { sets: [], points: '-' };
      return {
        sets: playerData.sets || [],
        points: playerData.points || '0'
      };
    },

    formatTime(seconds) {
      return formatDuration(seconds);
    },

    courtMatchClock(courtId) {
      return calcMatchTime(this.viewCourt(courtId));
    },

    renderLiveTvScoreboard(courtId) {
      // Decorative only — homepage keeps the spoken heading + .score-summary live region.
      // `lang` is passed from the template so Alpine rebuilds the header word (Kort/Court/Platz/Kortas).
      const court = this.viewCourt(courtId) || {};
      return renderTvScoreboard({
        courtId,
        court: {
          ...court,
          A: { ...(court.A || {}), full_name: this.getSpokenPlayerName(courtId, 'A') },
          B: { ...(court.B || {}), full_name: this.getSpokenPlayerName(courtId, 'B') },
        },
        courtName: this.getCourtDisplayLabel(courtId),
        look: { flags: true, clock: true, phase: true, scale: 1, anim_speed: 1, anim_set: true },
        onAnimTick: () => { this.serveAnimTick += 1; },
      });
    },
  };
}