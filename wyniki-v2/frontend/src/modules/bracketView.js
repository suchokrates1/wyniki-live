import { publicApi } from '../api/publicApi.js';
import { formatTemplate as fmt } from '../shared/text.js';
import { translateStoredScheduleLabel } from '../shared/labelDisplay.js';
import { formatTeamLabelForWrap, isTeamDisplayName, registerCompetitorName } from '../shared/teamDisplay.js';
import { isPendingCompetitorName } from '../shared/labelDisplay.js';
import {
  buildBracketCategories,
  compareBracketCategoryNames as compareBracketCategoryNamesData,
  getBracketCategoryLabel,
  getCategoryFormatFacts,
  matchBracketCategoryName,
  resolveActiveBracketCategory,
} from './bracket.js';

export function createBracketView() {
  return {
    bracketData: null,
    bracketLoading: false,
    bracketNameMap: {},
    bracketCategory: null,

    categoryFormatText(category = {}) {
      const facts = getCategoryFormatFacts(category);
      const b = this.tr().bracket || {};
      const body = facts.kind === 'round_robin'
        ? (b.formatRoundRobin || '')
        : facts.kind === 'knockout'
          ? (b.formatKnockout || '')
          : fmt(b.formatGroupsKnockout || '', { count: facts.qualifiers || 2 });
      const extra = facts.hasPlaces ? (b.formatPlaces || '') : '';
      return [body, extra].filter(Boolean).join(' ');
    },

    historyCategoryAria(match) {
      return fmt(this.tr().history?.openCategory || 'Pokaż kategorię {category} na drabince', {
        category: this.bracketCategoryLabel(match?.category),
      });
    },

    openHistoryCategory(match) {
      const raw = match?.category;
      if (!raw) return;
      if (this.selectedTournamentId) {
        const name = matchBracketCategoryName(this.tournamentBracketCategories(), raw);
        this.historySubTab = 'bracket';
        this.tournamentBracketCategory = name;
        this._pendingTournamentCategory = name;
        this.fetchTournamentBracket(this.selectedTournamentId);
        this._updateHash();
        return;
      }
      this.switchToBracket(matchBracketCategoryName(this.bracketCategories(), raw));
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
      if (cat) {
        this.bracketCategory = cat;
        this._pendingCategory = cat;
      }
      this.fetchBracket();
      this._updateHash();
    },

    resolveBracketName(surname) {
      if (!surname) return '';
      if (isPendingCompetitorName(surname)) return this.translateStoredLabel(surname);
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
        quarterfinal: t.bracket?.quarterfinal,
        roundOf: t.bracket?.roundOf,
        placesRange: t.bracket?.placesRange,
        consolation: t.bracket?.consolation,
        winnerOf: t.bracket?.winnerOf,
        loserOf: t.bracket?.loserOf,
        group: t.history?.phaseGroup || t.playerProfile?.groupPhase || 'Group stage',
        groupRematch: t.history?.phaseGroupRematch || 'Group stage — rematch',
        knockout: t.history?.phaseKnockout || t.playerProfile?.knockoutPhase || 'Knockout stage',
        groupSuffixLetter: t.playerProfile?.group
          ? `${t.playerProfile.group} {letter}`
          : 'Group {letter}',
      });
    },

    /** Category name without the group suffix, in the page language ("B1 Mężczyźni" → "B1 Men"). */
    bracketCategoryLabel(name) {
      return this.translateStoredLabel(getBracketCategoryLabel(name));
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