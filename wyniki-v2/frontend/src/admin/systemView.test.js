import assert from 'node:assert/strict';
import test from 'node:test';

import { createSystemView, SMTP_FIELDS, smtpFieldsFor } from './systemView.js';

test('the SMTP form keeps every field the old one had, minus the password it handles apart', () => {
  const keys = SMTP_FIELDS.map((field) => field.key);
  assert.deepEqual(keys, ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_from_email', 'smtp_from_name']);
  assert.ok(!keys.includes('smtp_password'));
});

test('each field gets its own id for its label', () => {
  const ids = smtpFieldsFor('adm-smtp').map((field) => field.id);
  assert.ok(ids.includes('adm-smtp-smtp-from-email'));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(Object.assign({}, createSystemView()).adminSmtpFields().length, SMTP_FIELDS.length);
});
