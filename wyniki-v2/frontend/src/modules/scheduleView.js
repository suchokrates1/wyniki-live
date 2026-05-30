import { publicApi } from '../api/publicApi.js';
import { TRANSLATIONS } from '../i18n/translations.js';
import {
  buildScheduleGroups,
  compareScheduleMatches as compareScheduleMatchesData,
  flattenScheduleDay,
  formatScheduleArchivedDaysLabel,
  formatScheduleDate as formatScheduleDateValue,
  formatScheduleTime as formatScheduleTimeValue,
  getScheduleCategoryLabel,
  getScheduleCurrentDate,
  getScheduleCourtTabLabel,
  getScheduleDayBucket,
  getScheduleDays,
  getScheduleDomId,
  getScheduleGroupMeta,
  getScheduleMatchCount,
  getSchedulePastDays,
  getSchedulePreparedDays,
  getSchedulePrimaryDays,
  getScheduleSelectionKey,
  getScheduleStatusLabel,
  normalizeScheduleText,
  scheduleMatchMatchesQuery as doesScheduleMatchMatchQuery,
} from './schedule.js';

export function createScheduleView() {
  return {
    scheduleData: null,
    scheduleLoading: false,
    scheduleAnnouncement: '',
    scheduleSearch: '',
    scheduleSortMode: 'court',
    scheduleSelectedGroups: {},

    async fetchSchedule() {
      this.scheduleLoading = true;
      try {
        this.scheduleData = await publicApi.getActiveSchedule();
        if (!this.scheduleData) {
          this.scheduleData = null;
          return;
        }
        const matchCount = this.scheduleMatchCount(this.scheduleData);
        this.scheduleAnnouncement = `${this.scheduleText().updated}: ${matchCount}`;
      } catch {
        this.scheduleData = null;
      } finally {
        this.scheduleLoading = false;
      }
    },

    scheduleText() {
      const fallback = TRANSLATIONS.pl.schedule || {};
      return { ...fallback, ...(this.tr().schedule || {}) };
    },

    scheduleModuleOptions() {
      return {
        sortMode: this.scheduleSortMode,
        search: this.scheduleSearch,
        lang: this.lang || 'pl',
        labels: this.scheduleText(),
        courtLabelPattern: this.tr().courtLabel || 'Kort {court}',
        courtLabel: (match) => this.scheduleCourtLabel(match),
        resolveName: (name) => this.resolveBracketName(name),
        translateCategory: (name) => this.translateCategory(name),
      };
    },

    scheduleDays(data = this.scheduleData) {
      return getScheduleDays(data);
    },

    scheduleMatchCount(data = this.scheduleData) {
      return getScheduleMatchCount(data);
    },

    scheduleVisibleDays(data = this.scheduleData) {
      return this.schedulePreparedDays(data);
    },

    schedulePreparedDays(data = this.scheduleData) {
      return getSchedulePreparedDays(data, {
        buildGroups: (day) => this.scheduleGroups(day),
        currentDate: this.scheduleCurrentDate(),
      });
    },

    scheduleCurrentDate() {
      return getScheduleCurrentDate();
    },

    scheduleDayBucket(day) {
      return getScheduleDayBucket(day, this.scheduleCurrentDate());
    },

    schedulePrimaryDays(data = this.scheduleData) {
      return getSchedulePrimaryDays(this.schedulePreparedDays(data));
    },

    schedulePastDays(data = this.scheduleData) {
      return getSchedulePastDays(this.schedulePreparedDays(data));
    },

    scheduleArchivedDaysLabel(count) {
      return formatScheduleArchivedDaysLabel(count, {
        custom: this.tr().schedule?.archivedDaysLabel,
        lang: this.lang,
      });
    },

    scheduleGroups(day) {
      return buildScheduleGroups(day, this.scheduleModuleOptions());
    },

    scheduleSelectionKey(day) {
      return getScheduleSelectionKey(day, this.scheduleSortMode);
    },

    scheduleActiveGroup(day) {
      const groups = Array.isArray(day?.groups) ? day.groups : [];
      if (!groups.length) return null;
      const key = this.scheduleSelectionKey(day);
      const selectedId = this.scheduleSelectedGroups[key];
      return groups.find((group) => group.id === selectedId) || groups[0];
    },

    scheduleActiveGroupId(day) {
      return this.scheduleActiveGroup(day)?.id || '';
    },

    selectScheduleGroup(day, groupId) {
      if (!day || !groupId) return;
      this.scheduleSelectedGroups = {
        ...this.scheduleSelectedGroups,
        [this.scheduleSelectionKey(day)]: groupId,
      };
    },

    scheduleTablistLabel() {
      return this.scheduleSortMode === 'category'
        ? this.scheduleText().tabsLabelCategory
        : this.scheduleText().tabsLabelCourt;
    },

    scheduleDomId(prefix, day, group) {
      return getScheduleDomId(prefix, day, group);
    },

    focusScheduleGroupTab(day, group) {
      if (!day || !group) return;
      requestAnimationFrame(() => {
        document.getElementById(this.scheduleDomId('schedule-tab', day, group))?.focus();
      });
    },

    focusScheduleAdjacentGroup(day, currentGroupId, direction) {
      const groups = Array.isArray(day?.groups) ? day.groups : [];
      if (!groups.length) return;
      let index = groups.findIndex((group) => group.id === currentGroupId);
      if (index < 0) index = 0;
      const nextIndex = (index + direction + groups.length) % groups.length;
      const nextGroup = groups[nextIndex];
      this.selectScheduleGroup(day, nextGroup.id);
      this.focusScheduleGroupTab(day, nextGroup);
    },

    focusScheduleEdgeGroup(day, edge) {
      const groups = Array.isArray(day?.groups) ? day.groups : [];
      if (!groups.length) return;
      const target = edge === 'last' ? groups[groups.length - 1] : groups[0];
      this.selectScheduleGroup(day, target.id);
      this.focusScheduleGroupTab(day, target);
    },

    scheduleFlattenDay(day) {
      return flattenScheduleDay(day);
    },

    scheduleGroupMeta(match, mode) {
      return getScheduleGroupMeta(match, mode, this.scheduleModuleOptions());
    },

    scheduleCourtTabLabel(match) {
      return getScheduleCourtTabLabel(match, this.scheduleModuleOptions());
    },

    scheduleCategoryLabel(match) {
      return getScheduleCategoryLabel(match, this.scheduleModuleOptions());
    },

    normalizeScheduleText(value) {
      return normalizeScheduleText(value);
    },

    scheduleMatchMatchesQuery(match, query) {
      return doesScheduleMatchMatchQuery(match, query, this.scheduleModuleOptions());
    },

    compareScheduleMatches(left, right) {
      return compareScheduleMatchesData(left, right, {
        courtLabel: (match) => this.scheduleCourtLabel(match),
        lang: this.lang || 'pl',
      });
    },

    formatScheduleDate(value) {
      return formatScheduleDateValue(value, this.lang || 'pl');
    },

    formatScheduleTime(value) {
      return formatScheduleTimeValue(value, this.scheduleText());
    },

    scheduleCourtLabel(match) {
      if (match?.court_label) return this.localizeCourtLabel(match.court_label);
      if (match?.court_id && this.courts?.[match.court_id]) return this.getCourtDisplayLabel(match.court_id);
      if (match?.court_id) return this.localizeCourtLabel(match.court_id);
      return this.scheduleText().courtTbd;
    },

    scheduleStatusLabel(status) {
      return getScheduleStatusLabel(status, this.scheduleText());
    },

    scheduleMatchHasResult(match) {
      return !!(match?.has_result || match?.score_text || (match?.status === 'completed' && match?.winner_name));
    },

    scheduleMatchScore(match) {
      if (!match) return '';
      if (match.result_note) return match.result_note;
      return match.score_text || '';
    },

    scheduleMatchWinnerName(match) {
      const winner = match?.winner_name;
      if (!winner) return '';
      return this.resolveBracketName(winner) || winner;
    },

    scheduleStatusDisplay(match) {
      if (this.scheduleMatchHasResult(match)) {
        const score = this.scheduleMatchScore(match);
        if (score) return score;
      }
      return this.scheduleStatusLabel(match?.status);
    },

    scheduleParticipantName(name) {
      return this.resolveBracketName(name) || name || this.acc().unknownPlayer || 'zawodnik nieustalony';
    },

    scheduleMatchupLabel(match) {
      return `${this.scheduleParticipantName(match?.player1_name)} ${this.acc().versus || 'kontra'} ${this.scheduleParticipantName(match?.player2_name)}`;
    },

    scheduleMatchAria(match) {
      const labels = this.scheduleText();
      const timeLabel = this.formatScheduleTime(match?.scheduled_time);
      return [
        `${labels.match}: ${this.scheduleMatchupLabel(match)}`,
        this.scheduleCourtLabel(match),
        `${labels.time}: ${timeLabel}`,
        `${labels.category}: ${this.scheduleCategoryLabel(match)}`,
        `${labels.phase}: ${this.translatePhase(match?.phase || '')}`,
        match?.notes_public ? `${labels.notes}: ${match.notes_public}` : '',
        `${labels.status}: ${this.scheduleStatusLabel(match?.status)}`,
      ].filter(Boolean).join('. ');
    },
  };
}