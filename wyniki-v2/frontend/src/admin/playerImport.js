import { planningDivisionKey as sharedPlanningDivisionKey } from '../shared/categories.js';

/** Importing a start list: the pasted text, the preview the office corrects, and the confirm. */

export function createPlayerImportAdmin() {
  return {
    importText: '',

    importPreview: {
      players: [],
      count: 0,
      needs_attention_count: 0,
    },

      async importPlayers() {
        if (!this.selectedTournament || !this.importText.trim()) {
     this.showToast('Wprowadź dane graczy', 'warning');
     return;
        }
        
        try {
     const response = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players/parse-import`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ text: this.importText }),
     });
     
     if (!response.ok) throw new Error('Failed to import players');

     const payload = await response.json();
     this.importPreview = {
       players: Array.isArray(payload.players) ? payload.players : [],
       count: Number(payload.count || 0),
       needs_attention_count: Number(payload.needs_attention_count || 0),
     };
     this.$nextTick(() => this.$refs.importPreviewModal?.showModal());
        } catch (err) {
     console.error('Failed to import players:', err);
     this.showToast('Błąd importu graczy', 'error');
        }
      },

      normalizeImportGender(value) {
        const raw = String(value || '').trim().toUpperCase();
        if (raw === 'K' || raw === 'M') return raw;
        return '';
      },

      normalizeImportCategory(value) {
        return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      },

      normalizeImportCountry(value) {
        return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
      },

      importPreviewRowKey(player, index) {
        return `${player?.line_number || 'row'}-${player?.raw_line || ''}-${index}`;
      },

      importPreviewDisplayName(player) {
        return `${player?.first_name || ''} ${player?.last_name || ''}`.trim() || player?.name || '';
      },

      importStartGroup(player) {
        if (player?.start_group) return player.start_group;
        return sharedPlanningDivisionKey(
     player?.category || '',
     player?.gender || '',
     this.mixedBandsForTournament(this.selectedTournament),
        );
      },

      importPreviewSummary() {
        const grouped = new Map();
        for (const player of this.importPreview.players || []) {
     const startGroup = this.importStartGroup(player);
     if (!grouped.has(startGroup)) {
       grouped.set(startGroup, { start_group: startGroup, count: 0, players: [] });
     }
     const bucket = grouped.get(startGroup);
     bucket.count += 1;
     bucket.players.push(this.importPreviewDisplayName(player));
        }
        return [...grouped.values()].sort((left, right) => {
     if (left.start_group === 'NIEPRZYPISANI') return 1;
     if (right.start_group === 'NIEPRZYPISANI') return -1;
     return left.start_group.localeCompare(right.start_group, 'pl');
        });
      },

      importPreviewWarnings(player) {
        const warnings = [];
        const firstName = String(player?.first_name || '').trim();
        const lastName = String(player?.last_name || '').trim();
        const country = String(player?.country || '').trim().toUpperCase();

        if (!firstName && !lastName) warnings.push('Brak imienia i nazwiska');
        else if (!firstName || !lastName) warnings.push('Sprawdz podzial imienia i nazwiska');
        if (!this.normalizeImportCategory(player?.category || '')) warnings.push('Brak kategorii startowej');
        if (!this.normalizeImportGender(player?.gender || '')) warnings.push('Brak podzialu K/M');
        if (!country) warnings.push('Brak kraju');
        else if (this.normalizeImportCountry(country) !== country) warnings.push('Kraj powinien miec kod 2-literowy');
        return [...new Set(warnings)];
      },

      normalizeImportPreviewPlayer(player) {
        player.first_name = String(player?.first_name || '').trim();
        player.last_name = String(player?.last_name || '').trim();
        player.category = this.normalizeImportCategory(player?.category || '');
        player.gender = this.normalizeImportGender(player?.gender || '');
        player.country = this.normalizeImportCountry(player?.country || '');
      },

      removeImportPreviewPlayer(index) {
        this.importPreview.players.splice(index, 1);
      },

      closeImportPreview() {
        this.$refs.importPreviewModal?.close();
      },

      async confirmImportPlayers() {
        if (!this.selectedTournament || !(this.importPreview.players || []).length) {
     this.showToast('Brak graczy do importu', 'warning');
     return;
        }

        try {
     const players = this.importPreview.players.map(player => {
       this.normalizeImportPreviewPlayer(player);
       return {
         name: this.importPreviewDisplayName(player),
         first_name: player.first_name || '',
         last_name: player.last_name || '',
         category: player.category || '',
         gender: player.gender || '',
         country: player.country || '',
       };
     });

     const response = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players/bulk`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ players }),
     });

     if (!response.ok) throw new Error('Failed to import players');

     this.showToast(`Zaimportowano ${players.length} graczy`, 'success');
     this.importText = '';
     this.importPreview = { players: [], count: 0, needs_attention_count: 0 };
     this.closeImportPreview();
     await this.loadPlayers(this.selectedTournament);
        } catch (err) {
     console.error('Failed to confirm import players:', err);
     this.showToast('Błąd importu graczy', 'error');
        }
      },
  };
}
