import { publicApi } from '../api/publicApi.js';
import { formatTemplate as fmt } from '../shared/text.js';
import {
  buildBracketCategories,
  compareBracketCategoryNames as compareBracketCategoryNamesData,
  getBracketCategoryLabel,
  getGroupStandingsRows,
  getKnockoutPhaseClass,
  getKnockoutPodiumEntries,
  isFinalPhase as isFinalBracketPhase,
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

    knockoutPodiumEntries(knockout = []) {
      return getKnockoutPodiumEntries(knockout);
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
        winnerName: this.resolveBracketName(match?.winner),
        scoreText: this.describeBracketSetsForSpeech(match?.sets || []),
      });
    },

    knockoutMatchAria(slot, phase, index = 0) {
      const phaseName = this.translateCategory(phase || (this.tr().bracket?.knockoutTitle || 'Faza pucharowa'));
      const intro = fmt(this.acc().stageMatch || '{phase}, mecz {number}', {
        phase: phaseName,
        number: index + 1,
      });
      return this.buildCompletedMatchAria({
        intro: [intro],
        playerA: this.resolveBracketName(slot?.player1),
        playerB: this.resolveBracketName(slot?.player2),
        winnerName: this.resolveBracketName(slot?.winner),
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
      return this.bracketNameMap[surname] || surname;
    },

    translatePhase(phase) {
      if (!phase) return '';
      const t = this.tr();
      const map = {
        'Grupowa': t.history?.phaseGroup || 'Group',
        'Pucharowa': t.history?.phaseKnockout || 'Knockout',
        'Faza grupowa': t.playerProfile?.groupPhase || t.history?.phaseGroup || 'Group phase',
        'Faza pucharowa': t.playerProfile?.knockoutPhase || t.history?.phaseKnockout || 'Knockout phase',
      };
      return this.translateCategory(map[phase] || phase);
    },

    translateCategory(name) {
      if (!name) return '';
      const t = this.tr();
      const women = t.history?.catWomen || 'Women';
      const men = t.history?.catMen || 'Men';
      const semifinal = t.bracket?.semifinal || 'Semifinal';
      const final_ = t.bracket?.finalLabel || 'Final';
      const placeMatch = t.bracket?.placeMatch || '{forPlace} {number}. {place}';
      const forPlace = t.bracket?.forPlace || 'for';
      const place = t.playerProfile?.place || 'place';
      return name
        .replace(/Kobiety/g, women)
        .replace(/Mężczyźni/g, men)
        .replace(/Półfinał/g, semifinal)
        .replace(/Finał/g, final_)
        .replace(/o (\d+)\. miejsce/g, (_, number) => fmt(placeMatch, { number, forPlace, place }));
    },

    bracketCategoryLabel(name) {
      const t = this.tr();
      return getBracketCategoryLabel(name, {
        translateCategory: (value) => this.translateCategory(value),
        womenLabel: t.history?.catWomen || 'Women',
        menLabel: t.history?.catMen || 'Men',
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
            if (playerName && playerName.includes(' ')) {
              const parts = playerName.trim().split(/\s+/);
              const surname = parts[parts.length - 1];
              this.bracketNameMap[surname] = playerName;
            }
          }
        }
      }
      if (data.knockout) {
        for (const slots of Object.values(data.knockout)) {
          for (const slot of (Array.isArray(slots) ? slots : [])) {
            for (const playerName of [slot.player1, slot.player2, slot.winner]) {
              if (playerName && playerName.includes(' ')) {
                const parts = playerName.trim().split(/\s+/);
                const surname = parts[parts.length - 1];
                this.bracketNameMap[surname] = playerName;
              }
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