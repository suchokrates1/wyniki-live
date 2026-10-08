import { buildCategoryPanel } from './bracketPanelModel.js';
import { styleText } from './bracketGeometry.js';
import { competitorKey } from './knockoutLayout.js';
import { formatTemplate as fmt } from '../shared/text.js';

// The Alpine side of the bracket panel: which player is pinned, texts, positions.
// The pin is one name for the whole page; it survives a category switch and lives in the hash.

export function createBracketPanelView() {
  return {
    bracketPinName: '',

    bracketText(key, values) {
      const text = this.tr().bracketView?.[key] || '';
      return values ? fmt(text, values) : text;
    },

    /** Only the category on screen is built: a tournament has a dozen, each a few hundred nodes. */
    bracketPanel(cat, scope) {
      const selected = scope === 'tournament' ? this.tournamentBracketCategory : this.bracketCategory;
      if (!cat || cat.name !== selected) return null;
      const data = scope === 'tournament' ? this.tournamentBracket : this.bracketData;
      return buildCategoryPanel(cat, data || {}, {
        pinKey: this.bracketPinName ? competitorKey(this.bracketPinName) : '',
        t: this.tr().bracketView || {},
      });
    },

    toggleBracketPin(name) {
      const same = this.bracketPinName && competitorKey(this.bracketPinName) === competitorKey(name);
      this.bracketPinName = same ? '' : String(name || '').trim();
      if (typeof this._updateHash === 'function') this._updateHash(true);
    },

    clearBracketPin() {
      this.bracketPinName = '';
      if (typeof this._updateHash === 'function') this._updateHash(true);
    },

    bracketPinLabel(row) {
      const name = this.resolveBracketName(row?.name) || row?.name || '';
      return this.bracketText(row?.pinned ? 'pinHide' : 'pinShow', { name });
    },

    bracketCardAria(card) {
      const [a, b] = card?.rows || [];
      if (!a) return '';
      if (card.bye) return `${this.resolveBracketName(a.name)}, ${this.bracketText('bye')}`;
      const names = [a, b].map((row) => this.resolveBracketName(row?.name) || '—');
      const winner = [a, b].find((row) => row?.won);
      const joiner = this.acc().scoreJoiner || 'do';
      const score = (a.games || []).map((game, index) => `${game.v} ${joiner} ${b?.games?.[index]?.v ?? ''}`).join(', ');
      const parts = [`${names[0]} – ${names[1]}`];
      if (winner) parts.push(`${this.acc().winner || 'Zwycięzca'}: ${this.resolveBracketName(winner.name)}`);
      if (score) parts.push(`${this.acc().result || 'Wynik'}: ${score}`);
      return parts.join('. ');
    },

    /** A group table's number said with its column: "Sety: 4 do 1" (shown as "4:1"). */
    bracketScoreText(label, value) {
      const [won, lost] = String(value ?? '').split(/[–:-]/).map((part) => part.trim());
      if (lost === undefined) return `${label}: ${value ?? ''}`;
      return `${label}: ${won} ${this.acc().scoreJoiner || 'do'} ${lost}`;
    },

    bracketPos(entry) {
      const box = { left: entry?.x || 0, top: entry?.y || 0 };
      if (entry?.width && !entry?.height) box.width = entry.width;
      return styleText(box);
    },

    bracketBox(box) {
      return styleText({ width: box?.width || 0, height: box?.height || 0 });
    },

    bracketStyle(style) {
      return styleText(style);
    },
  };
}
