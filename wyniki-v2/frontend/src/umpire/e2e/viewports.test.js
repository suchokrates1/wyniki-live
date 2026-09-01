import assert from 'node:assert/strict';
import test from 'node:test';
import { UMPIRE_E2E_PROJECTS, UMPIRE_E2E_VIEWPORTS } from './viewports.js';

test('umpire E2E projects are phone and tablet only', () => {
  assert.deepEqual(
    UMPIRE_E2E_PROJECTS.map((project) => project.name),
    ['phone', 'tablet', 'tablet-landscape'],
  );
  for (const project of UMPIRE_E2E_PROJECTS) {
    assert.equal(project.isMobile, true);
    assert.equal(project.hasTouch, true);
    assert.ok(project.viewport.width <= 1280);
  }
  assert.equal(UMPIRE_E2E_VIEWPORTS.phone.viewport.width, 390);
  assert.equal(UMPIRE_E2E_VIEWPORTS.tablet.viewport.width, 800);
});
