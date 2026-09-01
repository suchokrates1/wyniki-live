/**
 * 4-digit court PIN pad — same rules as Android CourtPinDialogController:
 * append digits, backspace, auto-complete at 4, clear after a failed attempt.
 */
export function createPinPad() {
  let digits = '';

  return {
    get value() {
      return digits;
    },
    get length() {
      return digits.length;
    },
    get complete() {
      return digits.length === 4;
    },
    boxes() {
      return [0, 1, 2, 3].map((index) => digits[index] || '');
    },
    append(digit) {
      const next = String(digit);
      if (!/^\d$/.test(next) || digits.length >= 4) return digits;
      digits += next;
      return digits;
    },
    backspace() {
      digits = digits.slice(0, -1);
      return digits;
    },
    clear() {
      digits = '';
      return digits;
    },
  };
}
