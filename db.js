// Kleine IndexedDB-Hülle. Alles bleibt lokal auf dem Gerät.
const DB_NAME = 'notenreader';
const DB_VERSION = 1;
const STORES = [
  ['scores', 'id'],    // Metadaten der Stücke
  ['files', 'id'],     // PDF-Daten (ArrayBuffer)
  ['annos', 'key'],    // Anmerkungen je Seite, key = "<scoreId>|<seite>"
  ['setlists', 'id'],  // Setlists
];

let dbPromise;
function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const [name, keyPath] of STORES) {
          if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then((d) => new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const st = tx.objectStore(store);
    let result;
    const req = fn(st);
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const db = {
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)),
  del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
  delPrefix: (store, prefix) => run(store, 'readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, prefix + '￿'))),
  allPrefix: (store, prefix) => run(store, 'readonly', (s) => s.getAll(IDBKeyRange.bound(prefix, prefix + '￿'))),
};
