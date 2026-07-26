import { defaultOfficeForm } from './forms.js';

export function createOfficeMatchesView() {
  return {
    ensureDefaultGroupSelection() {
      if (!this.officeNewMatch.group_id && this.officeGroups.length) {
        this.officeNewMatch.group_id = this.officeGroups[0].id;
        this.onOfficeGroupChanged();
      }
    },

    officeSelectedGroup() {
      const groupId = String(this.officeNewMatch.group_id || '');
      return this.officeGroups.find(group => String(group.id) === groupId) || null;
    },

    officeGroupPlayers(groupId = null) {
      const targetGroupId = String(groupId || this.officeNewMatch.group_id || '');
      const group = this.officeGroups.find(item => String(item.id) === targetGroupId);
      return group?.players || [];
    },

    onOfficeGroupChanged() {
      const players = this.officeGroupPlayers();
      this.officeNewMatch.player1_name = players[0]?.name || '';
      this.officeNewMatch.player2_name = players[1]?.name || '';
      this.officeNewMatch.winner_name = '';
    },

    resetOfficeNewMatch(keepGroup = true) {
      const groupId = keepGroup ? this.officeNewMatch.group_id : '';
      this.officeNewMatch = defaultOfficeForm(groupId);
      if (groupId) {
        this.onOfficeGroupChanged();
      }
    },

    openAddMatchModal() {
      this.ensureDefaultGroupSelection();
      this.officeNewMatch = defaultOfficeForm(this.officeNewMatch.group_id);
      this.officeNewMatch.mode = 'group';
      this.officeNewMatch.resultKind = 'group';
      this.officeNewMatch.phase = 'Grupowa';
      this.addMatchOpen = true;
    },

    officeResultKindOptions() {
      return [
        { value: 'group', label: this.ot('modals.resultKindGroup') },
        { value: 'rematch', label: this.ot('phases.groupRematch') },
        { value: 'knockout', label: this.ot('phases.knockout') },
      ];
    },

    onOfficeResultKindChanged() {
      const kind = this.officeNewMatch.resultKind || 'group';
      if (kind === 'knockout') {
        this.officeNewMatch.mode = 'knockout';
        this.officeNewMatch.phase = this.officeNewMatch.phase || this.ot('phases.knockout');
        return;
      }
      this.officeNewMatch.mode = 'group';
      this.officeNewMatch.knockout_slot_id = null;
      this.officeNewMatch.phase = kind === 'rematch' ? 'Grupowa — Rewanż' : 'Grupowa';
    },

    officeAllPlayerNames() {
      const names = new Set();
      for (const player of this.planningPlayers || []) {
        const name = String(player?.name || '').trim();
        if (name) names.add(name);
      }
      for (const group of this.officeGroups || []) {
        for (const player of group.players || []) {
          const name = String(player?.name || '').trim();
          if (name) names.add(name);
        }
      }
      return [...names].sort((left, right) => left.localeCompare(right));
    },

    officeKnockoutPhaseSuggestions() {
      const phases = new Set();
      for (const entry of this.planningSchedule || []) {
        if (this.officeIsKnockoutScheduleEntry(entry)) {
          const phase = String(entry.phase || '').trim();
          if (phase) phases.add(phase);
        }
      }
      for (const slot of this.knockoutMatches?.matches || []) {
        const phase = String(slot.phase || '').trim();
        if (phase) phases.add(phase);
      }
      return [...phases].sort((left, right) => left.localeCompare(right));
    },

    officeIsKnockoutScheduleEntry(entry) {
      if (!entry?.player1_name || !entry?.player2_name || entry?.match_id) return false;
      if (String(entry.source_type || '').toLowerCase() === 'knockout') return true;
      const phase = String(entry.phase || '').toLowerCase();
      if (this.officeNormalizeGroupPhase(entry.phase) === 'Grupowa — Rewanż') return false;
      if (phase.includes('grup')) return false;
      return phase.includes('finał')
        || phase.includes('final')
        || phase.includes('półfina')
        || phase.includes('semif')
        || phase.includes('3.')
        || phase.includes('3rd')
        || phase.includes('puchar')
        || phase.includes('k.-o')
        || phase.includes('knockout')
        || phase.includes('miejsce')
        || phase.includes('platz');
    },

    officeIsGroupScheduleEntry(entry) {
      if (!entry?.player1_name || !entry?.player2_name || entry?.match_id) return false;
      if (this.officeIsKnockoutScheduleEntry(entry)) return false;
      return true;
    },

    officeCanAddResultFromSchedule(entry) {
      return this.officeIsGroupScheduleEntry(entry) || this.officeIsKnockoutScheduleEntry(entry);
    },

    openAddResultFromSchedule(entry) {
      if (this.officeIsKnockoutScheduleEntry(entry)) {
        this.openAddKnockoutResultFromSchedule(entry);
        return;
      }
      this.openAddGroupResultFromSchedule(entry);
    },

    openAddKnockoutResultFromSchedule(entry) {
      this.officeNewMatch = defaultOfficeForm();
      this.officeNewMatch.mode = 'knockout';
      this.officeNewMatch.resultKind = 'knockout';
      this.officeNewMatch.lockedFromSlot = true;
      this.officeNewMatch.schedule_id = entry?.id || null;
      this.officeNewMatch.phase = entry?.phase || this.ot('phases.knockout');
      this.officeNewMatch.player1_name = entry?.player1_name || '';
      this.officeNewMatch.player2_name = entry?.player2_name || '';
      this.officeNewMatch.court_id = entry?.court_id || '';
      this.addMatchOpen = true;
    },

    officeNormalizeGroupPhase(phase) {
      const text = String(phase || '').trim();
      if (!text) return 'Grupowa';
      const lower = text.toLowerCase();
      if (text === 'Grupowa — Rewanż') return text;
      if (lower.includes('rewan') || lower.includes('rematch') || lower.includes('rück') || lower.includes('revanch') || lower.includes('ritorno') || lower.includes('revancha') || lower.includes('replay')) {
        return 'Grupowa — Rewanż';
      }
      return 'Grupowa';
    },

    inferOfficeGroupIdForPlayers(player1Name, player2Name) {
      const names = new Set([player1Name, player2Name].filter(Boolean));
      if (names.size !== 2) return '';
      for (const group of this.officeGroups) {
        const groupNames = new Set((group.players || []).map(player => player.name));
        if ([...names].every(name => groupNames.has(name))) {
          return group.id;
        }
      }
      return '';
    },

    openAddGroupResultFromSchedule(entry) {
      const groupId = entry?.bracket_group_id || this.inferOfficeGroupIdForPlayers(entry?.player1_name, entry?.player2_name);
      const normalizedPhase = this.officeNormalizeGroupPhase(entry?.phase);
      this.officeNewMatch = defaultOfficeForm(groupId);
      this.officeNewMatch.mode = 'group';
      this.officeNewMatch.resultKind = normalizedPhase === 'Grupowa — Rewanż' ? 'rematch' : 'group';
      this.officeNewMatch.lockedFromSlot = true;
      this.officeNewMatch.schedule_id = entry?.id || null;
      this.officeNewMatch.phase = this.officeNormalizeGroupPhase(entry?.phase);
      this.officeNewMatch.player1_name = entry?.player1_name || '';
      this.officeNewMatch.player2_name = entry?.player2_name || '';
      this.officeNewMatch.court_id = entry?.court_id || '';
      this.addMatchOpen = true;
    },

    openAddKnockoutResult(slot) {
      this.officeNewMatch = defaultOfficeForm(this.officeNewMatch.group_id);
      this.officeNewMatch.mode = 'knockout';
      this.officeNewMatch.resultKind = 'knockout';
      this.officeNewMatch.lockedFromSlot = true;
      this.officeNewMatch.knockout_slot_id = slot.slot_id || slot.id || null;
      this.officeNewMatch.schedule_id = slot.schedule_id || null;
      this.officeNewMatch.court_id = slot.court_id || '';
      this.officeNewMatch.phase = slot.phase || this.ot('phases.knockout');
      this.officeNewMatch.player1_name = slot.player1_name || '';
      this.officeNewMatch.player2_name = slot.player2_name || '';
      this.officeNewMatch.winner_name = '';
      this.addMatchOpen = true;
    },

    closeAddMatchModal() {
      this.addMatchOpen = false;
      this.resetOfficeNewMatch(true);
      this.flushPendingOfficeRefresh();
    },

    officeSetsFromForm(form) {
      const sets = [];
      const addSet = (player1Value, player2Value, isSuperTiebreak = false) => {
        if (player1Value === '' || player2Value === '' || player1Value === null || player2Value === null) return;
        const player1Games = Number(player1Value);
        const player2Games = Number(player2Value);
        if (!Number.isFinite(player1Games) || !Number.isFinite(player2Games)) return;
        sets.push({ player1_games: player1Games, player2_games: player2Games, is_super_tiebreak: isSuperTiebreak });
      };
      addSet(form.set1_p1, form.set1_p2);
      addSet(form.set2_p1, form.set2_p2);
      addSet(form.stb_p1, form.stb_p2, true);
      return sets;
    },

    async addOfficeGroupMatch() {
      if (!this.officeNewMatch.group_id || !this.officeNewMatch.player1_name || !this.officeNewMatch.player2_name) {
        this.showToast(this.ot('toast.pickGroupPlayers'), 'warning');
        return;
      }
      if (this.officeNewMatch.player1_name === this.officeNewMatch.player2_name) {
        this.showToast(this.ot('toast.pickTwoPlayers'), 'warning');
        return;
      }
      if (this.officeNewMatch.walkover && !this.officeNewMatch.winner_name) {
        this.showToast(this.ot('toast.walkoverWinnerRequired'), 'warning');
        return;
      }

      try {
        const response = await fetch(`/api/office/${this.slot}/group-matches`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            group_id: this.officeNewMatch.group_id,
            schedule_id: this.officeNewMatch.schedule_id,
            player1_name: this.officeNewMatch.player1_name,
            player2_name: this.officeNewMatch.player2_name,
            phase: this.officeNormalizeGroupPhase(this.officeNewMatch.phase),
            court_id: this.officeNewMatch.court_id,
            walkover: this.officeNewMatch.walkover,
            winner_name: this.officeNewMatch.winner_name,
            sets: this.officeSetsFromForm(this.officeNewMatch),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || this.ot('errors.resultFailed'));
        }
        this.applyDashboard(payload.dashboard, { notify: false });
        this.closeAddMatchModal();
        const generated = payload.knockout_generation?.status === 'ok' ? this.ot('toast.knockoutGenerated') : '';
        this.showToast(`${this.ot('toast.resultSaved')}${generated}`, 'success');
      } catch (error) {
        console.error('Failed to add office result:', error);
        this.showToast(error.message || this.ot('toast.addResultError'), 'error');
      }
    },

    async addOfficeKnockoutMatch() {
      const phase = String(this.officeNewMatch.phase || '').trim();
      if (!phase) {
        this.showToast(this.ot('toast.knockoutPhaseRequired'), 'warning');
        return;
      }
      if (!this.officeNewMatch.player1_name || !this.officeNewMatch.player2_name) {
        this.showToast(this.ot('toast.knockoutSlotIncomplete'), 'warning');
        return;
      }
      if (this.officeNewMatch.player1_name === this.officeNewMatch.player2_name) {
        this.showToast(this.ot('toast.pickTwoPlayers'), 'warning');
        return;
      }
      if (this.officeNewMatch.walkover && !this.officeNewMatch.winner_name) {
        this.showToast(this.ot('toast.walkoverWinnerRequired'), 'warning');
        return;
      }

      try {
        const response = await fetch(`/api/office/${this.slot}/knockout-matches`, {
          method: 'POST',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            schedule_id: this.officeNewMatch.schedule_id,
            knockout_slot_id: this.officeNewMatch.knockout_slot_id,
            court_id: this.officeNewMatch.court_id,
            phase,
            player1_name: this.officeNewMatch.player1_name,
            player2_name: this.officeNewMatch.player2_name,
            walkover: this.officeNewMatch.walkover,
            winner_name: this.officeNewMatch.winner_name,
            sets: this.officeSetsFromForm(this.officeNewMatch),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || this.ot('errors.knockoutFailed'));
        }
        this.applyDashboard(payload.dashboard, { notify: false });
        this.closeAddMatchModal();
        this.showToast(this.ot('toast.knockoutResultSaved'), 'success');
      } catch (error) {
        console.error('Failed to add office knockout result:', error);
        this.showToast(error.message || this.ot('toast.knockoutResultError'), 'error');
      }
    },

    async addOfficeMatchResult() {
      if (this.officeNewMatch.mode === 'knockout') {
        await this.addOfficeKnockoutMatch();
        return;
      }
      await this.addOfficeGroupMatch();
    },

    officeKnockoutStatusLabel(slot) {
      if (slot?.winner_name) return this.ot('status.knockoutFinished');
      if (slot?.status === 'in_progress') return this.ot('status.inProgress');
      if (!slot?.ready) return this.ot('status.knockoutWaiting');
      if (slot?.status === 'planned') return this.ot('status.knockoutPlanned');
      return this.ot('status.knockoutReady');
    },

    officeKnockoutCanAddResult(slot) {
      return !!slot?.ready && !slot?.winner_name && (!!slot?.schedule_id || !!slot?.slot_id);
    },

    officeMatchById(matchId) {
      const targetId = Number(matchId || 0);
      if (!targetId) return null;
      return this.officeMatches.find(match => Number(match.match_id || match.id || 0) === targetId) || null;
    },

    startOfficeEditFromKnockout(slot) {
      const match = this.officeMatchById(slot?.match_id);
      if (!match) {
        this.showToast(this.ot('toast.noHistoryEntry'), 'warning');
        return;
      }
      this.startOfficeEdit(match);
    },

    startOfficeEdit(match) {
      const sets = match.sets_history || [];
      this.officeEditingMatch = {
        id: match.id,
        source: match.source || 'match',
        player1_name: match.player1_name,
        player2_name: match.player2_name,
        walkover: false,
        winner_name: match.winner_name || '',
        set1_p1: sets[0]?.player1_games ?? '',
        set1_p2: sets[0]?.player2_games ?? '',
        set2_p1: sets[1]?.player1_games ?? '',
        set2_p2: sets[1]?.player2_games ?? '',
        stb_p1: sets[2]?.player1_games ?? '',
        stb_p2: sets[2]?.player2_games ?? '',
      };
      this.editMatchOpen = true;
    },

    closeEditModal() {
      this.officeEditingMatch = null;
      this.editMatchOpen = false;
      this.flushPendingOfficeRefresh();
    },

    async saveOfficeMatchEdit() {
      if (!this.officeEditingMatch?.id) return;
      if (this.officeEditingMatch.walkover && !this.officeEditingMatch.winner_name) {
        this.showToast(this.ot('toast.walkoverWinnerRequired'), 'warning');
        return;
      }

      try {
        const response = await fetch(`/api/office/${this.slot}/matches/${this.officeEditingMatch.id}`, {
          method: 'PUT',
          headers: this.officeHeaders(),
          body: JSON.stringify({
            source: this.officeEditingMatch.source || 'match',
            walkover: this.officeEditingMatch.walkover,
            winner_name: this.officeEditingMatch.winner_name,
            sets: this.officeSetsFromForm(this.officeEditingMatch),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.logout(this.ot('errors.sessionExpired'));
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || this.ot('errors.correctionFailed'));
        }
        this.applyDashboard(payload.dashboard, { notify: false });
        this.closeEditModal();
        this.showToast(this.ot('toast.resultCorrected'), 'success');
      } catch (error) {
        console.error('Failed to update office result:', error);
        this.showToast(error.message || this.ot('toast.correctionError'), 'error');
      }
    },

    officeMatchPhase(match) {
      if (match.group_name) return this.officeDisplayLabel(match.group_name);
      return this.officeDisplayLabel(match.phase) || this.ot('phases.match');
    },

    officePhaseTone(match) {
      const phase = (match.phase || '').toLowerCase();
      if (match.group_name || phase.startsWith('grupowa')) return 'office-chip-group';
      if (phase) return 'office-chip-knockout';
      return 'office-chip-neutral';
    },

    groupCompletionLabel(group) {
      if (!group) return this.ot('status.noData');
      if (group.complete) return this.ot('status.complete');
      return `${group.finished_matches}/${group.expected_matches}`;
    },

    formatOfficeMatchTime(match) {
      const rawValue = match?.updated_at || match?.created_at || '';
      if (!rawValue) return '—';
      const parsedDate = new Date(rawValue);
      if (Number.isNaN(parsedDate.getTime())) return rawValue;
      return new Intl.DateTimeFormat(this.officeLocale(), {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(parsedDate);
    },

    officeMatchWinner(match) {
      if (!match) return null;
      if (match.winner_name) {
        if (match.winner_name === match.player1_name) return 'A';
        if (match.winner_name === match.player2_name) return 'B';
      }
      const player1Sets = Number(match.player1_sets || 0);
      const player2Sets = Number(match.player2_sets || 0);
      if (player1Sets > player2Sets) return 'A';
      if (player2Sets > player1Sets) return 'B';
      return null;
    },

    officeMatchSets(match) {
      if (!Array.isArray(match?.sets_history)) return [];
      const sets = [];
      for (const setInfo of match.sets_history) {
        let a = Number(setInfo?.player1_games ?? 0);
        let b = Number(setInfo?.player2_games ?? 0);
        const tb = setInfo?.tiebreak_loser_points ?? null;
        const isSuperTB = !!setInfo?.is_super_tiebreak;
        if (isSuperTB && tb !== null && tb !== undefined) {
          const winnerPts = Math.max(10, Number(tb) + 2);
          if (a > b) {
            a = winnerPts;
            b = Number(tb);
          } else {
            a = Number(tb);
            b = winnerPts;
          }
        }
        sets.push({ a, b, tb: isSuperTB ? null : tb, isSuperTB });
      }
      return sets;
    },

    officeMatchScore(match) {
      return match.score_text || `${match.player1_sets || 0}:${match.player2_sets || 0}`;
    },
  };
}
