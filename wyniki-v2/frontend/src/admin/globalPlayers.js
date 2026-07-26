export function createGlobalPlayersAdmin() {
  return {
      // Global Players
      globalPlayers: [],
      globalPlayersFilter: { q: '', gender: '', category: '', country: '' },
      editingGlobalId: null,
      editGlobalData: {},
      newGlobalPlayer: { first_name: '', last_name: '', gender: '', birth_date: '', category: '', country: '', notes: '' },
      globalPlayerDetail: null,  // for viewing detail / editing in modal
      addToTournamentGpId: null,  // selecting global player to add to tournament
      addToTournamentCategory: '',
      globalMigrated: false,

     // ===== GLOBAL PLAYERS =====
     async loadGlobalPlayers() {
       try {
         const params = new URLSearchParams();
         if (this.globalPlayersFilter.q) params.set('q', this.globalPlayersFilter.q);
         if (this.globalPlayersFilter.gender) params.set('gender', this.globalPlayersFilter.gender);
         if (this.globalPlayersFilter.category) params.set('category', this.globalPlayersFilter.category);
         if (this.globalPlayersFilter.country) params.set('country', this.globalPlayersFilter.country);
         const url = '/admin/api/global-players' + (params.toString() ? '?' + params : '');
         const r = await fetch(url);
         if (!r.ok) throw new Error('Failed to load');
         this.globalPlayers = await r.json();
       } catch (err) {
         console.error('Failed to load global players:', err);
       }
     },

     async createGlobalPlayer() {
       if (!this.newGlobalPlayer.last_name.trim()) {
         this.showToast('Nazwisko jest wymagane', 'warning');
         return;
       }
       try {
         const r = await fetch('/admin/api/global-players', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(this.newGlobalPlayer),
         });
         if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed'); }
         this.showToast('Zawodnik dodany', 'success');
         this.newGlobalPlayer = { first_name: '', last_name: '', gender: '', birth_date: '', category: '', country: '', notes: '' };
         await this.loadGlobalPlayers();
       } catch (err) {
         this.showToast(err.message || 'Błąd dodawania', 'error');
       }
     },

     editGlobal(gp) {
       this.editingGlobalId = gp.id;
       this.editGlobalData = {
         first_name: gp.first_name || '',
         last_name: gp.last_name || '',
         gender: gp.gender || '',
         birth_date: gp.birth_date || '',
         category: gp.category || '',
         country: gp.country || '',
         notes: gp.notes || '',
       };
     },

     cancelEditGlobal() { this.editingGlobalId = null; },

     async saveGlobal(gpId) {
       try {
         const r = await fetch(`/admin/api/global-players/${gpId}`, {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(this.editGlobalData),
         });
         if (!r.ok) throw new Error('Failed');
         this.editingGlobalId = null;
         this.showToast('Zapisano', 'success');
         await this.loadGlobalPlayers();
       } catch (err) {
         this.showToast('Błąd zapisu', 'error');
       }
     },

     async deleteGlobal(gpId) {
       if (!confirm('Usunąć zawodnika z bazy globalnej?')) return;
       try {
         const r = await fetch(`/admin/api/global-players/${gpId}`, { method: 'DELETE' });
         if (!r.ok) {
           const d = await r.json();
           this.showToast(d.error || 'Błąd usuwania', 'error');
           return;
         }
         this.showToast('Usunięto', 'success');
         await this.loadGlobalPlayers();
       } catch (err) {
         this.showToast('Błąd usuwania', 'error');
       }
     },

     async uploadGlobalPhoto(gpId, event) {
       const file = event.target.files?.[0];
       if (!file) return;
       const formData = new FormData();
       formData.append('photo', file);
       try {
         const r = await fetch(`/admin/api/global-players/${gpId}/photo`, {
           method: 'POST',
           body: formData,
         });
         if (!r.ok) throw new Error('Failed');
         this.showToast('Zdjęcie zapisane', 'success');
         await this.loadGlobalPlayers();
       } catch (err) {
         this.showToast('Błąd uploadu zdjęcia', 'error');
       }
     },

     async deleteGlobalPhoto(gpId) {
       try {
         await fetch(`/admin/api/global-players/${gpId}/photo`, { method: 'DELETE' });
         this.showToast('Zdjęcie usunięte', 'success');
         await this.loadGlobalPlayers();
       } catch (err) { this.showToast('Błąd', 'error'); }
     },

     async migrateGlobalPlayers() {
       if (!confirm('Zmigrować istniejących graczy do bazy globalnej? (jednorazowa operacja)')) return;
       try {
         const r = await fetch('/admin/api/global-players/migrate', { method: 'POST' });
         const d = await r.json();
         this.showToast(d.message, 'success');
         this.globalMigrated = true;
         await this.loadGlobalPlayers();
         if (this.selectedTournament) await this.loadPlayers(this.selectedTournament);
       } catch (err) {
         this.showToast('Błąd migracji', 'error');
       }
     },

     async addGlobalToTournament(gpId) {
       if (!this.selectedTournament) {
         this.showToast('Wybierz turniej', 'warning');
         return;
       }
       try {
         const r = await fetch(`/admin/api/global-players/tournaments/${this.selectedTournament}/add-global`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             global_player_id: gpId,
             category: this.addToTournamentCategory || '',
           }),
         });
         if (!r.ok) {
           const d = await r.json();
           this.showToast(d.error || 'Błąd', 'error');
           return;
         }
         this.showToast('Dodano do turnieju', 'success');
         this.addToTournamentCategory = '';
         await this.loadPlayers(this.selectedTournament);
         await this.loadGlobalPlayers();
       } catch (err) {
         this.showToast('Błąd dodawania', 'error');
       }
     },

     globalPlayerAge(gp) {
       if (!gp.birth_date) return '';
       try {
         const bd = new Date(gp.birth_date);
         const today = new Date();
         let age = today.getFullYear() - bd.getFullYear();
         const m = today.getMonth() - bd.getMonth();
         if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
         return age;
       } catch { return ''; }
     },

     get filteredGlobalPlayers() {
       return this.globalPlayers;  // filtering done server-side
     },
  };
}
