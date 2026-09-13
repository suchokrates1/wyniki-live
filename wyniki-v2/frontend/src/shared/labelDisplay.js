import { formatTemplate } from './text.js';

/** A name standing in for a player not known yet: "Zwycięzca: Półfinał 1", "1. B2 Kobiety — Grupa A". */
export function isPendingCompetitorName(name) {
  const text = String(name || '').trim();
  return /^(Zwycięzca|Przegrany)( PF)?[: ]/.test(text) || /^\d+\.\s/.test(text);
}

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

  // "Zwycięzca: Ćwierćfinał 1" — translate the match it refers to, then the prefix
  const fed = text.match(/^(Zwycięzca|Przegrany): (.+)$/);
  if (fed) {
    const template = fed[1] === 'Zwycięzca' ? (labels.winnerOf || 'Zwycięzca: {match}') : (labels.loserOf || 'Przegrany: {match}');
    return formatTemplate(template, { match: translateStoredScheduleLabel(fed[2], labels) });
  }

  let result = text
    .replace(/1\/(\d+) finału/g, (_, n) => formatTemplate(labels.roundOf || '1/{n} finału', { n, players: Number(n) * 2 }))
    .replace(/o miejsca (\d+)–(\d+)/g, (_, from, to) => formatTemplate(labels.placesRange || 'o miejsca {from}–{to}', { from, to }))
    .replace(/Pocieszenie/g, labels.consolation || 'Pocieszenie')
    .replace(/Ćwierćfinał/g, labels.quarterfinal || 'Ćwierćfinał')
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
