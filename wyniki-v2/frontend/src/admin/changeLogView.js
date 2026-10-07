/**
 * System → Dziennik zmian: the newest changes from the admin and the organizer panel,
 * each under the account that made it.
 */

/** "admin_series.attach" for an admin's change, the organizer's own action otherwise. */
export function changeWhat(row) {
  const action = String(row?.action || '');
  if (!action.startsWith('admin.')) return `panel organizatora: ${action}`;
  const path = row.detail?.path ? ` (${row.detail.method} ${row.detail.path})` : '';
  return `${action.slice('admin.'.length)}${path}`;
}

export function changeWhen(row) {
  return String(row?.created_at || '').slice(0, 16).replace('T', ' ');
}

export function createChangeLogView() {
  return {
    changeLog: [],
    changeLogError: '',
    changeWhat,
    changeWhen,

    async loadChangeLog() {
      this.changeLogError = '';
      try {
        const response = await fetch('/admin/api/audit?limit=200');
        if (!response.ok) throw new Error(String(response.status));
        this.changeLog = await response.json();
      } catch (err) {
        console.error('Failed to load the change log:', err);
        this.changeLogError = 'Nie udało się wczytać dziennika zmian.';
      }
    },
  };
}
