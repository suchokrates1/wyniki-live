export function defaultOfficeForm(groupId = '') {
  return {
    mode: 'group',
    resultKind: 'group',
    lockedFromSlot: false,
    group_id: groupId,
    knockout_slot_id: null,
    schedule_id: null,
    court_id: '',
    phase: 'Grupowa',
    player1_name: '',
    player2_name: '',
    walkover: false,
    winner_name: '',
    set1_p1: 4,
    set1_p2: 0,
    set2_p1: 4,
    set2_p2: 0,
    stb_p1: '',
    stb_p2: '',
  };
}

export function defaultOfficeScheduleForm() {
  return {
    day_date: '',
    scheduled_time: '',
    court_id: '',
    category_name: '',
    phase: 'Grupowa',
    player1_name: '',
    player2_name: '',
    status: 'planned',
    notes_public: '',
    notes_internal: '',
  };
}
