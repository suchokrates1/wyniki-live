export function createOfficeTabAdmin() {
  return {
      // Tournament office dashboard
      officeTournamentId: null,
      officeDashboard: null,
      officeEventSource: null,
      officeSseReconnectTimer: null,
      officeSseRefreshTimer: null,
      officeFallbackPollTimer: null,
      officeSseFailures: 0,
      officeNewMatch: {
        group_id: '',
        player1_name: '',
        player2_name: '',
        walkover: false,
        winner_name: '',
        set1_p1: 4,
        set1_p2: 0,
        set2_p1: 4,
        set2_p2: 0,
        stb_p1: '',
        stb_p2: '',
      },
      officeEditingMatch: null,

     // ===== TOURNAMENT OFFICE =====
     async openOfficeDashboard(tournamentId = null) {
       this.activeTab = 'office';
       if (tournamentId) this.officeTournamentId = tournamentId;
       if (!this.officeTournamentId) {
         this.officeTournamentId = this.activeTournamentsList()[0]?.id || null;
       }
       if (this.officeTournamentId) {
         await this.loadOfficeDashboard();
         this.connectAdminOfficeSSE();
       } else {
         this.stopAdminOfficeSSE();
       }
     },

     connectAdminOfficeSSE() {
       if (this.activeTab !== 'office' || !this.officeTournamentId || typeof EventSource === 'undefined') {
         this.stopAdminOfficeSSE();
         return;
       }
       this.stopAdminOfficeSSE({ keepFallback: true });
       const tournamentId = this.officeTournamentId;
       const source = new EventSource(`/admin/api/tournaments/${tournamentId}/office/stream`);
       this.officeEventSource = source;

       source.addEventListener('connected', () => {
         this.officeSseFailures = 0;
         this.stopAdminOfficeFallbackPoll();
       });
       source.addEventListener('office_invalidate', () => this.queueAdminOfficeSSERefresh());
       source.onerror = () => {
         if (this.officeEventSource !== source) return;
         source.close();
         this.officeEventSource = null;
         this.officeSseFailures += 1;
         this.startAdminOfficeFallbackPoll();
         const delay = Math.min(30000, 1000 * (2 ** Math.min(this.officeSseFailures, 5)));
         window.clearTimeout(this.officeSseReconnectTimer);
         this.officeSseReconnectTimer = window.setTimeout(() => this.connectAdminOfficeSSE(), delay);
       };
     },

     stopAdminOfficeSSE({ keepFallback = false } = {}) {
       if (this.officeEventSource) this.officeEventSource.close();
       this.officeEventSource = null;
       window.clearTimeout(this.officeSseReconnectTimer);
       window.clearTimeout(this.officeSseRefreshTimer);
       this.officeSseReconnectTimer = null;
       this.officeSseRefreshTimer = null;
       if (!keepFallback) this.stopAdminOfficeFallbackPoll();
     },

     startAdminOfficeFallbackPoll() {
       if (this.officeFallbackPollTimer || this.activeTab !== 'office' || !this.officeTournamentId) return;
       const poll = () => {
         if (this.activeTab === 'office' && this.officeTournamentId && !document.hidden) {
           this.loadOfficeDashboard(false);
         }
       };
       poll();
       this.officeFallbackPollTimer = window.setInterval(poll, 12000);
     },

     stopAdminOfficeFallbackPoll() {
       if (this.officeFallbackPollTimer) window.clearInterval(this.officeFallbackPollTimer);
       this.officeFallbackPollTimer = null;
     },

     queueAdminOfficeSSERefresh() {
       window.clearTimeout(this.officeSseRefreshTimer);
       this.officeSseRefreshTimer = window.setTimeout(() => {
         if (this.activeTab === 'office' && this.officeTournamentId) {
           this.loadOfficeDashboard(false);
         }
       }, 200);
     },

     async loadOfficeDashboard(showLoading = true) {
       if (!this.officeTournamentId) return;
       if (showLoading) this.loading.office = true;
       try {
         const response = await fetch(`/admin/api/tournaments/${this.officeTournamentId}/office`);
         if (!response.ok) throw new Error('Failed to load office dashboard');
         this.officeDashboard = await response.json();
         if (!this.officeNewMatch.group_id && this.officeDashboard.progress?.groups?.length) {
           this.officeNewMatch.group_id = this.officeDashboard.progress.groups[0].id;
           this.onOfficeGroupChanged();
         }
       } catch (err) {
         console.error('Failed to load office dashboard:', err);
         this.showToast('Błąd ładowania biura turnieju', 'error');
       } finally {
         if (showLoading) this.loading.office = false;
       }
     },

     officeProgressPercent() {
       const progress = this.officeDashboard?.progress;
       if (!progress?.expected_matches) return 0;
       return Math.min(100, Math.round((progress.finished_matches / progress.expected_matches) * 100));
     },

     officeKnockout() {
       return this.officeDashboard?.progress?.knockout || {
         expected_matches: 0,
         finished_matches: 0,
         remaining_matches: 0,
         ready_matches: 0,
         matches: [],
       };
     },

     officeKnockoutMatches() {
       return this.officeKnockout().matches || [];
     },

     officeKnockoutStatusLabel(slot) {
       if (slot?.winner_name) return 'Zakończony';
       if (slot?.status === 'in_progress') return 'W toku';
       if (slot?.status === 'planned') return 'Zaplanowany';
       if (slot?.ready) return 'Gotowy';
       return 'Czeka';
     },

     officeScheduleLabel(slot) {
       const day = slot?.day_date || 'bez daty';
       const time = slot?.scheduled_time ? ` ${slot.scheduled_time}` : '';
       const court = slot?.court_label || slot?.court_id || 'kort do ustalenia';
       return `${day}${time}, ${court}`;
     },

     officeSelectedGroup() {
       const groupId = String(this.officeNewMatch.group_id || '');
       return (this.officeDashboard?.progress?.groups || []).find(group => String(group.id) === groupId) || null;
     },

     officeGroupPlayers(groupId = null) {
       const targetGroupId = String(groupId || this.officeNewMatch.group_id || '');
       const group = (this.officeDashboard?.progress?.groups || []).find(item => String(item.id) === targetGroupId);
       return group?.players || [];
     },

     officeSelectedGroupIsDoubles() {
       return this.officeGroupPlayers().some((player) => player?.team_id);
     },

     officeCompetitorLabel(side) {
       const doubles = this.officeSelectedGroupIsDoubles();
       if (side === 1) return doubles ? 'Para 1' : 'Zawodnik 1';
       return doubles ? 'Para 2' : 'Zawodnik 2';
     },

     onOfficeGroupChanged() {
       const players = this.officeGroupPlayers();
       this.officeNewMatch.player1_name = players[0]?.name || '';
       this.officeNewMatch.player2_name = players[1]?.name || '';
       this.officeNewMatch.winner_name = '';
     },

     resetOfficeNewMatch(keepGroup = true) {
       const groupId = keepGroup ? this.officeNewMatch.group_id : '';
       this.officeNewMatch = {
         group_id: groupId,
         player1_name: '',
         player2_name: '',
         walkover: false,
         winner_name: '',
         set1_p1: 4,
         set1_p2: 0,
         set2_p1: 4,
         set2_p2: 0,
         stb_p1: '',
         stb_p2: '',
       };
       if (groupId) this.onOfficeGroupChanged();
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
       if (!this.officeTournamentId || !this.officeNewMatch.group_id || !this.officeNewMatch.player1_name || !this.officeNewMatch.player2_name) {
         this.showToast(this.officeSelectedGroupIsDoubles() ? 'Wybierz grupę i pary' : 'Wybierz grupę i zawodników', 'warning');
         return;
       }
       if (this.officeNewMatch.player1_name === this.officeNewMatch.player2_name) {
         this.showToast(this.officeSelectedGroupIsDoubles() ? 'Wybierz dwie różne pary' : 'Wybierz dwóch różnych zawodników', 'warning');
         return;
       }
       if (this.officeNewMatch.walkover && !this.officeNewMatch.winner_name) {
         this.showToast('Przy walkowerze wskaż zwycięzcę', 'warning');
         return;
       }

       try {
         const response = await fetch(`/admin/api/tournaments/${this.officeTournamentId}/office/group-matches`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             group_id: this.officeNewMatch.group_id,
             player1_name: this.officeNewMatch.player1_name,
             player2_name: this.officeNewMatch.player2_name,
             walkover: this.officeNewMatch.walkover,
             winner_name: this.officeNewMatch.winner_name,
             sets: this.officeSetsFromForm(this.officeNewMatch),
           }),
         });
         const payload = await response.json().catch(() => ({}));
         if (!response.ok) throw new Error(payload.error || 'Failed to add result');
         this.officeDashboard = payload.dashboard;
         this.resetOfficeNewMatch(true);
         const generated = payload.knockout_generation?.status === 'ok' ? ' Drabinka pucharowa została wygenerowana.' : '';
         this.showToast('Wynik dodany.' + generated, 'success');
       } catch (err) {
         console.error('Failed to add office result:', err);
         this.showToast(err.message || 'Błąd dodawania wyniku', 'error');
       }
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
     },

     cancelOfficeEdit() {
       this.officeEditingMatch = null;
     },

     async saveOfficeMatchEdit() {
       if (!this.officeTournamentId || !this.officeEditingMatch?.id) return;
       if (this.officeEditingMatch.walkover && !this.officeEditingMatch.winner_name) {
         this.showToast('Przy walkowerze wskaż zwycięzcę', 'warning');
         return;
       }
       try {
         const response = await fetch(`/admin/api/tournaments/${this.officeTournamentId}/office/matches/${this.officeEditingMatch.id}`, {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             source: this.officeEditingMatch.source || 'match',
             walkover: this.officeEditingMatch.walkover,
             winner_name: this.officeEditingMatch.winner_name,
             sets: this.officeSetsFromForm(this.officeEditingMatch),
           }),
         });
         const payload = await response.json().catch(() => ({}));
         if (!response.ok) throw new Error(payload.error || 'Failed to update result');
         this.officeDashboard = payload.dashboard;
         this.officeEditingMatch = null;
         this.showToast('Wynik poprawiony', 'success');
       } catch (err) {
         console.error('Failed to update office result:', err);
         this.showToast(err.message || 'Błąd korekty wyniku', 'error');
       }
     },

     officeMatchPhase(match) {
       if (match.group_name) return match.group_name;
       return match.phase || 'Mecz';
     },

     formatOfficeMatchTime(match) {
       const rawValue = match?.updated_at || match?.created_at || '';
       if (!rawValue) return '—';
       const parsedDate = new Date(rawValue);
       if (Number.isNaN(parsedDate.getTime())) return rawValue;
       return new Intl.DateTimeFormat('pl-PL', {
         year: 'numeric',
         month: '2-digit',
         day: '2-digit',
         hour: '2-digit',
         minute: '2-digit',
       }).format(parsedDate);
     },

     officeMatchScore(match) {
       return match.score_text || `${match.player1_sets || 0}:${match.player2_sets || 0}`;
     },
  };
}
