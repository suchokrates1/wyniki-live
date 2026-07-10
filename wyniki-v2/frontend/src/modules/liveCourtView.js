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
import { formatTemplate as fmt } from '../shared/text.js';

export function createLiveCourtView() {
  return {
    resolveDisplayPoints(court, side) {
      return resolveDisplayPointsForCourt(court, side);
    },

    getCourtIds() {
      return getSortedCourtIds(this.courts);
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

    hasActiveCourts() {
      return Object.values(this.courts).some(c => c.match_status?.active);
    },

    isMatchActive(courtId) {
      return this.courts[courtId]?.match_status?.active || false;
    },

    getPlayerName(courtId, side) {
      const player = this.courts[courtId]?.[side];
      if (player) {
        const full = player.full_name;
        if (full && String(full).trim()) return String(full).trim();
        const surname = player.surname;
        if (surname && surname !== '-') return surname;
      }
      const tr = this.tr();
      return side === 'A' ? tr.players.defaultA : tr.players.defaultB;
    },

    getHeadingAria(courtId) {
      // Tournament name is already announced by the H2 above the courts;
      // don't repeat it on every court heading/region (avoids SR verbosity).
      const courtLabel = this.getCourtDisplayLabel(courtId);
      const nameA = this.getPlayerName(courtId, 'A');
      const nameB = this.getPlayerName(courtId, 'B');
      const vs = this.acc().versus || 'kontra';
      const serve = this.courts[courtId]?.serve;
      const servingText = this.acc().serving || 'serwuje';
      const labelA = serve === 'A' ? `${nameA} (${servingText})` : nameA;
      const labelB = serve === 'B' ? `${nameB} (${servingText})` : nameB;
      return `${courtLabel}: ${labelA} ${vs} ${labelB}`;
    },

    isTiebreak(courtId) {
      return isTiebreakForCourt(this.courts[courtId]);
    },

    getRegularSetWins(courtId) {
      return getRegularSetWinsForCourt(this.courts[courtId]);
    },

    isDecidingSuperTiebreak(courtId) {
      return isDecidingSuperTiebreakForCourt(this.courts[courtId]);
    },

    isSuperTiebreak(courtId) {
      return isSuperTiebreakForCourt(this.courts[courtId]);
    },

    getDisplayPoints(courtId, side) {
      return this.resolveDisplayPoints(this.courts[courtId], side);
    },

    getPointsLabel(courtId) {
      const tr = this.tr();
      const cols = tr.table?.columns || {};
      if (this.isSuperTiebreak(courtId)) return cols.superTieBreak || 'Super TB';
      if (this.isTiebreak(courtId)) return cols.tieBreak || 'Tie Break';
      return cols.points || 'Punkty';
    },

    getSetIndices(courtId) {
      return getSetIndicesForCourt(this.courts[courtId]);
    },

    hasSuperTiebreak(courtId) {
      return hasSuperTiebreakForCourt(this.courts[courtId]);
    },

    getSuperTiebreakScore(courtId) {
      return getSuperTiebreakScoreForCourt(this.courts[courtId]);
    },

    getTiebreakInfo(courtId, setIdx) {
      return getTiebreakInfoForCourt(this.courts[courtId], setIdx);
    },

    getStoredSetScore(court, side, setIdx) {
      return getStoredSetScoreForCourt(court, side, setIdx);
    },

    getSetScore(courtId, side, setIdx) {
      return getSetScoreForCourt(this.courts[courtId], side, setIdx);
    },

    getCurrentSetLabel(courtId) {
      const tr = this.tr();
      const currentSet = this.courts[courtId]?.current_set || 1;
      if (this.isSuperTiebreak(courtId)) {
        return tr.table?.columns?.superTieBreak || tr.superTieBreakLabel || 'Super TB';
      }
      return (tr.footer?.set || 'Set') + ' ' + currentSet;
    },

    getScoreSummary(courtId) {
      const court = this.courts[courtId];
      if (!court) return '';
      const a = this.acc();
      const isTie = this.isTiebreak(courtId);
      const isSuper = this.isSuperTiebreak(courtId);
      const currentSet = parseInt(court.current_set) || 1;

      const serve = court.serve;
      const servingText = a.serving || 'serwuje';
      const servingPart = serve === 'A'
        ? `${this.getPlayerName(courtId, 'A')} ${servingText}`
        : serve === 'B'
          ? `${this.getPlayerName(courtId, 'B')} ${servingText}`
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
      const court = this.courts[courtId];
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
  };
}