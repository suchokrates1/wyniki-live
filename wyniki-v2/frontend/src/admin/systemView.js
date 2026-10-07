/** The System section: which SMTP fields the form shows. */

export const SMTP_FIELDS = [
  { key: 'smtp_host', label: 'Host SMTP', type: 'text', placeholder: 'smtp.example.com' },
  { key: 'smtp_port', label: 'Port', type: 'number', placeholder: '587' },
  { key: 'smtp_username', label: 'Login', type: 'text' },
  { key: 'smtp_from_email', label: 'E-mail nadawcy', type: 'email', placeholder: 'turniej@klub.pl' },
  { key: 'smtp_from_name', label: 'Nazwa nadawcy', type: 'text', placeholder: 'Wyniki Live' },
];

export function smtpFieldsFor(prefix = 'adm-smtp') {
  return SMTP_FIELDS.map((field) => ({ ...field, id: `${prefix}-${field.key.replace(/_/g, '-')}` }));
}

export function createSystemView() {
  return {
    emailSettings: {
      smtp_host: '',
      smtp_port: 587,
      smtp_username: '',
      smtp_password: '',
      smtp_password_set: false,
      smtp_use_tls: true,
      smtp_from_email: '',
      smtp_from_name: '',
    },

    adminSmtpFields() {
      return smtpFieldsFor('adm-smtp');
    },

    async loadEmailSettings() {
      try {
        const response = await fetch('/admin/api/settings/email');
        if (!response.ok) throw new Error('Failed to load email settings');
        this.emailSettings = { ...this.emailSettings, ...(await response.json()) };
      } catch (err) {
        console.error('Failed to load email settings:', err);
        this.showToast('Błąd ładowania ustawień SMTP', 'error');
      }
    },

    async saveEmailSettings() {
      try {
        const response = await fetch('/admin/api/settings/email', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.emailSettings),
        });
        if (!response.ok) throw new Error('Failed to save email settings');
        // the typed password went to the server; the form keeps none
        if (this.emailSettings.smtp_password) this.emailSettings = { ...this.emailSettings, smtp_password: '', smtp_password_set: true };
        this.showToast('Ustawienia SMTP zapisane', 'success');
      } catch (err) {
        console.error('Failed to save email settings:', err);
        this.showToast('Błąd zapisu ustawień SMTP', 'error');
      }
    },
  };
}
