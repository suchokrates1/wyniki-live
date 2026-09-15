import { STANDARD_CATEGORY_KEYS, categoryFilterLabel } from '../shared/categories.js';

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
      // sport classes: history per player, review of a tournament
      classHistoryOpenId: null,
      classHistory: [],
      classHistoryLoading: false,
      classReviewTournamentId: '',
      classReview: null,
      classReviewLoading: false,
      classReviewSaving: false,
      classReviewDraft: {},
      classReviewStatus: '',

     globalPlayerCategoryKeys() {
       return STANDARD_CATEGORY_KEYS;
     },

     globalPlayerCategoryLabel(key) {
       return categoryFilterLabel(key);
     },

     // ===== GLOBAL PLAYERS =====
     async loadGlobalPlayers() {
       try {
         const params = new URLSearchParams();
         if (this.globalPlayersFilter.q) params.set('q', this.globalPlayersFilter.q);
         // "B1K" = class B1, women: the class goes to the server, the sex narrows the gender filter
         const categoryKey = String(this.globalPlayersFilter.category || '').match(/^(B\d+)([KM]?)$/);
         const genderFromCategory = categoryKey?.[2] === 'K' ? 'K' : categoryKey?.[2] === 'M' ? 'M' : '';
         const gender = this.globalPlayersFilter.gender || genderFromCategory;
         if (gender) params.set('gender', gender);
         if (categoryKey) params.set('category', categoryKey[1]);
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

     // ===== SPORT CLASSES =====
     classSourceText(row) {
       if (row.source === 'tournament') return row.tournament_name ? `klasyfikacja na turnieju: ${row.tournament_name}` : 'klasyfikacja na turnieju';
       if (row.source === 'manual') return 'zmiana ręczna w bazie';
       return 'klasa w bazie przed prowadzeniem historii';
     },

     classHistoryText(row) {
       const since = row.effective_date ? `od ${row.effective_date}` : 'od początku';
       const status = row.status === 'provisional' ? ', tymczasowa' : '';
       const change = row.previous_classification ? ` (wcześniej ${row.previous_classification})` : '';
       return `${row.classification} ${since}${change}: ${this.classSourceText(row)}${status}`;
     },

     classHistoryTitle() {
       const gp = this.globalPlayers.find((row) => row.id === this.classHistoryOpenId);
       return `Historia klas: ${gp ? `${gp.first_name} ${gp.last_name}` : ''}`;
     },

     async toggleClassHistory(gp) {
       if (this.classHistoryOpenId === gp.id) {
         this.classHistoryOpenId = null;
         return;
       }
       this.classHistoryOpenId = gp.id;
       this.classHistory = [];
       this.classHistoryLoading = true;
       try {
         const r = await fetch(`/admin/api/global-players/${gp.id}/classifications`);
         if (!r.ok) throw new Error('Failed');
         this.classHistory = (await r.json()).history || [];
       } catch (err) {
         this.showToast('Nie udało się wczytać historii klas', 'error');
       } finally {
         this.classHistoryLoading = false;
       }
     },

     async loadClassReview() {
       this.classReview = null;
       this.classReviewDraft = {};
       this.classReviewStatus = '';
       if (!this.classReviewTournamentId) return;
       this.classReviewLoading = true;
       try {
         const r = await fetch(`/admin/api/global-players/tournaments/${this.classReviewTournamentId}/classification-review`);
         if (!r.ok) throw new Error('Failed');
         this.classReview = await r.json();
         for (const item of this.classReview.items) {
           if (!item.decision) {
             this.classReviewDraft[item.global_player_id] = {
               decision: item.hint === 'reclassification_required' ? 'reclassify' : '',
               classification: item.suggested_class || item.category_classes[0] || '',
             };
           }
         }
         const pending = this.classReview.pending;
         this.classReviewStatus = pending
           ? `Do decyzji: ${pending} ${pending === 1 ? 'zawodnik' : 'zawodników'}.`
           : 'Brak zawodników do decyzji w tym turnieju.';
       } catch (err) {
         this.classReviewStatus = 'Nie udało się wczytać przeglądu klas.';
       } finally {
         this.classReviewLoading = false;
       }
     },

     classReviewChosen() {
       return Object.entries(this.classReviewDraft)
         .filter(([, draft]) => draft.decision)
         .map(([id, draft]) => ({ global_player_id: Number(id), decision: draft.decision, classification: draft.classification }));
     },

     classReviewHint(item) {
       return item.hint === 'reclassification_required'
         ? `Zagrał(a) w kategorii niższej niż klasa ${item.entry_class || item.current_class} — to możliwe tylko po nowej klasyfikacji.`
         : `Grał(a) w kategorii wyższej niż klasa ${item.entry_class || item.current_class} — nowa klasyfikacja albo gra w wyższej kategorii.`;
     },

     classReviewDecisionText(item) {
       if (item.decision === 'reclassify') return `Zapisano: nowa klasa ${item.classification}.`;
       if (item.decision === 'play_up') return 'Zapisano: gra w wyższej kategorii, klasa bez zmian.';
       return 'Zapisano: pominięty.';
     },

     async saveClassReview() {
       const decisions = this.classReviewChosen();
       if (!decisions.length) {
         this.classReviewStatus = 'Wybierz decyzję przy co najmniej jednym zawodniku.';
         return;
       }
       this.classReviewSaving = true;
       try {
         const r = await fetch(`/admin/api/global-players/tournaments/${this.classReviewTournamentId}/classification-review`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ decisions }),
         });
         const payload = await r.json();
         if (!payload.review) throw new Error(payload.error || 'Failed');
         this.classReview = payload.review;
         for (const item of payload.applied) delete this.classReviewDraft[item.global_player_id];
         const failed = payload.errors?.length || 0;
         this.classReviewStatus = `Zapisano decyzje: ${payload.applied.length}.` + (failed ? ` Nie zapisano: ${failed}.` : '') + ` Do decyzji: ${payload.review.pending}.`;
         await this.loadGlobalPlayers();
         this.$nextTick(() => this.$refs.classReviewStatus?.focus());
       } catch (err) {
         this.classReviewStatus = 'Nie udało się zapisać decyzji.';
       } finally {
         this.classReviewSaving = false;
       }
     },

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
