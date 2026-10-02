/** Court PINs: spotting the ones anybody would guess, and handing out fresh ones. */

// Installed courts start at 0000; these are the ones a stranger tries first.
export const WEAK_PINS = ['0000', '1111', '1234', '2222', '4321', '1212', '9999', '4242'];

export function isWeakPin(pin) {
  const value = String(pin ?? '').trim();
  if (!/^\d{4}$/.test(value)) return true;
  return WEAK_PINS.includes(value);
}

export function randomPin(random = Math.random) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const pin = String(Math.floor(random() * 10000)).padStart(4, '0');
    if (!isWeakPin(pin)) return pin;
  }
  return '7391';
}

/** One fresh PIN per court, each different from the others. */
export function pinProposals(courts = [], random = Math.random) {
  const taken = new Set();
  return courts.map((court) => {
    let pin = randomPin(random);
    while (taken.has(pin)) pin = randomPin(random);
    taken.add(pin);
    return {
      kort_id: court.kort_id,
      name: court.name || court.kort_id,
      pin,
      was: String(court.pin ?? '') || '—',
      wasWeak: isWeakPin(court.pin),
    };
  });
}

export function createCourtPinsView() {
  return {
    pinDialogOpen: false,
    pinProposals: [],
    pinSaving: false,

    /** Courts anyone could walk onto: the banner above the list counts them. */
    adminWeakPinCourts() {
      const courts = Array.isArray(this.courts) ? this.courts : [];
      return courts.filter((court) => isWeakPin(court.pin));
    },

    adminPinCourts() {
      const courts = Array.isArray(this.courts) ? this.courts : [];
      const chosen = Array.isArray(this.selectedCourtTournamentIds) ? this.selectedCourtTournamentIds : [];
      if (!chosen.length) return courts;
      return courts.filter((court) => chosen.includes(String(court.tournament_id ?? '')));
    },

    openPinDialog() {
      this.pinProposals = pinProposals(this.adminPinCourts());
      this.pinDialogOpen = true;
    },

    rerollPins() {
      this.pinProposals = pinProposals(this.adminPinCourts());
    },

    closePinDialog() {
      this.pinDialogOpen = false;
      this.pinProposals = [];
    },

    async savePinProposals() {
      if (this.pinSaving) return;
      this.pinSaving = true;
      try {
        for (const proposal of this.pinProposals) {
          await this.updateCourtPin(proposal.kort_id, proposal.pin);
        }
        this.closePinDialog();
      } finally {
        this.pinSaving = false;
      }
    },
  };
}
