export function openUmpireDb({
  indexedDB = globalThis.indexedDB,
  name = 'umpire-pwa',
  version = 1,
} = {}) {
  if (!indexedDB) return Promise.reject(new Error('indexedDB unavailable'));

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('history')) {
        db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      resolve({
        outbox: createIdbTable(db, 'outbox'),
        history: createIdbTable(db, 'history'),
      });
    };
    request.onerror = () => reject(request.error);
  });
}

function createIdbTable(db, storeName) {
  function tx(mode) {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  return {
    all() {
      return new Promise((resolve, reject) => {
        const request = tx('readonly').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    },
    put(row) {
      return new Promise((resolve, reject) => {
        const request = tx('readwrite').put(row);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    delete(id) {
      return new Promise((resolve, reject) => {
        const request = tx('readwrite').delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    clear() {
      return new Promise((resolve, reject) => {
        const request = tx('readwrite').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
  };
}
