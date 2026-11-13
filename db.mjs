const DB_NAME = 'imei-stock-local-v1';
const DB_VERSION = 1;
let dbPromise;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('phones')) {
        const phones = db.createObjectStore('phones', { keyPath: 'id' });
        phones.createIndex('imei', 'imei', { unique: true });
        phones.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('events')) {
        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('at', 'at');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { dbPromise = null; reject(request.error); };
    request.onblocked = () => { dbPromise = null; reject(new Error('Ferme les autres onglets de l’application et réessaie.')); };
  });
  return dbPromise;
}
function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function listData() {
  const db = await openDB();
  const tx = db.transaction(['phones', 'events'], 'readonly');
  const phonesReq = requestAsPromise(tx.objectStore('phones').getAll());
  const eventsReq = requestAsPromise(tx.objectStore('events').getAll());
  const [phones, events] = await Promise.all([phonesReq, eventsReq]);
  return { phones, events };
}
export async function commitChange(phone, event, remove = false) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['phones', 'events'], 'readwrite');
    if (remove) tx.objectStore('phones').delete(phone.id);
    else tx.objectStore('phones').put(phone);
    tx.objectStore('events').put(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('La modification a échoué.'));
  });
}
export async function restoreData(phones, events) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['phones', 'events'], 'readwrite');
    tx.objectStore('phones').clear();
    tx.objectStore('events').clear();
    for (const phone of phones) tx.objectStore('phones').put(phone);
    for (const event of events) tx.objectStore('events').put(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Sauvegarde invalide.'));
  });
}