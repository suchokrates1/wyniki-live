import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupePlayersList, playerListName } from './players.js';

test('the list shows the surname first, as it is ordered', () => {
  assert.equal(playerListName({ first_name: 'Katarzyna', last_name: 'Antczak', name: 'Katarzyna Antczak' }), 'Antczak Katarzyna');
  assert.equal(playerListName({ first_name: 'Álvaro', last_name: 'Azofra de Rivas' }), 'Azofra de Rivas Álvaro');
});

test('a player without split names keeps the full name', () => {
  assert.equal(playerListName({ name: 'A. Rimelkytė' }), 'A. Rimelkytė');
  assert.equal(playerListName({ last_name: 'Rimelkytė', name: 'A. Rimelkytė' }), 'A. Rimelkytė');
});

test('the list is ordered by surname, then first name', () => {
  const list = dedupePlayersList([
    { id: 1, first_name: 'Tomasz', last_name: 'Błoński', name: 'Tomasz Błoński' },
    { id: 2, first_name: 'Grzegorz', last_name: 'Bzowski', name: 'Grzegorz Bzowski' },
    { id: 3, first_name: 'Marcin', last_name: 'Błoński', name: 'Marcin Błoński' },
    { id: 4, first_name: 'Katarzyna', last_name: 'Antczak', name: 'Katarzyna Antczak' },
  ]);
  assert.deepEqual(list.map(playerListName), ['Antczak Katarzyna', 'Błoński Marcin', 'Błoński Tomasz', 'Bzowski Grzegorz']);
});
