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
    /** A prepared e-mail about this player's data: subject names the player, body links the profile. */
    profileDataMailto(name) {
      const subject = this.profileViewText('dataSubject', { name });
      const body = `${location.origin}${location.pathname}${location.hash}`;
      return `mailto:contact@blindtennis.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    },

    profileDateRange(start, end) {
      if (!start) return '';
      if (!end || end === start) return this.profileDate(start);
      // each language orders a range its own way ("25–29 sierpnia 2026", "August 25 – 29, 2026")
      try {
        const format = new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
        return format.formatRange(new Date(`${start}T12:00:00Z`), new Date(`${end}T12:00:00Z`));
      } catch {
        return `${this.profileDate(start)} – ${this.profileDate(end)}`;
      }
    },

    /** One step of a tournament's path: "Grupa A · 1. miejsce" or the round ("Finał"). */
    profileStepLabel(step) {
      if (step?.kind !== 'group') return this.profilePhaseLabel(step?.phase);
      const group = this.translateCategory(String(step.phase).split(' — ').pop());
      return this.profileViewText('groupStep', { group, place: step.place });
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
