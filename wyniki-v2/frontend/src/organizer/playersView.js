/**
 * The organizer's players: who is entered in the tournament, finding someone in the
 * shared base, adding a new person, correcting a person (a class after a medical), and
 * pasting a whole entry list. Messages are text keys; the app translates them with t().
 */
import { call, CallError } from './api.js';

export const CLASSES = ['B1', 'B2', 'B3', 'B4'];
export const GENDERS = [{ value: 'M', key: 'genderM' }, { value: 'K', key: 'genderK' }];

const emptyPerson = () => ({ first_name: '', last_name: '', country: '', gender: '', category: '' });
const note = (key, vars = {}) => ({ key, vars });

/** Class · country · gender, the gender through `translate` (a function key → text). */
export function personLine(person, translate = (key) => key) {
  const gender = person.gender === 'K' ? translate('genderK') : person.gender === 'M' ? translate('genderM') : '';
  return [person.category, person.country, gender].filter(Boolean).join(' · ');
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
    playersMessage: null,
    playersError: null,
    _searchTimer: null,

    classes() { return CLASSES; },
    genders() { return GENDERS; },
    person(row) { return personLine(row, (key) => this.ot(key)); },

    async _players(work, success = null) {
      this.playersError = null;
      this.playersMessage = null;
      try {
        const result = await work();
        this.playersMessage = result?.key ? result : success;
      } catch (error) {
        this.playersError = error instanceof CallError ? note(error.key, error.vars) : note('genericError');
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
      }, note('enteredMsg', { name: `${person.first_name} ${person.last_name}` }));
    },

    async createAndEnter() {
      if (!this.newPerson.last_name.trim()) {
        this.playersError = note('lastNameRequired');
        return;
      }
      await this._players(async () => {
        const created = await call('/organizer/api/players', 'POST', this.newPerson);
        await call(`/organizer/api/tournaments/${this.t.id}/players/add-global`, 'POST', { global_player_id: created.id });
        this.newPerson = emptyPerson();
        await this.loadEntries();
      }, note('createdEntered'));
    },

    async removeEntry(entry) {
      if (!window.confirm(this.ot('confirmWithdraw', { name: entry.name }))) return;
      await this._players(async () => {
        await call(`/organizer/api/tournaments/${this.t.id}/players/${entry.id}`, 'DELETE');
        await this.loadEntries();
      }, note('withdrawn'));
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
        return note(queued ? 'savedReview' : 'saved');
      });
    },

    async parseImport() {
      if (!this.importText.trim()) {
        this.playersError = note('pasteList');
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
        return note('imported', { n: body.count });
      });
    },
  };
}
