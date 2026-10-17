/**
 * Zawodnicy → Błędy w profilu: what a visitor sent from the public profile.
 * Open rows stay until someone at the desk marks them done.
 */

export function createProfileReportsView() {
  return {
    profileReports: [],
    profileReportsError: '',

    reportDate(report) {
      return String(report?.created_at || '').slice(0, 16).replace('T', ' ');
    },

    async loadProfileReports() {
      try {
        const response = await fetch('/admin/api/profile-reports');
        if (!response.ok) throw new Error(String(response.status));
        this.profileReports = await response.json();
      } catch (err) {
        console.error('Failed to load profile reports:', err);
      }
    },

    async closeProfileReport(report) {
      this.profileReportsError = '';
      try {
        const response = await fetch(`/admin/api/profile-reports/${report.id}/done`, { method: 'POST' });
        if (!response.ok) throw new Error(String(response.status));
        this.showToast?.('Zgłoszenie załatwione', 'success');
        await this.loadProfileReports();
      } catch {
        this.profileReportsError = 'Nie udało się zapisać. Spróbuj ponownie.';
      }
    },
  };
}
