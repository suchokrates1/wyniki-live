/** Polish counts: 1 kort, 2 korty, 5 kortów — the form depends on the last digits. */

export function pluralPl(count, one, few, many) {
  const n = Math.abs(Number(count) || 0);
  if (n === 1) return one;
  const lastTwo = n % 100;
  const last = n % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

export const courtsWord = (count) => pluralPl(count, 'kort', 'korty', 'kortów');
export const peopleWord = (count) => pluralPl(count, 'osoba', 'osoby', 'osób');
export const courtsHaveWord = (count) => pluralPl(count, 'ma', 'mają', 'ma');

export function createPluralView() {
  return {
    admCourts(count) { return `${count} ${courtsWord(count)}`; },
    admCourtsWord(count) { return courtsWord(count); },
    admPeople(count) { return `${count} ${peopleWord(count)}`; },
    admCourtsHave(count) { return courtsHaveWord(count); },
  };
}
