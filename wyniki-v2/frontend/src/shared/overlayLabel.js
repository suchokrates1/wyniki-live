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

const OVERLAY_PHASE_EN = {
  groupRematch: 'GROUP REMATCH',
  group: 'GROUP',
  r16: '1/8',
  qf: '1/4',
  sf: '1/2',
  third: '3RD PLACE',
  knockout: 'KNOCKOUT',
  final: 'FINAL',
};

export function overlayPhaseToken(phase) {
  const text = String(phase || '').trim();
  if (!text) return '';
  const suffix = text.includes(' — ') ? text.split(' — ').pop().trim() : text;
  const lower = suffix.toLowerCase();
  if (/rewan|rematch/.test(lower)) return 'groupRematch';
  if (lower === 'grupowa' || /group stage|^group$|faza grupowa|gruppenphase|fase a gironi|fase de grupos|phase de groupes|grupių/.test(lower)) {
    return 'group';
  }
  if (/1\s*\/\s*8|r16|round of 16|ósem/.test(lower)) return 'r16';
  if (/1\s*\/\s*4|ćwierć|cwierc|quarter/.test(lower)) return 'qf';
  if (/1\s*\/\s*2|półfina|polfina|semif/.test(lower)) return 'sf';
  if (/miejsca\s+\d+|(?<!\d)(?:[5-9]|\d{2,})\.\s*miejsce/.test(lower)) return '';
  if (/(?<!\d)3\.\s*miejsce|3rd|third place|bronze/.test(lower)) return 'third';
  if (/pucharowa|knockout|k\.\-o|eliminazione|eliminatoria|élimination|atkrintam/.test(lower)) return 'knockout';
  if (/(?:^|\s)fina[lł]|final/.test(lower) && !/semi|pół|1\s*\/\s*2/.test(lower)) return 'final';
  return '';
}

const CONSOLATION_PREFIX = /^(pocieszenie|consolation)\s+/i;

/** Places decided by a generated draw round: "o miejsca 5–8", "o 7. miejsce". */
function placementPhase(suffix) {
  const range = suffix.match(/miejsca\s+(\d+)\s*[–-]\s*(\d+)/i);
  if (range) return { from: range[1], to: range[2] };
  const single = suffix.match(/(?<!\d)(\d+)\.\s*miejsce/i);
  if (single && single[1] !== '3') return { number: single[1] };
  return null;
}

function ordinalEn(number) {
  const n = Number(number);
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ({ 1: 'ST', 2: 'ND', 3: 'RD' }[n % 10] || 'TH');
  return `${n}${tail}`;
}

function phaseLabel(phase, labels, english) {
  const text = String(phase || '').trim();
  if (!text) return '';
  let suffix = text.includes(' — ') ? text.split(' — ').pop().trim() : text;
  const consolation = CONSOLATION_PREFIX.test(suffix);
  if (consolation) suffix = suffix.replace(CONSOLATION_PREFIX, '');
  let label;
  const place = placementPhase(suffix);
  if (place?.from) {
    label = english ? `PLACES ${place.from}–${place.to}` : (labels.placesRange || 'PLACES {from}–{to}').replace('{from}', place.from).replace('{to}', place.to);
  } else if (place?.number) {
    label = english ? `${ordinalEn(place.number)} PLACE` : (labels.placeFor || `${ordinalEn(place.number)} PLACE`).replace('{number}', place.number);
  } else {
    const token = overlayPhaseToken(suffix);
    label = token ? ((!english && labels[token]) || OVERLAY_PHASE_EN[token]) : suffix;
  }
  if (!consolation) return label;
  const word = english ? 'CONSOLATION' : (labels.consolation || 'CONSOLATION');
  return `${word} ${label}`;
}

export function overlayPhaseLabel(phase) {
  return phaseLabel(phase, {}, true);
}

export function localizeScoreboardPhase(phase, labels = {}) {
  return phaseLabel(phase, labels, false);
}

export function localizeScoreboardCategory(category, labels = {}) {
  let text = String(category || '').trim();
  if (!text) return '';
  if (text.includes(' — ')) text = text.split(' — ')[0].trim();
  const women = labels.women || 'Women';
  const men = labels.men || 'Men';
  const doubles = labels.doubles || 'Doubles';
  const mixed = labels.mixed || 'Mixed';
  return text
    .replace(/\bWoman\b/gi, women)
    .replace(/Kobiety|Women|Frauen|Donne|Mujeres|Femmes|Moterys/gi, women)
    .replace(/Mężczyźni|Mezczyzni|Männer|Uomini|Hombres|Hommes|Vyrai/gi, men)
    .replace(/\bMen\b/gi, men)
    .replace(/\bMan\b/gi, men)
    .replace(/\bDebel\b|\bDeble\b|Doubles|Doppel|Doppio|Dobles|Dvejetai/gi, doubles)
    .replace(/\bDouble\b/gi, doubles)
    .replace(/Mieszane|Mixed|Misto|Mixto|Mixte|Mišrios/gi, mixed);
}

export function overlayMetaParts({ category, phase } = {}) {
  const parts = [];
  const cat = overlayCategoryLabel(category);
  const ph = overlayPhaseLabel(phase);
  if (cat) parts.push(cat);
  if (ph) parts.push(ph);
  return parts;
}
