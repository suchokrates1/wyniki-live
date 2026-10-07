/**
 * The organizer's players: who is entered in the tournament, finding someone in the
 * shared base, adding a new person, correcting a person (a class after a medical), and
 * pasting a whole entry list.
 */
import { call, CallError } from './api.js';

export const CLASSES = ['B1', 'B2', 'B3', 'B4'];
export const GENDERS = [{ value: 'M', label: 'mężczyzna' }, { value: 'K', label: 'kobieta' }];

const emptyPerson = () => ({ first_name: '', last_name: '', country: '', gender: '', category: '' });

/** "1 zgłoszenie", "3 zgłoszenia", "12 zgłoszeń" */
export function entriesText(count) {
  if (count === 1) return '1 zgłoszenie';
  const lastTwo = count % 100;
  const few = count % 10 >= 2 && count % 10 <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${count} ${few ? 'zgłoszenia' : 'zgłoszeń'}`;
}

export function personLine(person) {
  return [person.category, person.country, person.gender === 'K' ? 'kobieta' : person.gender === 'M' ? 'mężczyzna' : '']
    .filter(Boolean).join(' · ');
}

export function createPlayersView() {
  return {
    entries: [],
    playerQuery: '',
    playerResults: [],
    playerSearched: false,
    newPerson: emptyPerson(),
    editing: null,
    importText: '',
    importPreview: null,
    playersMessage: '',
    playersError: '',
    _searchTimer: null,

    classes() { return CLASSES; },
    genders() { return GENDERS; },
    personLine,
    entriesText,

    async _players(work, success = '') {
      this.playersError = '';
      this.playersMessage = '';
      try {
        await work();
        if (success) this.playersMessage = success;
      } catch (error) {
        this.playersError = error instanceof CallError ? error.message : 'Coś poszło nie tak. Odśwież stronę.';
      }
    },

    async loadEntries() {
      await this._players(async () => { this.entries = await call(`/organizer/api/tournaments/${this.t.id}/players`); });
    },

    isEntered(person) {
      return this.entries.some((entry) => Number(entry.global_player_id) === Number(person.id));
    },

    searchPlayers() {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.runSearch(), 250);
    },

    async runSearch() {
      const text = this.playerQuery.trim();
      if (text.length < 2) {
        this.playerResults = [];
        this.playerSearched = false;
        return;
      }
      await this._players(async () => {
        this.playerResults = await call(`/organizer/api/players?q=${encodeURIComponent(text)}`);
        this.playerSearched = true;
      });
    },

    async enterPerson(person) {
      await this._players(async () => {
        await call(`/organizer/api/tournaments/${this.t.id}/players/add-global`, 'POST', { global_player_id: person.id });
        await this.loadEntries();
      }, `${person.first_name} ${person.last_name} zgłoszony do turnieju.`);
    },

    async createAndEnter() {
      if (!this.newPerson.last_name.trim()) {
        this.playersError = 'Podaj nazwisko.';
        return;
      }
      await this._players(async () => {
        const person = await call('/organizer/api/players', 'POST', this.newPerson);
        await call(`/organizer/api/tournaments/${this.t.id}/players/add-global`, 'POST', { global_player_id: person.id });
        this.newPerson = emptyPerson();
        await this.loadEntries();
      }, 'Nowy zawodnik dodany do bazy i zgłoszony.');
    },

    async removeEntry(entry) {
      if (!window.confirm(`Wycofać zgłoszenie: ${entry.name}?`)) return;
      await this._players(async () => {
        await call(`/organizer/api/tournaments/${this.t.id}/players/${entry.id}`, 'DELETE');
        await this.loadEntries();
      }, 'Zgłoszenie wycofane.');
    },

    startEdit(entry) {
      this.editing = {
        entry,
        first_name: entry.first_name || '', last_name: entry.last_name || '',
        country: entry.country || '', gender: entry.gender || '', category: entry.category || '',
      };
    },

    /** The entry in this tournament, and the person in the base when they are linked. */
    async saveEdit() {
      const form = this.editing;
      await this._players(async () => {
        const fields = { first_name: form.first_name, last_name: form.last_name, country: form.country, gender: form.gender, category: form.category };
        await call(`/organizer/api/tournaments/${this.t.id}/players/${form.entry.id}`, 'PUT', fields);
        let queued = false;
        if (form.entry.global_player_id) {
          queued = (await call(`/organizer/api/players/${form.entry.global_player_id}`, 'PUT', fields)).queued_for_review;
        }
        this.editing = null;
        await this.loadEntries();
        this.playersMessage = queued
          ? 'Zapisano. Ta osoba gra też w innych turniejach, więc zmianę sprawdzi jeszcze administrator.'
          : 'Zapisano.';
      });
    },

    async parseImport() {
      if (!this.importText.trim()) {
        this.playersError = 'Wklej listę zawodników.';
        return;
      }
      await this._players(async () => {
        this.importPreview = await call(`/organizer/api/tournaments/${this.t.id}/players/parse-import`, 'POST', { text: this.importText });
      });
    },

    async confirmImport() {
      await this._players(async () => {
        const body = await call(`/organizer/api/tournaments/${this.t.id}/players/bulk`, 'POST', { players: this.importPreview.players });
        this.importPreview = null;
        this.importText = '';
        await this.loadEntries();
        this.playersMessage = `Dodano ${body.count} zgłoszeń.`;
      });
    },
  };
}
