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
    adminSmtpFields() {
      return smtpFieldsFor('adm-smtp');
    },
  };
}
