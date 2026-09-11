const COURT_PREFIX = /^(court|kort|platz|campo|cancha|kortas)\s+/i;

export function overlayCourtLabel(labelText, courtId) {
  const raw = String(labelText || '').trim();
  if (/^main$/i.test(raw)) return 'MAIN';

  const fromId = String(courtId || '').match(/(?:^|-)(\d+)$/);
  const ordinalFromId = fromId ? fromId[1] : '';

  if (!raw) {
    return ordinalFromId ? `COURT ${ordinalFromId}` : '';
  }

  const afterDot = raw.split('•').pop().trim();
  const stripped = afterDot.replace(COURT_PREFIX, '').trim();
  if (/^\d+$/.test(stripped)) return `COURT ${stripped}`;

  return afterDot.replace(COURT_PREFIX, 'COURT ');
}

export function overlayCategoryLabel(category) {
  let text = String(category || '').trim();
  if (!text) return '';
  if (text.includes(' — ')) text = text.split(' — ')[0].trim();
  return text
    .replace(/Kobiety/gi, 'Women')
    .replace(/Mężczyźni/gi, 'Men')
    .replace(/Mezczyzni/gi, 'Men')
    .replace(/\bWoman\b/gi, 'Women')
    .replace(/\bMan\b/gi, 'Men')
    .replace(/\bDebel\b/gi, 'Doubles')
    .replace(/\bDeble\b/gi, 'Doubles')
    .replace(/\bMieszane\b/gi, 'Mixed');
}

export function overlayPhaseLabel(phase) {
  const text = String(phase || '').trim();
  if (!text) return '';
  const suffix = text.includes(' — ') ? text.split(' — ').pop().trim() : text;
  const lower = suffix.toLowerCase();
  if (/rewan|rematch/.test(lower)) return 'GROUP REMATCH';
  if (lower === 'grupowa' || /group stage|^group$|faza grupowa/.test(lower)) return 'GROUP';
  if (/1\s*\/\s*8|r16|round of 16|ósem/.test(lower)) return '1/8';
  if (/1\s*\/\s*4|ćwierć|cwierc|quarter/.test(lower)) return '1/4';
  if (/1\s*\/\s*2|półfina|polfina|semif/.test(lower)) return '1/2';
  if (/3\.\s*miejsce|3rd|third place|bronze/.test(lower)) return '3RD PLACE';
  if (/pucharowa|knockout/.test(lower)) return 'KNOCKOUT';
  if (/(?:^|\s)fina[lł]|final/.test(lower) && !/semi|pół|1\s*\/\s*2/.test(lower)) return 'FINAL';
  return suffix;
}

export function overlayMetaParts({ category, phase } = {}) {
  const parts = [];
  const cat = overlayCategoryLabel(category);
  const ph = overlayPhaseLabel(phase);
  if (cat) parts.push(cat);
  if (ph) parts.push(ph);
  return parts;
}
