import { buildProfileView } from './profileModel.js';
import { formatTemplate as fmt } from '../shared/text.js';

// The Alpine side of the player profile: the view model and the few texts it assembles.

export function createProfilePanelView() {
  return {
    profileViewModel() {
      return buildProfileView(this.playerProfile);
    },

    profileViewText(key, values) {
      const text = this.tr().profileView?.[key] || '';
      return values ? fmt(text, values) : text;
    },

    /** "25–29 sierpnia 2026", "30 maja – 2 czerwca 2026": the shared month and year said once. */
    profileDateRange(start, end) {
      if (!start) return '';
      if (!end || end === start) return this.profileDate(start);
      const [y1, m1] = start.split('-');
      const [y2, m2] = end.split('-');
      const day = (value, options) => {
        try {
          return new Intl.DateTimeFormat(this.locale(), { ...options, timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
        } catch {
          return value;
        }
      };
      if (y1 === y2 && m1 === m2) return `${day(start, { day: 'numeric' })}–${this.profileDate(end)}`;
      if (y1 === y2) return `${day(start, { day: 'numeric', month: 'long' })} – ${this.profileDate(end)}`;
      return `${this.profileDate(start)} – ${this.profileDate(end)}`;
    },

    /** "B1 Men — 06 Consolation Ćwierćfinał" → "Pocieszenie · Ćwierćfinał": the category and draw order go. */
    profilePhaseLabel(phase) {
      let text = String(phase || '').split(' — ').pop().replace(/^\d+\s+/, '').trim();
      const consolation = /consolation|pocieszeni/i.test(text);
      text = text.replace(/consolation\s*/i, '').trim();
      const label = this.translatePhase(text) || text;
      if (!consolation) return label;
      const side = this.tr().bracketView?.reachConsolation || 'pocieszenie';
      return `${side.charAt(0).toUpperCase()}${side.slice(1)}${label ? ` · ${label}` : ''}`;
    },

    profileResultText(result) {
      if (!result) return '';
      if (result.kind === 'medal') return this.tr().playerProfile?.[result.medal] || result.medal;
      if (result.kind === 'phase') return this.profilePhaseLabel(result.phase);
      if (result.kind === 'group') {
        return this.profileViewText('groupResult', { group: this.translateCategory(String(result.group).split(' — ').pop()), place: result.place, of: result.of });
      }
      return '';
    },
  };
}
