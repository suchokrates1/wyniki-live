/**
 * The office path: five steps a tournament goes through (starting groups, knockout draws,
 * schedule, group phase, knockout), each done or not from the data itself, and the one
 * next step to take.
 * Nothing is locked: every view stays open at any time.
 */
const STEP_VIEWS = ['groups', 'draws', 'planning', 'progress', 'knockout'];

export function assignmentOf(map, id) {
  if (!map || id == null) return '';
  return map[id] || map[Number(id)] || map[String(id)] || '';
}

/** Unique roster + group rows from planning data. Do not rematch class/gender across categories. */
export function officePathRosterFacts({
  categories = [],
  groups = [],
  players = [],
  assignments = {},
  teams = [],
  teamAssignments = {},
  matchPlayer = () => false,
} = {}) {
  const active = categories.filter((cat) => cat?.is_active !== 0);
  const seen = new Set();
  const roster = [];
  for (const player of players) {
    if (player?.id == null || seen.has(Number(player.id))) continue;
    seen.add(Number(player.id));
    roster.push(player);
  }
  const missing = [];
  for (const category of active) {
    const groupNames = new Set(
      groups
        .filter((group) => Number(group.tournament_category_id) === Number(category.id))
        .map((group) => group.name),
    );
    if (category.is_doubles) {
      const catTeams = teams.filter((team) => Number(team.category_id) === Number(category.id));
      const open = catTeams.filter((team) => !groupNames.has(assignmentOf(teamAssignments, team.id)));
      if (!catTeams.length) missing.push({ key: 'missingNoPairs', category });
      else if (open.length) missing.push({ key: 'missingPairs', category, count: open.length });
      continue;
    }
    const inGroups = roster.filter((player) => groupNames.has(assignmentOf(assignments, player.id)));
    const matching = roster.filter((player) => matchPlayer(player, category));
    const open = matching.filter((player) => !assignmentOf(assignments, player.id));
    if (!inGroups.length && !matching.length) missing.push({ key: 'missingNoPlayers', category });
    else if (open.length) missing.push({ key: 'missingPlayers', category, count: open.length });
  }
  return {
    singlesTotal: roster.length,
    singlesAssigned: roster.filter((player) => assignmentOf(assignments, player.id)).length,
    missing,
  };
}

export function createOfficePathView() {
  return {
    officeUserNavigated: false,
    officePathDismissTick: 0,

    officePathCategoryLabel(category) {
      return this.officeDisplayLabel(category?.label || '');
    },

    /** Everything the steps need, computed once per render. */
    officePathFacts() {
      const categories = (this.tournamentCategories || []).filter((cat) => cat.is_active !== 0);
      const groups = this.planningGroups || [];
      const roster = officePathRosterFacts({
        categories,
        groups,
        players: this.planningPlayers || [],
        assignments: this.planningGroupAssignments || {},
        teams: this.planningTeams || [],
        teamAssignments: this.planningTeamAssignments || {},
        matchPlayer: (player, category) => this.planningPlayersMatchingCategory(category).some((row) => Number(row.id) === Number(player.id)),
      });
      const { singlesTotal, singlesAssigned, missing } = roster;

      const schedule = this.officeSchedule || [];
      const isPlaced = (entry) => Boolean(String(entry.court_id || '').trim() && String(entry.scheduled_time || '').trim());
      const groupRows = schedule.filter((entry) => entry.source_type === 'group' || entry.source_type === 'group_rematch');
      const knockoutRows = schedule.filter((entry) => entry.source_type === 'knockout');
      const unplacedByCategory = {};
      for (const entry of groupRows.filter((row) => !isPlaced(row) && !row.match_id)) {
        const label = this.officeDisplayLabel(String(entry.category_name || entry.group_name || '').split(' — ')[0]);
        unplacedByCategory[label] = (unplacedByCategory[label] || 0) + 1;
      }
      const days = new Set(groupRows.filter(isPlaced).map((entry) => entry.day_date).filter(Boolean));

      const progressGroups = (this.dashboard?.progress?.groups || []).filter((group) => group.play_format !== 'knockout' && Number(group.expected_matches) > 0);
      const knockout = this.officeKnockout || {};
      return {
        categories,
        groupCount: groups.filter((group) => group.play_format !== 'knockout').length,
        singlesTotal,
        singlesAssigned,
        missing,
        groupRows,
        groupUnplaced: groupRows.filter((row) => !isPlaced(row) && !row.match_id).length,
        groupDrafts: groupRows.filter((row) => isPlaced(row) && !row.match_id && String(row.status || 'draft') === 'draft').length,
        unplacedByCategory,
        days: days.size,
        resultsExpected: progressGroups.reduce((sum, group) => sum + Number(group.expected_matches || 0), 0),
        resultsFinished: progressGroups.reduce((sum, group) => sum + Math.min(Number(group.finished_matches || 0), Number(group.expected_matches || 0)), 0),
        groupsComplete: progressGroups.length > 0 && progressGroups.every((group) => group.complete),
        knockoutExpected: Number(knockout.expected_matches || 0),
        knockoutFinished: Number(knockout.finished_matches || 0),
        knockoutUnplaced: knockoutRows.filter((row) => !isPlaced(row) && !row.match_id).length,
        knockoutDrafts: knockoutRows.filter((row) => isPlaced(row) && !row.match_id && String(row.status || 'draft') === 'draft').length,
      };
    },

    officePathSteps() {
      if (!this.planningLoadedOnce || !this.drawFormatsLoaded) return STEP_VIEWS.map((view, index) => ({ index, number: index + 1, view, label: [this.ot('path.stepGroups'), this.ot('path.stepDraws'), this.ot('path.stepSchedule'), this.ot('path.stepGroupPhase'), this.ot('path.stepKnockout')][index], meta: '', state: 'later' }));
      const facts = this.officePathFacts();
      const t = (key, values) => this.ot(`path.${key}`, values);
      const groupsDone = facts.categories.length > 0 && !facts.missing.length && facts.groupCount > 0;
      const drawsDone = groupsDone && this.drawAllConfirmed();
      const scheduleDone = facts.groupRows.length > 0 && facts.groupUnplaced === 0 && facts.groupDrafts === 0;
      const groupPhaseDone = facts.groupsComplete;
      const knockoutDone = groupPhaseDone && (facts.knockoutExpected === 0 || facts.knockoutFinished >= facts.knockoutExpected);
      const done = [groupsDone, drawsDone, scheduleDone, groupPhaseDone, knockoutDone];
      const current = done.findIndex((value) => !value);

      const meta = [
        !facts.categories.length
          ? t('metaNoCategories')
          : groupsDone
            ? t('metaGroupsReady', { categories: facts.categories.length, groups: facts.groupCount })
            : t('metaDrawn', { assigned: facts.singlesAssigned, total: facts.singlesTotal }),
        this.drawFormatsLoaded && this.drawFormats.length
          ? t('metaDraws', { confirmed: this.drawConfirmedCount(), total: this.drawFormats.length })
          : '—',
        !facts.groupRows.length
          ? t('metaScheduleNone')
          : facts.groupUnplaced
            ? t('metaSchedulePlaced', { placed: facts.groupRows.length - facts.groupUnplaced, total: facts.groupRows.length })
            : facts.groupDrafts
              ? t('metaScheduleDrafts', { drafts: facts.groupDrafts })
              : t('metaSchedulePublished', { total: facts.groupRows.length, days: facts.days }),
        facts.resultsExpected ? t('metaResults', { finished: facts.resultsFinished, expected: facts.resultsExpected }) : '—',
        facts.knockoutExpected
          ? t('metaKnockout', { finished: facts.knockoutFinished, expected: facts.knockoutExpected })
          : groupPhaseDone ? t('metaNoKnockout') : '—',
      ];
      const labels = [t('stepGroups'), t('stepDraws'), t('stepSchedule'), t('stepGroupPhase'), t('stepKnockout')];
      return STEP_VIEWS.map((view, index) => ({
        index,
        number: index + 1,
        view,
        label: labels[index],
        meta: meta[index],
        state: done[index] ? 'done' : index === current ? 'current' : 'later',
      }));
    },

    officePathCurrentIndex() {
      const current = this.officePathSteps().findIndex((step) => step.state === 'current');
      return current === -1 ? STEP_VIEWS.length : current;
    },

    officePathStateLabel(step) {
      return this.ot(`path.state${step.state[0].toUpperCase()}${step.state.slice(1)}`);
    },

    /** The single next thing to do, or null while planning data is not loaded yet. */
    officePathNext() {
      if (!this.dashboard || !this.planningLoadedOnce || !this.drawFormatsLoaded) return null;
      const facts = this.officePathFacts();
      const current = this.officePathCurrentIndex();
      const t = (key, values) => this.ot(`path.${key}`, values);
      const chip = (item) => t(item.key, { category: this.officePathCategoryLabel(item.category), count: item.count });
      if (current === 0) {
        if (!facts.categories.length) return { step: 0, variant: 'noCategories', text: t('nextNoCategories'), cta: t('ctaGroups'), view: 'groups' };
        if (!facts.singlesAssigned && !facts.groupCount) return { step: 0, variant: 'noGroups', text: t('nextNoGroups'), chips: facts.missing.slice(0, 6).map(chip), cta: t('ctaGroups'), view: 'groups' };
        return { step: 0, variant: 'drawing', text: t('nextDrawing', { assigned: facts.singlesAssigned, total: facts.singlesTotal }), chips: facts.missing.slice(0, 6).map(chip), cta: t('ctaFinishDraw'), view: 'groups' };
      }
      if (current === 1) {
        const left = this.drawFormats.length - this.drawConfirmedCount();
        return {
          step: 1,
          variant: 'draws',
          text: t('nextDraws', { left, total: this.drawFormats.length, matches: this.drawTotalMatches() }),
          cta: t('ctaDraws'),
          view: 'draws',
          action: this.activeTab === 'draws' ? 'confirmAllDraws' : null,
          actionLabel: t('ctaConfirmAllDraws'),
        };
      }
      if (current === 2) {
        if (!facts.groupRows.length) return { step: 2, variant: 'generate', text: t('nextGenerate'), cta: t('ctaSchedule'), view: 'planning' };
        if (facts.groupUnplaced === facts.groupRows.length) return { step: 2, variant: 'plan', text: t('nextPlanGroups'), cta: t('ctaSchedule'), view: 'planning' };
        if (facts.groupUnplaced) {
          const chips = Object.entries(facts.unplacedByCategory).slice(0, 6).map(([category, count]) => t('missingUnplaced', { category, count }));
          return { step: 2, variant: 'placing', text: t('nextPlacing', { placed: facts.groupRows.length - facts.groupUnplaced, total: facts.groupRows.length, left: facts.groupUnplaced }), chips, cta: t('ctaSchedule'), view: 'planning' };
        }
        return { step: 2, variant: 'publish', text: t('nextPublish', { drafts: facts.groupDrafts }), cta: t('ctaSchedule'), view: 'planning' };
      }
      if (current === 3) {
        return { step: 3, variant: 'groupPhase', text: t('nextGroupPhase', { finished: facts.resultsFinished, expected: facts.resultsExpected }), cta: t('ctaProgress'), view: 'progress' };
      }
      if (current === 4) {
        if (facts.knockoutUnplaced) return { step: 4, variant: 'planKnockout', text: t('nextPlanKnockout', { count: facts.knockoutExpected }), cta: t('ctaSchedule'), view: 'planning' };
        if (facts.knockoutDrafts) return { step: 4, variant: 'publishKnockout', text: t('nextPublishKnockout', { drafts: facts.knockoutDrafts }), cta: t('ctaSchedule'), view: 'planning' };
        return { step: 4, variant: 'knockout', text: t('nextKnockout', { finished: facts.knockoutFinished, expected: facts.knockoutExpected }), cta: t('ctaKnockout'), view: 'knockout' };
      }
      return {
        step: 5,
        variant: 'finished',
        finished: true,
        text: facts.knockoutExpected ? t('nextFinished') : t('nextNoKnockout'),
        cta: t('ctaKnockout'),
        view: facts.knockoutExpected ? 'knockout' : 'progress',
      };
    },

    async runOfficePathNext() {
      const next = this.officePathNext();
      if (!next) return;
      if (next.action === 'confirmAllDraws') {
        await this.confirmAllDrawFormats();
        return;
      }
      if (next.view) await this.openOfficeView(next.view);
    },

    officePathDismissKey() {
      return `office-path-dismissed-t${this.officeTournamentId || this.slot}`;
    },

    officePathVisible() {
      void this.officePathDismissTick; // re-render after "hide"
      const next = this.officePathNext();
      if (!next) return false;
      try {
        return window.sessionStorage.getItem(this.officePathDismissKey()) !== `${next.step}:${next.variant}`;
      } catch {
        return true;
      }
    },

    dismissOfficePath() {
      const next = this.officePathNext();
      if (!next) return;
      try {
        window.sessionStorage.setItem(this.officePathDismissKey(), `${next.step}:${next.variant}`);
      } catch {
        // private mode: it only stays hidden until the next render
      }
      this.officePathDismissTick = (this.officePathDismissTick || 0) + 1;
    },

    /** On entering the office, open the first unfinished step — unless the user already moved. */
    async openOfficePathStart() {
      this.officeUserNavigated = false;
      await Promise.all([this.loadDashboard(false), this.loadOfficePlanningData()]);
      // after planning: its own draws refresh is older, so this one is the one applied
      await this.loadDrawFormats();
      if (this.officeUserNavigated) return;
      const next = this.officePathNext();
      await this.openOfficeView(next?.view || this.activeTab, { auto: true });
    },
  };
}
