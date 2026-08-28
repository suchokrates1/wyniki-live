import assert from 'node:assert/strict';
import test from 'node:test';
import { formatQuickInfoHtml } from './quickInfoFormat.js';

test('plain announcement stays escaped text', () => {
  assert.equal(formatQuickInfoHtml('Court 3 delayed'), 'Court 3 delayed');
});

test('email becomes a mailto link after HTML is escaped', () => {
  const html = formatQuickInfoHtml(
    'Contact me at contact@blindtennis.app please.',
  );
  assert.match(html, /href="mailto:contact@blindtennis.app"/);
  assert.match(html, />contact@blindtennis.app</);
});

test('html in the note is not executed', () => {
  const html = formatQuickInfoHtml('<img src=x onerror=alert(1)> contact@blindtennis.app');
  assert.equal(html.includes('<img'), false);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /href="mailto:contact@blindtennis.app"/);
});
