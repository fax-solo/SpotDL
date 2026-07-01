import type { HistoryEntry } from '../hooks/useHistory'

const DB_VERSION = 1
const STORE_NAME = 'entries'

function dbName(userId: string): string {
  return `sinc-history-${userId}`
}

function openDB(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(userId), DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadAll(userId: string): Promise<HistoryEntry[]> {
  try {
    const db = await openDB(userId)
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const index = store.index('timestamp')
      const req = index.openCursor(null, 'prev')
      const results: HistoryEntry[] = []
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          results.push(cursor.value)
          cursor.continue()
        } else {
          resolve(results)
        }
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function addEntry(entry: HistoryEntry, userId: string): Promise<void> {
  try {
    const db = await openDB(userId)
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {/* fall through */}
}

export async function removeEntry(id: string, userId: string): Promise<void> {
  try {
    const db = await openDB(userId)
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {/* fall through */}
}

export async function clearAll(userId: string): Promise<void> {
  try {
    const db = await openDB(userId)
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {/* fall through */}
}

export async function updateEntry(id: string, updates: Partial<HistoryEntry>, userId: string): Promise<void> {
  try {
    const db = await openDB(userId)
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const existing = getReq.result
        if (existing) {
          store.put({ ...existing, ...updates })
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {/* fall through */}
}
