import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiagnostics, diagnosticsClipboardText } from './diagnostics.js';

test('diagnostics clipboard matches Android field labels', () => {
  const diagnostics = createDiagnostics({ now: () => 10 });
  diagnostics.record('FAILED', 'HTTP 500');
  assert.equal(diagnostics.get().lastError, 'HTTP 500');
  const text = diagnosticsClipboardText({
    appVersion: '2.0.0',
    backend: 'https://score.vestmedia.pl',
    device: 'web',
    locale: 'en',
    timezone: 'UTC',
    statusLabel: 'Sync failed',
    updatedLabel: 'Never',
    errorLabel: 'HTTP 500',
  });
  assert.match(text, /App version: 2.0.0/);
  assert.match(text, /Last sync status: Sync failed/);
  assert.match(text, /Last sync error: HTTP 500/);
});
