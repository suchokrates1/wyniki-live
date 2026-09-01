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
  const groupRematch = labels.groupRematch || 'Grupowa — Rewanż';
  const knockout = labels.knockout || 'Pucharowa';
  const groupSuffix = labels.groupSuffixLetter || 'Grupa {letter}';

  // Canonical DB values (+ rare already-localized leftovers)
  if (text === 'Grupowa' || text === 'Faza grupowa') return group;
  if (text === 'Grupowa — Rewanż' || text === 'Faza grupowa — rewanż') return groupRematch;
  if (text === 'Pucharowa' || text === 'Faza pucharowa') return knockout;

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
  if (labels.doubles) {
    result = result.replace(/\bDoubles\b/gi, labels.doubles);
    result = result.replace(/\bDebel\b/gi, labels.doubles);
    result = result.replace(/\bDeble\b/gi, labels.doubles);
  }

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
