/** Tournament categories: the presets, the custom ones, and what is confirmed for a tournament. */

export function createTournamentCategoriesAdmin() {
  return {
      adminTournamentCategories: [],

      adminCategoryPresetSelected: {},

      adminCategoryPresetDoubles: {},

      adminCategoryCustomLabel: '',

      adminCategoryCustomHints: '',

      adminCategoryCustomDoubles: false,

      adminCategoryEditId: null,

      adminCategoryEditLabel: '',

      adminCategorySetupOpen: true,

      newCategoryPresetSelected: { B1K: true, B1M: true, B2K: true, B2M: true, B3K: true, B3M: true, B4K: true, B4M: true },

      newCategoryPresetDoubles: {},

      newCategoryCustomLabel: '',

      newCategoryCustomHints: '',

      newCategoryCustomDoubles: false,

      tournamentCategoriesCache: {},

      adminCategoryPresetKeys() {
    return ['B1K', 'B1M', 'B2K', 'B2M', 'B3K', 'B3M', 'B4K', 'B4M'];
      },

      allAdminCategoryPresets() {
    return Object.fromEntries(this.adminCategoryPresetKeys().map((key) => [key, true]));
      },

      adminCategoryPresetLabel(key) {
    const labels = {
      B1M: 'B1 M', B1K: 'B1 K', B2M: 'B2 M', B2K: 'B2 K',
      B3M: 'B3 M', B3K: 'B3 K', B4M: 'B4 M', B4K: 'B4 K',
    };
    return labels[key] || key;
      },

      buildAdminCategoryEntries(presetSelected, customLabel, customHints, presetDoubles = {}, customDoubles = false) {
    const presets = this.adminCategoryPresetKeys()
      .filter(key => presetSelected[key])
      .map(key => ({ preset_key: key, is_doubles: Boolean(presetDoubles[key]) }));
    const label = String(customLabel || '').trim();
    const entries = [...presets];
    if (label) {
      entries.push({
        label,
        hint_bands: String(customHints || '').split(/[,/]/).map(v => v.trim()).filter(Boolean),
        is_doubles: Boolean(customDoubles),
      });
    }
    return entries;
      },

      async loadAdminTournamentCategories(tournamentId) {
    if (!tournamentId) {
      this.adminTournamentCategories = [];
      return;
    }
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/categories`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load categories');
      const categories = Array.isArray(payload.categories) ? payload.categories : [];
      this.adminTournamentCategories = categories;
      this.tournamentCategoriesCache[tournamentId] = categories;
      this.adminCategorySetupOpen = !categories.length;
      if (!categories.length) this.adminCategoryPresetSelected = this.allAdminCategoryPresets();
    } catch (error) {
      console.error('Failed to load tournament categories:', error);
      this.showToast('Błąd ładowania kategorii turnieju', 'error');
    }
      },

      async loadTournamentCategoriesCache(tournamentId) {
    if (!tournamentId) return;
    if (Array.isArray(this.tournamentCategoriesCache[tournamentId])) return;
    await this.loadAdminTournamentCategories(tournamentId);
      },

      tournamentCategoriesFor(tournamentId) {
    if (Number(this.editingTournamentId) === Number(tournamentId)) {
      return this.adminTournamentCategories || [];
    }
    return this.tournamentCategoriesCache[tournamentId] || [];
      },

      async confirmAdminTournamentCategories(tournamentId, entries = null, options = {}) {
    const payloadEntries = entries || this.buildAdminCategoryEntries(
      this.adminCategoryPresetSelected,
      this.adminCategoryCustomLabel,
      this.adminCategoryCustomHints,
      this.adminCategoryPresetDoubles,
      this.adminCategoryCustomDoubles,
    );
    if (!payloadEntries.length) {
      if (!options.silent) this.showToast('Wybierz co najmniej jedną kategorię', 'warning');
      return false;
    }
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/categories/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: payloadEntries }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to confirm categories');
      this.adminTournamentCategories = Array.isArray(payload.categories) ? payload.categories : [];
      this.tournamentCategoriesCache[tournamentId] = this.adminTournamentCategories;
      this.adminCategorySetupOpen = false;
      this.adminCategoryCustomLabel = '';
      this.adminCategoryCustomHints = '';
      this.adminCategoryCustomDoubles = false;
      this.adminCategoryPresetSelected = {};
      this.adminCategoryPresetDoubles = {};
      if (!options.silent) this.showToast('Kategorie zapisane', 'success');
      return true;
    } catch (error) {
      console.error('Failed to confirm tournament categories:', error);
      if (!options.silent) this.showToast(error.message || 'Błąd zapisu kategorii', 'error');
      return false;
    }
      },

      async addAdminTournamentCategory(tournamentId) {
    const label = String(this.adminCategoryCustomLabel || '').trim();
    if (!label) return;
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          hint_bands: String(this.adminCategoryCustomHints || '').split(/[,/]/).map(v => v.trim()).filter(Boolean),
          is_doubles: Boolean(this.adminCategoryCustomDoubles),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to add category');
      this.adminTournamentCategories = Array.isArray(payload.categories) ? payload.categories : this.adminTournamentCategories;
      this.tournamentCategoriesCache[tournamentId] = this.adminTournamentCategories;
      this.adminCategoryCustomLabel = '';
      this.adminCategoryCustomHints = '';
      this.adminCategoryCustomDoubles = false;
      this.showToast('Kategoria dodana', 'success');
    } catch (error) {
      this.showToast(error.message || 'Błąd dodawania kategorii', 'error');
    }
      },

      startAdminCategoryEdit(category) {
    this.adminCategoryEditId = category?.id || null;
    this.adminCategoryEditLabel = category?.label || '';
      },

      async saveAdminCategoryEdit(tournamentId) {
    if (!this.adminCategoryEditId) return;
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/categories/${this.adminCategoryEditId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: String(this.adminCategoryEditLabel || '').trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to update category');
      this.adminTournamentCategories = Array.isArray(payload.categories) ? payload.categories : this.adminTournamentCategories;
      this.tournamentCategoriesCache[tournamentId] = this.adminTournamentCategories;
      this.adminCategoryEditId = null;
      this.adminCategoryEditLabel = '';
      this.showToast('Kategoria zaktualizowana', 'success');
    } catch (error) {
      this.showToast(error.message || 'Błąd aktualizacji kategorii', 'error');
    }
      },

      async deleteAdminTournamentCategory(tournamentId, categoryId) {
    if (!categoryId || !confirm('Usunąć tę kategorię turniejową?')) return;
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/categories/${categoryId}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to delete category');
      this.adminTournamentCategories = Array.isArray(payload.categories) ? payload.categories : [];
      this.tournamentCategoriesCache[tournamentId] = this.adminTournamentCategories;
      this.showToast('Kategoria usunięta', 'success');
    } catch (error) {
      this.showToast(error.message || 'Błąd usuwania kategorii', 'error');
    }
      },
  };
}
