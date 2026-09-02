import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { hydrateMatchState } from '../match/matchStateIo.js';
import { tutorialScript } from './tutorialController.js';
import { tutorialSnapshotIds } from './presets.js';

const androidScript = path.resolve(
  'C:/Users/sucho/Vest Tennis/android-tennis-referee/app/src/main/assets/tutorial/script.json',
);

test('tutorial script has unique step ids and required fields', () => {
  const { steps } = tutorialScript();
  assert.ok(steps.length >= 14);
  const ids = steps.map((step) => step.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const step of steps) {
    assert.ok(step.scene, step.id);
    assert.ok(step.titleKey, step.id);
    assert.ok(step.bodyKey, step.id);
  }
  const award = steps.find((step) => step.id === 'basic-scoring');
  assert.equal(award?.requireAction, 'awardPoint');
});

test('Android assets script keeps the same step ids', () => {
  assert.equal(existsSync(androidScript), true, 'android script.json missing');
  const copied = JSON.parse(readFileSync(androidScript, 'utf8'));
  assert.deepEqual(
    copied.steps.map((step) => step.id),
    tutorialScript().steps.map((step) => step.id),
  );
});

test('committed tutorial snapshots hydrate', () => {
  const dir = fileURLToPath(new URL('./snapshots/', import.meta.url));
  for (const id of tutorialSnapshotIds()) {
    const raw = JSON.parse(readFileSync(path.join(dir, `${id}.json`), 'utf8'));
    const state = hydrateMatchState(raw.state);
    assert.ok(state, id);
    assert.equal(state.clientMatchUuid.startsWith('tutorial-'), true, id);
    assert.ok(raw.view, id);
  }
});
