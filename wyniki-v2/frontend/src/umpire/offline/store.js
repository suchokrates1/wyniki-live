import { createHistory } from './history.js';
import { createMemoryTable } from './memoryTable.js';
import { openUmpireDb } from './idbTable.js';
import { createOutbox } from './outbox.js';

export async function openUmpireStores() {
  try {
    const db = await openUmpireDb();
    return {
      outbox: createOutbox({ table: db.outbox }),
      history: createHistory({ table: db.history }),
    };
  } catch {
    return {
      outbox: createOutbox({ table: createMemoryTable() }),
      history: createHistory({ table: createMemoryTable() }),
    };
  }
}
