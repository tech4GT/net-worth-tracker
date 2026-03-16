// IndexedDB-backed storage for Zustand persist middleware.
// Much more robust than localStorage: larger quota, survives browser cleanup
// when combined with navigator.storage.persist().

const DB_NAME = 'nwt-db'
const STORE_NAME = 'kv'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txn(mode, cb) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const store = tx.objectStore(STORE_NAME)
        const result = cb(store)
        tx.oncomplete = () => resolve(result._result)
        tx.onerror = () => reject(tx.error)

        // For get operations, capture the result
        if (result.onsuccess !== undefined) {
          result.onsuccess = () => {
            result._result = result.result
          }
        }
      })
  )
}

// Zustand-compatible async storage adapter with automatic localStorage migration
export const idbStorage = {
  getItem: async (name) => {
    const value = await txn('readonly', (store) => store.get(name))
    // If IndexedDB is empty, check localStorage for existing data and migrate it
    if (value == null) {
      const lsValue = localStorage.getItem(name)
      if (lsValue != null) {
        const parsed = JSON.parse(lsValue)
        // Migrate to IndexedDB
        await txn('readwrite', (store) => {
          store.put(parsed, name)
          return { _result: undefined }
        })
        // Clean up localStorage
        localStorage.removeItem(name)
        return parsed
      }
    }
    return value
  },
  setItem: (name, value) =>
    txn('readwrite', (store) => {
      store.put(value, name)
      return { _result: undefined }
    }),
  removeItem: (name) =>
    txn('readwrite', (store) => {
      store.delete(name)
      return { _result: undefined }
    }),
}

// Request persistent storage so the browser won't evict our data
export async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const granted = await navigator.storage.persist()
    if (granted) {
      console.log('[NWT] Persistent storage granted — data is durable')
    }
  }
}
