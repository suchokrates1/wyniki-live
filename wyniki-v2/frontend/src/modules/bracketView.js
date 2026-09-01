import { publicApi } from '../api/publicApi.js';
import { formatTemplate as fmt } from '../shared/text.js';
import { translateStoredScheduleLabel } from '../shared/labelDisplay.js';
import { formatTeamLabelForWrap, isTeamDisplayName, registerCompetitorName } from '../shared/teamDisplay.js';
import {
  buildBracketCategories,
  buildKnockoutTrees,
  compareBracketCategoryNames as compareBracketCategoryNamesData,
  getBracketCategoryLabel,
  getGroupStandingsRows,
  getKnockoutPhaseClass,
  getCategoryPodiumEntries,
  getKnockoutPodiumEntries,
  groupMatchWinner,
  isFinalPhase as isFinalBracketPhase,
  knockoutSlotWinner,
  resolveActiveBracketCategory,
} from './bracket.js';

export function createBracketView() {
  return {
    bracketData: null,
    bracketLoading: false,
    bracketNameMap: {},
    bracketCategory: null,

    padSets(sets) {
      const arr = sets || [];
      const padded = arr.map(s => ({ ...s, played: true }));
      while (padded.length < 3) padded.push({ g1: 0, g2: 0, tb: null, stb: false, played: false });
      return padded;
    },

    tableLegendItems() {
      const b = this.tr().bracket || {};
      return [
        { term: b.wins || 'W', description: b.legendWins || 'wygrane mecze' },
        { term: b.losses || 'L', description: b.legendLosses || 'przegrane mecze' },
        { term: b.setsHeader || 'Sety', description: b.legendSets || 'sety wygrane do przegranych' },
        { term: b.gamesHeader || 'Gemy', description: b.legendGames || 'gemy wygrane do przegranych' },
      ];
    },

    groupStandingsRows(group, siblingGroups = []) {
      return getGroupStandingsRows(group, siblingGroups);
    },

    groupShowsStandingsTable(group) {
      return String(group?.play_format || 'groups_knockout') !== 'knockout';
    },

    categoryShowsStandingsTables(category) {
      return (category?.groups || []).some((group) => this.groupShowsStandingsTable(group));
    },

    knockoutPodiumEntries(knockout = []) {
      return getKnockoutPodiumEntries(knockout);
    },

    categoryPodiumEntries(category = {}) {
      return getCategoryPodiumEntries(category);
    },

    standingsRowQualifies(row, rowIndex, group, category) {
      if (row?._placeholder) return false;
      if (rowIndex >= 2) return false;
      if ((group?.standings || []).length <= 2) return false;
      return (category?.knockout || []).length > 0;
    },

    knockoutTrees(knockout = []) {
      return buildKnockoutTrees(knockout);
    },

    knockoutSlotWinner(slot) {
      return knockoutSlotWinner(slot);
    },

    groupMatchWinner(match) {
      return groupMatchWinner(match);
    },

    isFinalPhase(phase) {
      return isFinalBracketPhase(phase);
    },

    knockoutPhaseClass(phase) {
      return getKnockoutPhaseClass(phase);
    },

    formatKnockoutScore(slot) {
      return this.describeBracketSetsForSpeech(slot?.sets || []);
    },

    bracketGroupTableAriaLabel(groupName) {
      return fmt(this.tr().bracket?.groupTableLabel || 'Tabela grupy {group}', {
        group: groupName || '—',
      });
    },

    bracketCompetitorColumnLabel(group) {
      const names = [
        ...(group?.standings || []).map((row) => row?.name),
        ...(group?.players || []).map((player) => player?.name || player),
      ];
      const bracket = this.tr().bracket || {};
      if (names.some((name) => isTeamDisplayName(name))) {
        return bracket.pair || 'Para';
      }
      return bracket.player || 'Zawodnik';
    },

    bracketTreeAriaLabel(categoryName) {
      return fmt(this.tr().bracket?.treeLabel || 'Drabinka {category}', {
        category: this.bracketCategoryLabel(categoryName) || categoryName || '—',
      });
    },

    groupMatchAria(match, groupName, index = 0) {
      const intro = fmt(this.acc().groupMatch || '{group}, mecz {number}', {
        group: this.translateCategory(groupName || '') || groupName || '—',
        number: index + 1,
      });
      return this.buildCompletedMatchAria({
        intro: [intro],
        playerA: this.resolveBracketName(match?.player_a),
        playerB: this.resolveBracketName(match?.player_b),
        winnerName: this.resolveBracketName(this.groupMatchWinner(match)),
        scoreText: this.describeBracketSetsForSpeech(match?.sets || []),
      });
    },

    knockoutMatchAria(slot, phase, index = 0) {
      const phaseName = this.translatePhase(
        phase || 'Pucharowa',
      ) || (this.tr().history?.phaseKnockout || 'Faza pucharowa');
      const intro = fmt(this.acc().stageMatch || '{phase}, mecz {number}', {
        phase: phaseName,
        number: index + 1,
      });
      return this.buildCompletedMatchAria({
        intro: [intro],
        playerA: this.resolveBracketName(slot?.player1),
        playerB: this.resolveBracketName(slot?.player2),
        winnerName: this.resolveBracketName(this.knockoutSlotWinner(slot)),
        scoreText: this.formatKnockoutScore(slot),
      });
    },

    async fetchBracket() {
      this.bracketLoading = true;
      try {
        this.bracketData = await publicApi.getActiveBracket();
        if (!this.bracketData) {
          this.bracketData = null;
          return;
        }
        this._buildBracketNameMap(this.bracketData);
        const cats = this.bracketCategories();
        if (this._pendingCategory && cats.find(c => c.name === this._pendingCategory)) {
          this.bracketCategory = this._pendingCategory;
          this._pendingCategory = null;
        } else if (cats.length > 0 && !cats.find(c => c.name === this.bracketCategory)) {
          this.bracketCategory = cats[0].name;
        }
      } catch {
        this.bracketData = null;
      } finally {
        this.bracketLoading = false;
      }
    },

    switchToBracket(cat) {
      this.activeTab = 'live';
      this.liveSubTab = 'bracket';
      if (cat) this.bracketCategory = cat;
      this.fetchBracket();
      this._updateHash();
    },

    resolveBracketName(surname) {
      if (!surname) return '';
      return formatTeamLabelForWrap(this.bracketNameMap[surname] || surname);
    },

    translatePhase(phase) {
      return this.translateStoredLabel(phase);
    },

    translateCategory(name) {
      return this.translateStoredLabel(name);
    },

    /** Shared public/office dictionary for DB phase & category labels. */
    translateStoredLabel(name) {
      if (!name) return '';
      const t = this.tr();
      return translateStoredScheduleLabel(name, {
        women: t.history?.catWomen || 'Women',
        men: t.history?.catMen || 'Men',
        mixed: t.history?.catMixed || 'Mixed',
        doubles: t.bracket?.doubles || t.history?.catDoubles || 'Doubles',
        semifinal: t.bracket?.semifinal || 'Semifinal',
        final: t.bracket?.finalLabel || 'Final',
        placeFor: t.bracket?.placeMatch || 'o {number}. miejsce',
        group: t.history?.phaseGroup || t.playerProfile?.groupPhase || 'Group stage',
        groupRematch: t.history?.phaseGroupRematch || 'Group stage — rematch',
        knockout: t.history?.phaseKnockout || t.playerProfile?.knockoutPhase || 'Knockout stage',
        groupSuffixLetter: t.playerProfile?.group
          ? `${t.playerProfile.group} {letter}`
          : 'Group {letter}',
      });
    },

    bracketCategoryLabel(name) {
      const t = this.tr();
      return getBracketCategoryLabel(name, {
        translateCategory: (value) => this.translateCategory(value),
        womenLabel: t.history?.catWomen || 'Women',
        menLabel: t.history?.catMen || 'Men',
        mixedLabel: t.history?.catMixed || 'Mixed',
        doublesLabel: t.bracket?.doubles || t.history?.catDoubles || 'Doubles',
      });
    },

    compareBracketCategoryNames(leftName, rightName) {
      return compareBracketCategoryNamesData(leftName, rightName, {
        getCategoryLabel: (name) => this.bracketCategoryLabel(name),
        lang: this.lang || 'pl',
      });
    },

    _buildBracketNameMap(data) {
      if (!data) return;
      for (const group of (data.groups || [])) {
        for (const match of (group.matches || [])) {
          for (const playerName of [match.player_a, match.player_b]) {
            registerCompetitorName(this.bracketNameMap, playerName);
          }
        }
      }
      if (data.knockout) {
        for (const slots of Object.values(data.knockout)) {
          for (const slot of (Array.isArray(slots) ? slots : [])) {
            for (const playerName of [slot.player1, slot.player2, slot.winner]) {
              registerCompetitorName(this.bracketNameMap, playerName);
            }
          }
        }
      }
    },

    bracketCategories() {
      return buildBracketCategories(this.bracketData, {
        compareCategoryNames: (left, right) => this.compareBracketCategoryNames(left.name, right.name),
      });
    },

    activeBracketCategory() {
      const cats = this.bracketCategories();
      const resolved = resolveActiveBracketCategory(cats, this.bracketCategory);
      this.bracketCategory = resolved.selectedName;
      return resolved.category;
    },

    tournamentBracketCategories() {
      return buildBracketCategories(this.tournamentBracket, {
        compareCategoryNames: (left, right) => this.compareBracketCategoryNames(left.name, right.name),
      });
    },

    activeTournamentBracketCategory() {
      const cats = this.tournamentBracketCategories();
      const resolved = resolveActiveBracketCategory(cats, this.tournamentBracketCategory);
      this.tournamentBracketCategory = resolved.selectedName;
      return resolved.category;
    },
  };
}