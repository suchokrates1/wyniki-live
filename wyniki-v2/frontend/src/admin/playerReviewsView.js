/**
 * Zawodnicy → Do sprawdzenia: changes a series organizer made to players who also play
 * elsewhere. They are already in effect; the admin keeps them or puts the old values back.
 */

export const FIELD_LABELS = {
  first_name: 'Imię',
  last_name: 'Nazwisko',
  gender: 'Płeć',
  country: 'Kraj',
  category: 'Klasa',
  birth_date: 'Data urodzenia',
};

/** [{label, before, after}] for each field the review changed. */
export function reviewChanges(review) {
  return Object.keys(review?.after || {}).map((key) => ({
    key,
    label: FIELD_LABELS[key] || key,
    before: review.before?.[key] || '—',
    after: review.after?.[key] || '—',
  }));
}

export function createPlayerReviewsView() {
  return {
    playerReviews: [],
    playerReviewsError: '',

    reviewChanges,

    reviewDate(review) {
      return String(review?.created_at || '').slice(0, 16).replace('T', ' ');
    },

    async loadPlayerReviews() {
      try {
        const response = await fetch('/admin/api/player-reviews');
        if (!response.ok) throw new Error(String(response.status));
        this.playerReviews = await response.json();
      } catch (err) {
        console.error('Failed to load player reviews:', err);
      }
    },

    async decidePlayerReview(review, decision) {
      this.playerReviewsError = '';
      try {
        const response = await fetch(`/admin/api/player-reviews/${review.id}/${decision}`, { method: 'POST' });
        if (!response.ok) throw new Error(String(response.status));
        this.showToast(decision === 'revert' ? 'Zmiana cofnięta' : 'Zmiana zostaje', 'success');
        await this.loadPlayerReviews();
        if (decision === 'revert' && typeof this.loadGlobalPlayers === 'function') this.loadGlobalPlayers();
      } catch {
        this.playerReviewsError = 'Nie udało się zapisać decyzji. Spróbuj ponownie.';
      }
    },
  };
}
