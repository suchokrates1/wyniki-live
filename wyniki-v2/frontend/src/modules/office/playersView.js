import {
  inferMixedPlayerBands,
  mixedCategoryDisplayLabel,
  planningDivisionFromGroupName as sharedPlanningDivisionFromGroupName,
  planningDivisionKey as sharedPlanningDivisionKey,
  planningResolveStoredGroupName as sharedPlanningResolveStoredGroupName,
  planningStoredGroupNames as sharedPlanningStoredGroupNames,
} from '../../shared/categories.js';
import { DEFAULT_PLAY_FORMAT, PLAY_FORMATS, normalizePlayFormat, playFormatLabelKey } from '../../shared/playFormat.js';

export function createOfficePlayersView() {
  return {
    async loadOfficePlanningData() {
      if (!this.token) return;
      this.planningLoading = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/planning`, {
          headers: this.officeHeaders(),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || this.ot('errors.planningFailed'));
        }
        this.planningPlayers = Array.isArray(payload.players) ? payload.players : [];
        this.tournamentCategories = Array.isArray(payload.tournament_categories) ? payload.tournament_categories : [];
        this.planningTeams = Array.isArray(payload.teams) ? payload.teams : [];
        this.planningMixedCategories = inferMixedPlayerBands(this.tournamentCategories);
        this.planningGroups = Array.isArray(payload.groups) ? payload.groups : [];
        this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : [];
        this.planningCourts = Array.isArray(payload.courts) ? payload.courts : [];
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.syncPlanningGroupAssignments();
        this.ensurePlanningDefaults();
      } catch (error) {
        console.error('Failed to load office planning data:', error);
        this.showToast(error.message || this.ot('toast.planningError'), 'error');
      } finally {
        this.planningLoading = false;
      }
    },

    ensurePlanningDefaults() {
      const divisions = this.planningDivisions();
      if (!divisions.find(division => String(division.key) === String(this.planningSelectedDivision))) {
        this.planningSelectedDivision = divisions[0]?.key || '';
        this.planningSelectedCategoryId = divisions[0]?.id ?? null;
      }
      if (this.planningUsesTournamentCategories() && this.planningSelectedDivision) {
        this.planningSelectedCategoryId = Number(this.planningSelectedDivision);
      }
      this.categorySetupOpen = !this.tournamentCategories.length;
      const selectedGroups = this.planningGroupsForDivision(this.planningSelectedDivision);
      if (selectedGroups.length) {
        this.planningGroupCount = Math.max(1, selectedGroups.length);
      } else {
        this.planningGroupCount = 1;
      }
      this.planningNewSchedule.day_date = this.planningNewSchedule.day_date || this.tournamentMeta?.start_date || this.dashboard?.tournament?.start_date || '';
      this.planningNewSchedule.court_id = this.planningNewSchedule.court_id || this.planningCourts[0]?.kort_id || '';
      const days = this.planningTournamentDays();
      if (!this.autoDayDate || !days.includes(this.autoDayDate)) {
        this.autoDayDate = days[0] || this.autoDayDate || '';
      }
      this.planningStep1Collapsed = this.planningGroupsComplete();
    },

    planningGroupsComplete() {
      const categories = (this.tournamentCategories || []).filter(cat => cat.is_active !== 0);
      const groups = this.planningGroups || [];
      if (!categories.length || !groups.length) return false;
      const teams = this.planningTeams || [];
      for (const cat of categories.filter(item => item.is_doubles)) {
        const catTeams = teams.filter(team => Number(team.category_id) === Number(cat.id));
        if (!catTeams.length) continue;
        const allAssigned = catTeams.every(team => {
          const groupName = this.planningTeamAssignments[team.id];
          if (!groupName) return false;
          const group = groups.find(item => item.name === groupName);
          return group && Number(group.tournament_category_id) === Number(cat.id);
        });
        if (!allAssigned) return false;
      }
      const coveredIds = new Set();
      for (const team of teams) {
        if (!this.planningTeamAssignments[team.id]) continue;
        if (team.player1_id) coveredIds.add(Number(team.player1_id));
        if (team.player2_id) coveredIds.add(Number(team.player2_id));
      }
      const singlesPlayers = (this.planningPlayers || []).filter(player => !coveredIds.has(Number(player.id)));
      if (singlesPlayers.length) {
        return singlesPlayers.every(player => this.planningGroupAssignments[player.id]);
      }
      return teams.some(team => this.planningTeamAssignments[team.id]) || (this.planningPlayers || []).length > 0;
    },

    planningDivisionCountLine(division) {
      const cat = (this.tournamentCategories || []).find(item => String(item.id) === String(division.key));
      if (cat?.is_doubles) {
        const assigned = this.planningTeamsForCategory(cat.id).filter(team => this.planningTeamAssignments[team.id]).length;
        return `${this.ot('planning.pairsCount', { count: division.count })} · ${this.ot('planning.inGroups', { count: assigned })}`;
      }
      return `${this.ot('planning.playersCount', { count: division.count })} · ${this.ot('planning.inGroups', { count: this.planningDivisionAssignedCount(division.key) })}`;
    },

    planningStep1CompleteLine() {
      if ((this.tournamentCategories || []).some(cat => cat.is_doubles && cat.is_active !== 0)) {
        const allTeamsAssigned = (this.planningTeams || []).every(team => this.planningTeamAssignments[team.id]);
        if (allTeamsAssigned && (this.planningTeams || []).length) {
          return this.ot('planning.step1CompleteTeams', { count: this.planningGroups.length });
        }
      }
      return this.ot('planning.step1Complete', { count: this.planningGroups.length });
    },

    syncPlanningGroupAssignments() {
      const assignments = {};
      const teamAssignments = {};
      const formats = { ...(this.planningGroupFormats || {}) };
      for (const group of this.planningGroups || []) {
        formats[group.name] = normalizePlayFormat(group.play_format);
        for (const player of group.players || []) {
          if (player.team_id) teamAssignments[player.team_id] = group.name;
          else if (player.player_id) assignments[player.player_id] = group.name;
        }
      }
      this.planningGroupAssignments = assignments;
      this.planningTeamAssignments = teamAssignments;
      this.planningGroupFormats = formats;
    },

    normalizePlanningCategory(value) {
      return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    },

    normalizePlanningGender(value) {
      const raw = String(value || '').trim().toUpperCase();
      if (raw === 'K' || raw === 'F' || raw === 'W') return 'K';
      if (raw === 'M') return 'M';
      return '';
    },

    planningUsesTournamentCategories() {
      return (this.tournamentCategories || []).some(cat => cat.is_active !== 0);
    },

    planningCategoryPresetKeys() {
      return ['B1M', 'B1K', 'B2M', 'B2K', 'B3M', 'B3K', 'B4M', 'B4K'];
    },

    planningCategoryPresetLabel(key) {
      const labels = {
        B1M: 'B1 M', B1K: 'B1 K', B2M: 'B2 M', B2K: 'B2 K',
        B3M: 'B3 M', B3K: 'B3 K', B4M: 'B4 M', B4K: 'B4 K',
      };
      return labels[key] || key;
    },

    planningSelectedCategory() {
      const id = this.planningSelectedCategoryId ?? this.planningSelectedDivision;
      return (this.tournamentCategories || []).find(cat => String(cat.id) === String(id)) || null;
    },

    planningSelectedCategoryIsDoubles() {
      return Boolean(this.planningSelectedCategory()?.is_doubles);
    },

    planningTeamsForCategory(categoryId) {
      const id = Number(categoryId || 0);
      if (!id) return [];
      return (this.planningTeams || []).filter(team => Number(team.category_id) === id);
    },

    planningGroupPlayFormat(groupName) {
      return normalizePlayFormat((this.planningGroupFormats || {})[groupName]);
    },

    planningPlayFormatOptions() {
      return PLAY_FORMATS.map(value => ({
        value,
        label: this.ot(playFormatLabelKey(value)),
      }));
    },

    planningGroupHasLockedFormat(groupName) {
      const group = (this.planningGroups || []).find(item => item.name === groupName);
      if (!group?.id) return false;
      return (this.planningSchedule || []).some(entry => (
        Number(entry.bracket_group_id) === Number(group.id)
        && (entry.match_id || (entry.status && entry.status !== 'draft'))
      ));
    },

    setPlanningGroupPlayFormat(groupName, value) {
      if (!groupName || this.planningGroupHasLockedFormat(groupName)) return;
      this.planningGroupFormats = {
        ...(this.planningGroupFormats || {}),
        [groupName]: normalizePlayFormat(value),
      };
      this.schedulePlanningAutoSave();
    },

    playerClassificationLabel(player) {
      const band = String(player?.category || '').trim();
      const gender = this.normalizePlanningGender(player?.gender);
      const genderLabel = gender === 'K' ? this.ot('gender.women') : gender === 'M' ? this.ot('gender.men') : '';
      return [band, genderLabel].filter(Boolean).join(' · ');
    },

    async confirmTournamentCategories() {
      const presets = this.planningCategoryPresetKeys()
        .filter(key => this.categoryPresetSelected[key])
        .map(key => ({ preset_key: key, is_doubles: Boolean(this.categoryPresetDoubles[key]) }));
      const customLabel = (this.categoryCustomLabel || '').trim();
      const entries = [...presets];
      if (customLabel) {
        entries.push({
          label: customLabel,
          hint_bands: (this.categoryCustomHints || '').split(/[,/]/).map(v => v.trim()).filter(Boolean),
          is_doubles: Boolean(this.categoryCustomDoubles),
        });
      }
      if (!entries.length) {
        this.showToast(this.ot('toast.pickCategory'), 'warning');
        return;
      }
      try {
        const response = await fetch(`/api/office/${this.slot}/categories/confirm`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({ categories: entries }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || this.ot('errors.categoriesFailed'));
        this.tournamentCategories = Array.isArray(payload.categories) ? payload.categories : [];
        this.categorySetupOpen = false;
        this.categoryCustomLabel = '';
        this.categoryCustomHints = '';
        this.categoryCustomDoubles = false;
        this.categoryPresetDoubles = {};
        this.showToast(this.ot('toast.categoriesSaved'), 'success');
        this.ensurePlanningDefaults();
      } catch (error) {
        this.showToast(error.message || this.ot('toast.categoriesError'), 'error');
      }
    },

    async addCustomTournamentCategory() {
      const label = (this.categoryCustomLabel || '').trim();
      if (!label) return;
      try {
        const response = await fetch(`/api/office/${this.slot}/categories`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            label,
            hint_bands: (this.categoryCustomHints || '').split(/[,/]/).map(v => v.trim()).filter(Boolean),
            is_doubles: Boolean(this.categoryCustomDoubles),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || this.ot('errors.categoriesFailed'));
        this.tournamentCategories = Array.isArray(payload.categories) ? payload.categories : this.tournamentCategories;
        this.categoryCustomLabel = '';
        this.categoryCustomHints = '';
        this.categoryCustomDoubles = false;
        this.showToast(this.ot('toast.categoryAdded'), 'success');
        this.ensurePlanningDefaults();
      } catch (error) {
        this.showToast(error.message || this.ot('toast.categoriesError'), 'error');
      }
    },

    async saveTournamentCategoryEdit() {
      if (!this.categoryEditId) return;
      try {
        const response = await fetch(`/api/office/${this.slot}/categories/${this.categoryEditId}`, {
          method: 'PATCH',
          headers: this.officeHeaders(),
          body: JSON.stringify({ label: (this.categoryEditLabel || '').trim() }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || this.ot('errors.categoriesFailed'));
        this.tournamentCategories = Array.isArray(payload.categories) ? payload.categories : this.tournamentCategories;
        if (Array.isArray(payload.groups)) this.planningGroups = payload.groups;
        if (Array.isArray(payload.schedule)) this.planningSchedule = payload.schedule;
        this.categoryEditId = null;
        this.categoryEditLabel = '';
        this.showToast(this.ot('toast.categoryUpdated'), 'success');
      } catch (error) {
        this.showToast(error.message || this.ot('toast.categoriesError'), 'error');
      }
    },

    async deleteTournamentCategory(categoryId) {
      if (!categoryId || !confirm(this.ot('confirm.deleteCategory'))) return;
      try {
        const response = await fetch(`/api/office/${this.slot}/categories/${categoryId}`, {
          method: 'DELETE',
          headers: this.officeHeaders(),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || this.ot('errors.categoriesFailed'));
        this.tournamentCategories = Array.isArray(payload.categories) ? payload.categories : [];
        this.ensurePlanningDefaults();
        this.showToast(this.ot('toast.categoryDeleted'), 'success');
      } catch (error) {
        this.showToast(error.message || this.ot('toast.categoriesError'), 'error');
      }
    },

    startCategoryEdit(category) {
      this.categoryEditId = category.id;
      this.categoryEditLabel = category.label;
    },

    planningDivisionKey(player) {
      return sharedPlanningDivisionKey(
        player?.category || '',
        player?.gender || '',
        this.planningMixedCategories,
      );
    },

    planningDivisionLabel(key = this.planningSelectedDivision) {
      const value = String(key || '').toUpperCase();
      const mixedLabel = mixedCategoryDisplayLabel(value, this.planningMixedCategories);
      if (mixedLabel) return mixedLabel;
      const category = (value.match(/^B\d{1,2}/) || [''])[0];
      const gender = value.endsWith('K')
        ? this.ot('gender.women')
        : value.endsWith('M')
          ? this.ot('gender.men')
          : '';
      if (category && gender) return `${category} ${gender}`;
      return category || gender || this.ot('gender.unassigned');
    },

    planningDivisionFromGroupName(groupName) {
      return sharedPlanningDivisionFromGroupName(groupName, this.planningMixedCategories);
    },

    planningDivisions() {
      if (this.planningUsesTournamentCategories()) {
        return (this.tournamentCategories || [])
          .filter(cat => cat.is_active !== 0)
          .map(cat => ({
            key: String(cat.id),
            id: cat.id,
            label: cat.label,
            count: cat.is_doubles
              ? this.planningTeamsForCategory(cat.id).length
              : cat.player_count || this.planningCategoryAssignedCount(cat.id),
            hint_bands: cat.hint_bands || [],
            is_doubles: Boolean(cat.is_doubles),
          }));
      }
      const grouped = new Map();
      for (const player of this.planningPlayers || []) {
        const key = this.planningDivisionKey(player);
        if (!grouped.has(key)) grouped.set(key, { key, label: this.planningDivisionLabel(key), count: 0 });
        grouped.get(key).count += 1;
      }
      return [...grouped.values()].sort((left, right) => {
        if (left.key === 'NIEPRZYPISANI') return 1;
        if (right.key === 'NIEPRZYPISANI') return -1;
        return left.key.localeCompare(right.key, 'pl', { numeric: true });
      });
    },

    planningPlayersForDivision(key = this.planningSelectedDivision) {
      if (this.planningUsesTournamentCategories()) return this.planningPlayers || [];
      return (this.planningPlayers || []).filter(player => this.planningDivisionKey(player) === key);
    },

    planningGroupsForDivision(key = this.planningSelectedDivision) {
      if (this.planningUsesTournamentCategories()) {
        const categoryId = Number(key || this.planningSelectedCategoryId || this.planningSelectedDivision);
        const cat = (this.tournamentCategories || []).find(item => Number(item.id) === categoryId);
        return (this.planningGroups || []).filter(group => {
          if (group.tournament_category_id != null) return Number(group.tournament_category_id) === categoryId;
          if (!cat) return false;
          return group.name === cat.label || String(group.name || '').startsWith(`${cat.label} —`);
        });
      }
      return (this.planningGroups || []).filter(group => this.planningDivisionFromGroupName(group.name) === key);
    },

    planningTargetGroupNames() {
      if (this.planningUsesTournamentCategories()) {
        const cat = this.planningSelectedCategory();
        if (!cat) return [];
        const label = cat.label;
        const count = Math.max(1, Math.min(8, Number(this.planningGroupCount || 1)));
        if (count === 1) return [label];
        return Array.from({ length: count }, (_, index) => (
          `${label} — Grupa ${String.fromCharCode(65 + index)}`
        ));
      }
      if (!this.planningSelectedDivision) return [];
      return sharedPlanningStoredGroupNames(
        this.planningSelectedDivision,
        this.planningGroupCount,
        this.planningMixedCategories,
      );
    },

    planningGroupDisplayName(groupName) {
      return this.officeDisplayLabel(groupName);
    },

    planningResolveGroupName(groupName, divisionKey = this.planningSelectedDivision) {
      if (this.planningUsesTournamentCategories()) {
        const valid = new Set(this.planningTargetGroupNames());
        if (valid.has(groupName)) return groupName;
        return '';
      }
      const groupCount = divisionKey === this.planningSelectedDivision
        ? this.planningGroupCount
        : this.planningGroupCountForDivision(divisionKey);
      return sharedPlanningResolveStoredGroupName(
        groupName,
        divisionKey,
        groupCount,
        this.planningMixedCategories,
      );
    },

    planningGroupCountForDivision(divisionKey) {
      const groups = (this.planningGroups || []).filter(group => (
        sharedPlanningDivisionFromGroupName(group.name, this.planningMixedCategories) === divisionKey
      ));
      return groups.length ? Math.max(1, Math.min(8, groups.length)) : 1;
    },

    planningDivisionGroupNames() {
      const names = new Set(this.planningTargetGroupNames());
      for (const group of this.planningGroupsForDivision()) names.add(group.name);
      for (const player of this.planningPlayersForDivision()) {
        const assigned = this.planningGroupAssignments[player.id];
        if (assigned) names.add(assigned);
      }
      for (const team of this.planningTeamsForCategory(this.planningSelectedCategoryId)) {
        const assigned = this.planningTeamAssignments[team.id];
        if (assigned) names.add(assigned);
      }
      return [...names];
    },

    planningAssignedTeams(groupName) {
      return this.planningTeamsForCategory(this.planningSelectedCategoryId).filter(team => (
        this.planningResolveGroupName(this.planningTeamAssignments[team.id]) === groupName
      ));
    },

    planningUnassignedTeams() {
      return this.planningTeamsForCategory(this.planningSelectedCategoryId).filter(team => (
        !this.planningResolveGroupName(this.planningTeamAssignments[team.id])
      ));
    },

    planningTeamOrdinal(team) {
      const pool = this.planningUnassignedTeams();
      return pool.findIndex(item => Number(item.id) === Number(team.id)) + 1;
    },

    planningTeamPartnerOptions(excludeId = null) {
      const taken = new Set();
      for (const team of this.planningTeamsForCategory(this.planningSelectedCategoryId)) {
        if (team.player1_id) taken.add(Number(team.player1_id));
        if (team.player2_id) taken.add(Number(team.player2_id));
      }
      const exclude = Number(excludeId || 0);
      return (this.planningPlayers || []).filter(player => {
        if (taken.has(Number(player.id))) return false;
        if (exclude && Number(player.id) === exclude) return false;
        return true;
      });
    },

    planningAssignedPlayers(groupName) {
      return (this.planningPlayers || []).filter(player => (
        this.planningResolveGroupName(this.planningGroupAssignments[player.id]) === groupName
      ));
    },

    planningEffectiveGroup(player) {
      return this.planningResolveGroupName(this.planningGroupAssignments[player.id]);
    },

    planningUnassignedPlayers() {
      return (this.planningPlayers || []).filter(player => !this.planningEffectiveGroup(player));
    },

    planningOrdinal(player) {
      const pool = this.planningUsesTournamentCategories()
        ? this.planningUnassignedPlayers()
        : this.planningPlayersForDivision();
      return pool.findIndex(item => item.id === player.id) + 1;
    },

    planningCategoryAssignedCount(categoryId = this.planningSelectedCategoryId) {
      return this.planningGroupsForDivision(String(categoryId))
        .reduce((sum, group) => sum + (group.players?.length || 0), 0);
    },

    planningDivisionAssignedCount(key = this.planningSelectedDivision) {
      if (this.planningUsesTournamentCategories()) {
        return this.planningCategoryAssignedCount(Number(key || this.planningSelectedCategoryId));
      }
      const targets = new Set(sharedPlanningStoredGroupNames(
        key,
        this.planningGroupCountForDivision(key),
        this.planningMixedCategories,
      ));
      return this.planningPlayersForDivision(key).filter(player => {
        const resolved = this.planningResolveGroupName(this.planningGroupAssignments[player.id], key);
        return resolved && targets.has(resolved);
      }).length;
    },

    selectPlanningDivision(key) {
      this.planningSelectedDivision = key;
      if (this.planningUsesTournamentCategories()) {
        this.planningSelectedCategoryId = Number(key);
      }
      const groups = this.planningGroupsForDivision(key);
      this.planningGroupCount = groups.length ? Math.max(1, Math.min(8, groups.length)) : 1;
    },

    planningSetGroupCount(delta) {
      const next = Math.max(1, Math.min(8, Number(this.planningGroupCount || 1) + Number(delta || 0)));
      if (next === this.planningGroupCount) return;
      this.planningGroupCount = next;
      const valid = new Set(this.planningTargetGroupNames());
      const assignments = { ...this.planningGroupAssignments };
      const teamAssignments = { ...this.planningTeamAssignments };
      let changed = false;
      for (const player of this.planningPlayersForDivision()) {
        const assigned = assignments[player.id];
        if (!assigned) continue;
        const canonical = this.planningResolveGroupName(assigned);
        if (!canonical || !valid.has(canonical)) {
          delete assignments[player.id];
          changed = true;
        } else if (canonical !== assigned) {
          assignments[player.id] = canonical;
          changed = true;
        }
      }
      for (const team of this.planningTeamsForCategory(this.planningSelectedCategoryId)) {
        const assigned = teamAssignments[team.id];
        if (!assigned) continue;
        const canonical = this.planningResolveGroupName(assigned);
        if (!canonical || !valid.has(canonical)) {
          delete teamAssignments[team.id];
          changed = true;
        } else if (canonical !== assigned) {
          teamAssignments[team.id] = canonical;
          changed = true;
        }
      }
      if (changed) {
        this.planningGroupAssignments = assignments;
        this.planningTeamAssignments = teamAssignments;
      }
      this.schedulePlanningAutoSave();
    },

    onPlanningPlayerDragStart(player, event) {
      this.planningDragPlayerId = player.id;
      this.planningDragTeamId = null;
      if (event?.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', String(player.id)); } catch (e) { /* noop */ }
      }
    },

    onPlanningTeamDragStart(team, event) {
      this.planningDragTeamId = team.id;
      this.planningDragPlayerId = null;
      if (event?.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', `team:${team.id}`); } catch (e) { /* noop */ }
      }
    },

    onPlanningDropTeamToGroup(groupName) {
      const id = this.planningDragTeamId;
      this.planningDragTeamId = null;
      this.planningDragPlayerId = null;
      if (!id || !groupName) return;
      if (this.planningTeamAssignments[id] === groupName) return;
      this.planningTeamAssignments = { ...this.planningTeamAssignments, [id]: groupName };
      this.schedulePlanningAutoSave();
    },

    onPlanningDropTeamToPool() {
      const id = this.planningDragTeamId;
      this.planningDragTeamId = null;
      this.planningDragPlayerId = null;
      if (!id || !this.planningTeamAssignments[id]) return;
      const assignments = { ...this.planningTeamAssignments };
      delete assignments[id];
      this.planningTeamAssignments = assignments;
      this.schedulePlanningAutoSave();
    },

    autoAssignPlanningTeams() {
      const groupNames = this.planningTargetGroupNames();
      if (!groupNames.length) return;
      const assignments = { ...this.planningTeamAssignments };
      this.planningUnassignedTeams().forEach((team, index) => {
        assignments[team.id] = groupNames[index % groupNames.length];
      });
      this.planningTeamAssignments = assignments;
      this.schedulePlanningAutoSave();
    },

    clearPlanningTeamAssignments() {
      const assignments = { ...this.planningTeamAssignments };
      const valid = new Set(this.planningTargetGroupNames());
      for (const team of this.planningTeamsForCategory(this.planningSelectedCategoryId)) {
        const groupName = assignments[team.id];
        if (!groupName) continue;
        if (valid.has(this.planningResolveGroupName(groupName))) delete assignments[team.id];
      }
      this.planningTeamAssignments = assignments;
      this.schedulePlanningAutoSave();
    },

    onPlanningDropToGroup(groupName) {
      if (this.planningSelectedCategoryIsDoubles()) {
        this.onPlanningDropTeamToGroup(groupName);
        return;
      }
      const id = this.planningDragPlayerId;
      this.planningDragPlayerId = null;
      this.planningDragTeamId = null;
      if (!id || !groupName) return;
      if (this.planningGroupAssignments[id] === groupName) return;
      this.planningGroupAssignments = { ...this.planningGroupAssignments, [id]: groupName };
      this.schedulePlanningAutoSave();
    },

    onPlanningDropToPool() {
      if (this.planningSelectedCategoryIsDoubles()) {
        this.onPlanningDropTeamToPool();
        return;
      }
      const id = this.planningDragPlayerId;
      this.planningDragPlayerId = null;
      this.planningDragTeamId = null;
      if (!id || !this.planningGroupAssignments[id]) return;
      const assignments = { ...this.planningGroupAssignments };
      delete assignments[id];
      this.planningGroupAssignments = assignments;
      this.schedulePlanningAutoSave();
    },

    autoAssignPlanningGroups() {
      if (this.planningSelectedCategoryIsDoubles()) {
        this.autoAssignPlanningTeams();
        return;
      }
      const groupNames = this.planningTargetGroupNames();
      if (!groupNames.length) return;
      const assignments = { ...this.planningGroupAssignments };
      this.planningUnassignedPlayers().forEach((player, index) => {
        assignments[player.id] = groupNames[index % groupNames.length];
      });
      this.planningGroupAssignments = assignments;
      this.schedulePlanningAutoSave();
    },

    clearPlanningDivisionAssignments() {
      if (this.planningSelectedCategoryIsDoubles()) {
        this.clearPlanningTeamAssignments();
        return;
      }
      const assignments = { ...this.planningGroupAssignments };
      for (const player of this.planningPlayers || []) {
        const groupName = assignments[player.id];
        if (!groupName) continue;
        if (this.planningUsesTournamentCategories()) {
          const valid = new Set(this.planningTargetGroupNames());
          if (valid.has(this.planningResolveGroupName(groupName))) delete assignments[player.id];
        } else if (this.planningDivisionKey(player) === this.planningSelectedDivision) {
          delete assignments[player.id];
        }
      }
      this.planningGroupAssignments = assignments;
      this.schedulePlanningAutoSave();
    },

    planningSerializeStoredGroup(group) {
      const rows = group.players || [];
      return {
        name: group.name,
        tournament_category_id: group.tournament_category_id || null,
        play_format: normalizePlayFormat(group.play_format || this.planningGroupFormats?.[group.name]),
        players: rows.filter(row => row.player_id && !row.team_id).map(row => row.player_id),
        teams: rows.filter(row => row.team_id).map(row => row.team_id),
      };
    },

    planningSelectedCategoryFilter(group) {
      const selectedCategoryId = this.planningUsesTournamentCategories()
        ? Number(this.planningSelectedCategoryId || this.planningSelectedDivision)
        : null;
      if (selectedCategoryId != null) {
        const cat = this.planningSelectedCategory();
        const gid = group.tournament_category_id != null ? Number(group.tournament_category_id) : null;
        return gid === selectedCategoryId
          || (cat && (group.name === cat.label || String(group.name || '').startsWith(`${cat.label} —`)));
      }
      return this.planningDivisionFromGroupName(group.name) === this.planningSelectedDivision;
    },

    buildPlanningGroupsPayload() {
      const selectedCategoryId = this.planningUsesTournamentCategories()
        ? Number(this.planningSelectedCategoryId || this.planningSelectedDivision)
        : null;
      const isDoubles = Boolean(this.planningSelectedCategory()?.is_doubles);
      const otherGroups = (this.planningGroups || [])
        .filter(group => !this.planningSelectedCategoryFilter(group))
        .map(group => this.planningSerializeStoredGroup(group));
      const divisionGroups = this.planningTargetGroupNames()
        .map(groupName => {
          const payload = {
            name: groupName,
            tournament_category_id: selectedCategoryId,
            play_format: this.planningGroupPlayFormat(groupName),
            players: [],
            teams: [],
          };
          if (isDoubles) {
            payload.teams = this.planningAssignedTeams(groupName).map(team => team.id);
          } else {
            payload.players = this.planningAssignedPlayers(groupName).map(player => player.id);
          }
          return payload;
        })
        .filter(group => (group.players.length + group.teams.length) > 0);
      return [...otherGroups, ...divisionGroups];
    },

    schedulePlanningAutoSave() {
      if (this.planningSaveTimer) clearTimeout(this.planningSaveTimer);
      this.planningSaveTimer = setTimeout(() => { this.autoSavePlanningGroups(); }, 500);
    },

    async autoSavePlanningGroups() {
      if (!this.planningSelectedDivision && !this.planningSelectedCategoryId) return;
      const groups = this.buildPlanningGroupsPayload();
      if (!groups.length) return;
      this.planningSaving = true;
      try {
        const response = await fetch(`/api/office/${this.slot}/planning/groups`, {
          method: 'PUT',
          headers: this.officeHeaders(),
          body: JSON.stringify({ groups }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.groupsFailed'));
        this.planningGroups = Array.isArray(payload.groups) ? payload.groups : this.planningGroups;
        this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : this.planningSchedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.syncPlanningGroupAssignments();
      } catch (error) {
        console.error('Failed to auto-save office planning groups:', error);
        this.showToast(error.message || this.ot('toast.groupsSaveError'), 'error');
      } finally {
        this.planningSaving = false;
      }
    },

    async savePlanningGroups() {
      if (!this.planningSelectedDivision && !this.planningSelectedCategoryId) return;
      const groups = this.buildPlanningGroupsPayload();
      const selectedHasCompetitors = groups.some(group => this.planningSelectedCategoryFilter(group)
        && ((group.players || []).length + (group.teams || []).length) > 0);
      if (!selectedHasCompetitors) {
        this.showToast(
          this.planningSelectedCategoryIsDoubles()
            ? this.ot('toast.assignTeamWarning')
            : this.ot('toast.assignPlayerWarning'),
          'warning',
        );
        return;
      }
      try {
        const response = await fetch(`/api/office/${this.slot}/planning/groups`, {
          method: 'PUT',
          headers: this.officeHeaders(),
          body: JSON.stringify({ groups }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.groupsFailed'));
        this.planningGroups = Array.isArray(payload.groups) ? payload.groups : this.planningGroups;
        this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : this.planningSchedule;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.syncPlanningGroupAssignments();
        this.showToast(this.ot('toast.groupsSaved'), 'success');
      } catch (error) {
        console.error('Failed to save office planning groups:', error);
        this.showToast(error.message || this.ot('toast.groupsSaveError'), 'error');
      }
    },

    planningPlayerNameOptions() {
      return (this.planningPlayers || [])
        .map(player => player.name || `${player.first_name || ''} ${player.last_name || ''}`.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pl'));
    },

    planningScheduleCategoryIsDoubles() {
      const label = String(this.planningNewSchedule?.category_name || '').trim();
      const cats = (this.tournamentCategories || []).filter(cat => cat.is_doubles && cat.is_active !== 0);
      if (label) {
        return cats.find(cat => cat.label === label) || null;
      }
      return this.planningSelectedCategoryIsDoubles() ? this.planningSelectedCategory() : null;
    },

    planningScheduleNameOptions() {
      const doublesCat = this.planningScheduleCategoryIsDoubles();
      if (doublesCat) {
        return this.planningTeamsForCategory(doublesCat.id)
          .map(team => team.display_name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pl'));
      }
      return this.planningPlayerNameOptions();
    },

    async addOfficeTeam() {
      const category = this.planningSelectedCategory();
      if (!category?.is_doubles) {
        this.showToast(this.ot('toast.pickTwoPartners'), 'warning');
        return;
      }
      const player1Id = Number(this.planningNewTeam.player1_id || 0);
      const player2Id = Number(this.planningNewTeam.player2_id || 0);
      if (!player1Id || !player2Id) {
        this.showToast(this.ot('toast.partnersRequired'), 'warning');
        return;
      }
      if (player1Id === player2Id) {
        this.showToast(this.ot('toast.pickTwoPartners'), 'warning');
        return;
      }
      try {
        const response = await fetch(`/api/office/${this.slot}/teams`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            category_id: category.id,
            player1_id: player1Id,
            player2_id: player2Id,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.teamAddFailed'));
        this.planningTeams = Array.isArray(payload.teams) ? payload.teams : this.planningTeams;
        this.planningNewTeam = { player1_id: '', player2_id: '' };
        this.showToast(this.ot('toast.teamAdded'), 'success');
      } catch (error) {
        console.error('Failed to add office team:', error);
        this.showToast(error.message || this.ot('toast.teamAddError'), 'error');
      }
    },

    async deleteOfficeTeam(team) {
      if (!team?.id || !confirm(this.ot('confirm.deleteTeam'))) return;
      if (this.planningTeamAssignments[team.id]) {
        this.showToast(this.ot('toast.teamInGroup'), 'warning');
        return;
      }
      try {
        const response = await fetch(`/api/office/${this.slot}/teams/${team.id}`, {
          method: 'DELETE',
          headers: this.officeHeaders(),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (response.status === 409) {
          this.showToast(payload.error || this.ot('toast.teamInGroup'), 'warning');
          return;
        }
        if (!response.ok) throw new Error(payload.error || this.ot('errors.teamDeleteFailed'));
        this.planningTeams = Array.isArray(payload.teams) ? payload.teams : this.planningTeams;
        const assignments = { ...this.planningTeamAssignments };
        delete assignments[team.id];
        this.planningTeamAssignments = assignments;
        this.showToast(this.ot('toast.teamDeleted'), 'success');
      } catch (error) {
        console.error('Failed to delete office team:', error);
        this.showToast(error.message || this.ot('toast.teamDeleteError'), 'error');
      }
    },

    async addOfficePlayer() {
      const firstName = (this.planningNewPlayer.first_name || '').trim();
      const lastName = (this.planningNewPlayer.last_name || '').trim();
      if (!firstName && !lastName) {
        this.showToast(this.ot('toast.playerNameRequired'), 'warning');
        return;
      }
      try {
        const response = await fetch(`/api/office/${this.slot}/players`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            category: (this.planningNewPlayer.category || '').trim(),
            gender: (this.planningNewPlayer.gender || '').trim(),
            country: (this.planningNewPlayer.country || '').trim(),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || this.ot('errors.playerAddFailed'));
        }
        this.planningPlayers = Array.isArray(payload.players) ? payload.players : this.planningPlayers;
        if (payload.dashboard) this.applyDashboard(payload.dashboard, { notify: false });
        this.planningNewPlayer = {
          first_name: '',
          last_name: '',
          category: this.planningNewPlayer.category || '',
          country: '',
        };
        this.showToast(this.ot('toast.playerAdded'), 'success');
      } catch (error) {
        console.error('Failed to add office player:', error);
        this.showToast(error.message || this.ot('toast.playerAddError'), 'error');
      }
    },
  };
}
