/** One row per court: its PIN, what is being played on it, and the tablet's battery. */

import { isWeakPin } from './courtPins.js';

export function courtScoreLine(live = {}) {
  const a = live.A || {};
  const b = live.B || {};
  const current = Number(live.current_set || 1);
  const setValue = (side, index) => (index > current ? 0 : Number(side[`set${index}`] || 0));
  const sets = [1, 2, 3]
    .filter((index) => setValue(a, index) + setValue(b, index) > 0)
    .map((index) => `${setValue(a, index)}:${setValue(b, index)}`);
  const games = `${Number(a.current_games || 0)}:${Number(b.current_games || 0)}`;
  const points = `${a.points ?? '0'}:${b.points ?? '0'}`;
  return `${sets.length ? `${sets.join(' ')} · ` : ''}${games} (${points})`;
}

export function courtBattery(live = {}) {
  const level = live.battery_level;
  if (level == null) return { text: '—', tone: 'muted' };
  const tone = level > 50 ? 'ok' : level > 20 ? 'warn' : 'alert';
  return { text: `${level}%${live.is_charging ? ' ⚡' : ''}`, tone };
}

export function courtRow(court = {}, live = {}) {
  const active = !!live?.match_status?.active;
  const names = [live?.A?.surname, live?.B?.surname].filter((name) => name && name !== '-');
  return {
    court,
    kortId: court.kort_id,
    name: court.name || court.kort_id,
    pin: String(court.pin ?? ''),
    weakPin: isWeakPin(court.pin),
    active,
    state: active ? { label: 'W GRZE', tone: 'live' } : { label: 'WOLNY', tone: 'idle' },
    players: active && names.length === 2 ? `${names[0]} — ${names[1]}` : '',
    score: active ? courtScoreLine(live) : '',
    battery: courtBattery(live),
  };
}

export function createCourtsListView() {
  return {
    adminCourtGroups() {
      const groups = Array.isArray(this.visibleCourtGroups) ? this.visibleCourtGroups : [];
      return groups.map((group) => ({
        id: group.id,
        name: group.name,
        isUnassigned: group.id === '__none__',
        courts: (group.courts || []).map((court) => courtRow(court, (this.courtData || {})[court.kort_id] || {})),
      }));
    },
  };
}
