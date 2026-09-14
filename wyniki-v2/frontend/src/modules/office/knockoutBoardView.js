/**
 * "Faza pucharowa": one card per category on top, the category's draw below, rounds from left
 * to right (main draw, placement matches, consolation). Names fill in as results come.
 */
import { buildBracketCategories, buildKnockoutTrees, getKnockoutRoundKind } from '../bracket.js';

function phaseSuffix(phase) {
  const text = String(phase || '');
  const sep = text.indexOf(' — ');
  return sep > -1 ? text.slice(sep + 3) : text;
}

export function createOfficeKnockoutBoardView() {
  return {
    officeKnockoutCategoryName: '',

    /** Categories with their draws, built from the knockout slots of the dashboard. */
    officeKnockoutCategories() {
      const byPhase = {};
      for (const slot of this.officeKnockoutMatches || []) {
        const phase = String(slot.phase || '');
        (byPhase[phase] ||= []).push(slot);
      }
      for (const slots of Object.values(byPhase)) slots.sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
      return buildBracketCategories({ groups: [], knockout: byPhase }).map((category) => {
        const slots = category.knockout.flatMap((round) => round.slots);
        return {
          name: category.name,
          label: this.officeDisplayLabel(category.name),
          trees: buildKnockoutTrees(category.knockout),
          total: slots.length,
          finished: slots.filter((slot) => slot.winner_name).length,
          ready: slots.filter((slot) => slot.ready && !slot.winner_name).length,
        };
      });
    },

    officeKnockoutActiveCategory() {
      const categories = this.officeKnockoutCategories();
      return categories.find((category) => category.name === this.officeKnockoutCategoryName)
        || categories.find((category) => category.ready > 0)
        || categories[0]
        || null;
    },

    selectOfficeKnockoutCategory(category) {
      this.officeKnockoutCategoryName = category?.name || '';
      this.cancelOfficeKnockoutSwap?.();
    },

    officeKnockoutTreeTitle(tree) {
      const phases = [...tree.rounds, ...tree.placement].map((round) => String(round.phase || '').toLowerCase());
      if (phases.some((phase) => phase.includes('pocieszenie') || phase.includes('consolation'))) return this.ot('knockout.treeConsolation');
      if (tree.family === 0) return this.ot('knockout.treeMain');
      return this.ot('knockout.treePlaces');
    },

    officeKnockoutRoundLabel(phase) {
      return this.officeDisplayLabel(phaseSuffix(phase)) || this.ot('knockout.defaultPhase');
    },

    officeKnockoutIsFinal(phase) {
      return getKnockoutRoundKind(phase) === 'final';
    },

    officeKnockoutSlotWhen(slot) {
      const parts = [];
      if (slot.day_date) parts.push(this.formatOfficeScheduleDay(slot));
      if (slot.scheduled_time) parts.push(slot.scheduled_time);
      if (slot.court_id) parts.push(this.officeScheduleCourtLabel(slot));
      return parts.join(' · ');
    },

    officeKnockoutSideWon(slot, side) {
      const name = this.officeKnockoutSideName(slot, side);
      return Boolean(slot.winner_name && name && slot.winner_name === name);
    },
  };
}
