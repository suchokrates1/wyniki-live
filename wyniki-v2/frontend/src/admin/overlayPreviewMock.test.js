import assert from 'node:assert/strict';
import test from 'node:test';
import { courtLooksEmpty, previewMockCourt } from './overlayPreviewMock.js';

test('preview mock fills four distinct TV boards', () => {
  const one = previewMockCourt('1');
  const three = previewMockCourt('3');
  assert.equal(one.match_status.active, true);
  assert.equal(one.A.surname, 'Suchodolski');
  assert.equal(one.serve, 'A');
  assert.equal(one.history_meta.phase, 'Ćwierćfinał');
  assert.equal(three.tie.visible, true);
  assert.ok(three.sets_detail.length >= 1);
});

test('empty court detection ignores dashes', () => {
  assert.equal(courtLooksEmpty({}), true);
  assert.equal(courtLooksEmpty({ A: { surname: '-' }, B: { surname: '-' } }), true);
  assert.equal(courtLooksEmpty({ match_status: { active: true } }), false);
  assert.equal(courtLooksEmpty({ A: { surname: 'Nowak' }, B: { surname: '-' } }), false);
});
