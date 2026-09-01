import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchConfig, StatsMode } from '../match-engine/models.js';
import { startDraft } from '../matchConfigForm.js';
import { createMatchFromDraft } from './createMatchFromDraft.js';
import { toMatchPayload } from './matchPayload.js';
import { suggestionScheduleId } from './suggestion.js';

test('suggestion scheduleId prefers schedule_id and survives draft to API', () => {
  assert.equal(suggestionScheduleId({ id: 11, schedule_id: 22 }), 22);
  assert.equal(suggestionScheduleId({ id: 11 }), 11);
  assert.equal(suggestionScheduleId(null), null);

  const draft = startDraft({
    selectedPlayers: [
      { id: 1, name: 'A', firstName: 'Ana', lastName: 'A' },
      { id: 2, name: 'B', firstName: 'Ben', lastName: 'B' },
    ],
    isDoubles: false,
    courtId: 't31-1',
    courtName: 'Kort 1',
    scheduleId: suggestionScheduleId({ schedule_id: 88 }),
    config: new MatchConfig({ statsMode: StatsMode.ADVANCED }),
  });
  const payload = toMatchPayload(createMatchFromDraft(draft));
  assert.equal(payload.schedule_id, 88);
});
