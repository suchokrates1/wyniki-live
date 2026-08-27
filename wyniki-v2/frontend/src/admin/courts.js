export function createCourtsAdmin() {
  return {
      // Courts
      courts: [],
      newCourtId: '',
      newCourtPin: '',
      editingCourt: null,
      editCourtId: '',
      courtTournamentFilterOpen: false,
      selectedCourtTournamentIds: [],

     get availableCourtTournamentOptions() {
       const counts = new Map();
       this.courts.forEach((court) => {
         const rawId = court.tournament_id;
         const tournamentId = rawId == null ? '__none__' : String(rawId);
         if (tournamentId !== '__none__' && !this.isActiveTournamentId(tournamentId)) {
           return;
         }
         const existing = counts.get(tournamentId);
         if (existing) {
           existing.count += 1;
           return;
         }
         counts.set(tournamentId, {
           id: tournamentId,
           name: court.tournament_name || 'Bez turnieju',
           count: 1,
         });
       });
       return Array.from(counts.values())
         .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
     },

     get visibleCourtGroups() {
       const selected = new Set(this.selectedCourtTournamentIds.map(String));
       const groups = new Map();
       this.courts.forEach((court) => {
         const tournamentId = court.tournament_id == null ? '__none__' : String(court.tournament_id);
         if (tournamentId !== '__none__' && !this.isActiveTournamentId(tournamentId)) return;
         if (selected.size && !selected.has(tournamentId)) return;
         if (!groups.has(tournamentId)) {
           groups.set(tournamentId, {
             id: tournamentId,
             name: court.tournament_name || 'Bez turnieju',
             courts: [],
           });
         }
         groups.get(tournamentId).courts.push(court);
       });

       return Array.from(groups.values())
         .map((group) => ({
           ...group,
           courts: group.courts.sort((a, b) => {
             const orderA = Number(a.display_order || 0);
             const orderB = Number(b.display_order || 0);
             if (orderA !== orderB) return orderA - orderB;
             return String(a.name || a.kort_id).localeCompare(String(b.name || b.kort_id), 'pl');
           }),
         }))
         .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
     },

     get selectedCourtTournamentSummary() {
       if (!this.selectedCourtTournamentIds.length) {
         return 'Wszystkie turnieje';
       }
       if (this.selectedCourtTournamentIds.length === 1) {
         const selectedId = String(this.selectedCourtTournamentIds[0]);
         const selected = this.availableCourtTournamentOptions.find(option => option.id === selectedId);
         return selected?.name || '1 turniej';
       }
       return `${this.selectedCourtTournamentIds.length} turnieje`;
     },

    // ===== COURTS =====
    async loadCourts() {
      this.loading.courts = true;
      try {
        const response = await fetch('/admin/api/courts');
        if (!response.ok) throw new Error('Failed to load courts');
        this.courts = await response.json();
        this.syncSelectedCourtTournamentIds();
        // Set default addElCourtId to first court if not set
        if (this.courts.length && !this.courts.find(c => String(c.kort_id) === this.addElCourtId)) {
          this.addElCourtId = String(this.courts[0].kort_id);
        }
      } catch (err) {
        console.error('Failed to load courts:', err);
        this.showToast('Błąd ładowania kortów', 'error');
      } finally {
        this.loading.courts = false;
      }
    },

    async refreshCourts() {
      await this.loadCourts();
      this.showToast('Korty odświeżone', 'success');
    },

    syncSelectedCourtTournamentIds() {
      const availableIds = new Set(this.availableCourtTournamentOptions.map(option => String(option.id)));
      this.selectedCourtTournamentIds = this.selectedCourtTournamentIds.filter(id => availableIds.has(String(id)));
      if (!this.selectedCourtTournamentIds.length) {
        this.selectedCourtTournamentIds = this.availableCourtTournamentOptions
          .filter(option => option.id !== '__none__')
          .map(option => String(option.id));
      }
    },

    toggleCourtTournamentSelection(tournamentId) {
      const normalizedId = String(tournamentId);
      if (this.selectedCourtTournamentIds.includes(normalizedId)) {
        this.selectedCourtTournamentIds = this.selectedCourtTournamentIds.filter(id => id !== normalizedId);
        return;
      }
      this.selectedCourtTournamentIds = [...this.selectedCourtTournamentIds, normalizedId];
    },

    selectAllCourtTournaments() {
      this.selectedCourtTournamentIds = this.availableCourtTournamentOptions.map(option => String(option.id));
    },

    clearCourtTournamentSelection() {
      this.selectedCourtTournamentIds = [];
    },

    async updateCourtPin(kortId, pin) {
      try {
        // Validate PIN format
        if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
          this.showToast('PIN musi mieć 4 cyfry', 'warning');
          await this.loadCourts(); // Reload to reset invalid input
          return;
        }
        
        const response = await fetch(`/admin/api/courts/${kortId}/pin`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: pin || null }),
        });
        
        if (!response.ok) throw new Error('Failed to update PIN');
        
        this.showToast(`PIN dla kortu ${kortId} zaktualizowany`, 'success');
        await this.loadCourts();
      } catch (err) {
        console.error('Failed to update PIN:', err);
        this.showToast('Błąd aktualizacji PIN', 'error');
      }
    },

    async addCourt() {
      if (!this.newCourtId) {
        this.showToast('Wprowadź ID kortu', 'warning');
        return;
      }
      
      // Validate PIN if provided
      if (this.newCourtPin && (this.newCourtPin.length !== 4 || !/^\d{4}$/.test(this.newCourtPin))) {
        this.showToast('PIN musi mieć 4 cyfry', 'warning');
        return;
      }
      
      try {
        const response = await fetch('/admin/api/courts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kort_id: this.newCourtId,
            pin: this.newCourtPin || null,
          }),
        });
        
        if (!response.ok) throw new Error('Failed to add court');
        
        const addedId = this.newCourtId;
        this.showToast(`Kort ${addedId} dodany`, 'success');
        this.newCourtId = '';
        this.newCourtPin = '';
        await this.loadCourts();

        // Auto-add scoreboard element to all overlay presets
        this._addCourtToOverlays(addedId);
      } catch (err) {
        console.error('Failed to add court:', err);
        this.showToast('Błąd dodawania kortu', 'error');
      }
    },

    startEdit(kortId) {
      this.editingCourt = kortId;
      this.editCourtId = kortId;
    },

    cancelEdit() {
      this.editingCourt = null;
      this.editCourtId = '';
    },

    async saveCourt(oldKortId) {
      if (!this.editCourtId) {
        this.showToast('ID kortu nie może być puste', 'warning');
        return;
      }
      
      if (this.editCourtId === oldKortId) {
        this.cancelEdit();
        return;
      }
      
      try {
        const response = await fetch(`/admin/api/courts/${oldKortId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kort_id: this.editCourtId }),
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to rename court');
        }
        
        this.showToast(`Kort ${oldKortId} zmieniono na ${this.editCourtId}`, 'success');
        this.cancelEdit();
        await this.loadCourts();
      } catch (err) {
        console.error('Failed to rename court:', err);
        this.showToast(err.message || 'Błąd zmiany nazwy kortu', 'error');
      }
    },

    async deleteCourt(kortId) {
      if (!confirm(`Czy na pewno chcesz usunąć Kort ${kortId}?`)) {
        return;
      }
      
      try {
        const response = await fetch(`/admin/api/courts/${kortId}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) throw new Error('Failed to delete court');
        
        this.showToast(`Kort ${kortId} usunięty`, 'success');
        await this.loadCourts();

        // Auto-remove elements for this court from all overlay presets
        this._removeCourtFromOverlays(kortId);
      } catch (err) {
        console.error('Failed to delete court:', err);
        this.showToast('Błąd usuwania kortu', 'error');
      }
    },

      batteryIndicator(court) {
     if (!court || court.battery_level == null) return '<span class="text-base-content/30">—</span>';
     const lvl = court.battery_level;
     const charging = court.is_charging;
     let color = lvl > 50 ? '#22c55e' : lvl > 20 ? '#eab308' : '#ef4444';
     const icon = charging
       ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="10" x2="23" y2="14"/><polyline points="11 10 9 13 13 13 11 16" fill="' + color + '" stroke="' + color + '"/></svg>'
       : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="10" x2="23" y2="14"/><rect x="2" y="7" width="' + Math.round(lvl * 16 / 100) + '" height="10" fill="' + color + '" rx="1" opacity="0.5"/></svg>';
     return '<span class="inline-flex items-center gap-1" title="' + lvl + '%' + (charging ? ' (ładowanie)' : '') + '">' + icon + ' <span style="color:' + color + ';font-weight:600;font-size:0.85rem">' + lvl + '%</span></span>';
      },

      courtStatusInfo(kortId) {
     const cd = this.courtData[kortId];
     if (!cd || !cd.match_status || !cd.match_status.active) {
       return '<span class="badge badge-ghost">Wolny</span>';
     }
     const a = cd.A || {};
     const b = cd.B || {};
     const active = cd.match_status?.active || false;
     const curSet = cd.current_set || 1;
     const readSetValue = (playerState, setIdx) => {
       if (active && setIdx > curSet) return 0;
       return playerState[`set${setIdx}`] || 0;
     };
     const nameA = a.surname || '-';
     const nameB = b.surname || '-';
     // Build score string: sets (e.g. "6:3 4:2") + current games
     let sets = [];
     if (readSetValue(a, 1) + readSetValue(b, 1) > 0) sets.push(readSetValue(a, 1) + ':' + readSetValue(b, 1));
     if (readSetValue(a, 2) + readSetValue(b, 2) > 0) sets.push(readSetValue(a, 2) + ':' + readSetValue(b, 2));
     if (readSetValue(a, 3) + readSetValue(b, 3) > 0) sets.push(readSetValue(a, 3) + ':' + readSetValue(b, 3));
     const games = (a.current_games || 0) + ':' + (b.current_games || 0);
     const pts = (a.points || '0') + ':' + (b.points || '0');
     const score = (sets.length ? sets.join(' ') + ' / ' : '') + games + ' (' + pts + ')';
     return '<div class="flex flex-col gap-0.5">'
       + '<span class="badge badge-success badge-sm">W grze</span>'
       + '<span class="text-xs font-semibold">' + nameA + ' vs ' + nameB + '</span>'
       + '<span class="text-xs opacity-70">' + score + '</span>'
       + '</div>';
      },

      async resetCourt(kortId) {
     if (!confirm('Czy na pewno chcesz zresetować mecz na korcie ' + kortId + '? Wszystkie dane meczu zostaną usunięte.')) return;
     try {
       const r = await fetch('/admin/api/courts/' + kortId + '/reset', { method: 'POST' });
       if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Reset failed'); }
       this.showToast('Kort ' + kortId + ' zresetowany', 'success');
     } catch (err) {
       console.error('Reset court failed:', err);
       this.showToast('Błąd resetowania kortu: ' + err.message, 'error');
     }
      },
  };
}
