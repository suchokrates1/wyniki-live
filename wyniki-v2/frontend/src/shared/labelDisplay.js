import { formatTemplate } from './text.js';

/** Translate Polish/canonical DB labels for UI display (category, phase, group names). */
export function translateStoredScheduleLabel(name, labels = {}) {
  const text = String(name || '').trim();
  if (!text) return '';

  const women = labels.women || 'Kobiety';
  const men = labels.men || 'Mężczyźni';
  const mixed = labels.mixed || 'B3/4 Mixed';
  const semifinal = labels.semifinal || 'Półfinał';
  const finalLabel = labels.final || 'Finał';
  const placeFor = labels.placeFor || 'o {number}. miejsce';
  const group = labels.group || 'Grupowa';
  const knockout = labels.knockout || 'Pucharowa';
  const groupSuffix = labels.groupSuffixLetter || 'Grupa {letter}';

  if (text === 'Grupowa') return group;
  if (text === 'Pucharowa') return knockout;

  let result = text
    .replace(/Półfinał/g, semifinal)
    .replace(/Finał/g, finalLabel);

  result = result.replace(/o (\d+)\. miejsce/g, (_, number) => (
    formatTemplate(placeFor, { number })
  ));

  result = result.replace(/Grupa ([A-Z])/gi, (_, letter) => (
    formatTemplate(groupSuffix, { letter: letter.toUpperCase() })
  ));

  result = result.replace(/Kobiety/g, women);
  result = result.replace(/Mężczyźni/g, men);
  if (mixed) result = result.replace(/B3\/4 Mixed/g, mixed);

  if (labels.winnerSf) {
    result = result.replace(/Zwycięzca PF (\d+)/g, (_, number) => (
      formatTemplate(labels.winnerSf, { number })
    ));
  }
  if (labels.loserSf) {
    result = result.replace(/Przegrany PF (\d+)/g, (_, number) => (
      formatTemplate(labels.loserSf, { number })
    ));
  }

  return result;
}
