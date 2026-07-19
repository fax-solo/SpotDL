const DB_NAME = 'spotdl-cache'
const DB_VERSION = 2

interface CacheEntry {
  key: string
  data: unknown
  timestamp: number
  ttl: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      for (const storeName of ['metadata', 'blobs', 'artwork']) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'key' })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }
      }
    }
    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result)
    request.onerror = () => { dbPromise = null; reject(request.error) }
  })
  return dbPromise
}

async function getTransaction(mode: IDBTransactionMode, storeName: string = 'metadata') {
  const db = await openDB()
  const transaction = db.transaction(storeName, mode)
  return { transaction, store: transaction.objectStore(storeName) }
}

export async function getCache<T>(key: string, storeName: string = 'metadata', defaultTtl: number = 300000): Promise<T | null> {
  try {
    const { store, transaction } = await getTransaction('readonly', storeName)
    return new Promise((resolve) => {
      const request = store.get(key)
      request.onsuccess = () => {
        const entry: CacheEntry | undefined = request.result
        if (!entry) { resolve(null); return }
        if (Date.now() - entry.timestamp > (entry.ttl || defaultTtl)) {
          resolve(null)
          return
        }
        resolve(entry.data as T)
      }
      request.onerror = () => resolve(null)
      transaction.oncomplete = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function setCache(key: string, data: unknown, storeName: string = 'metadata', ttl: number = 300000): Promise<void> {
  try {
    const { store, transaction } = await getTransaction('readwrite', storeName)
    const entry: CacheEntry = { key, data, timestamp: Date.now(), ttl }
    store.put(entry)
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    })
  } catch {
    // Silently fail — cache is not critical
  }
}

export async function removeCache(key: string, storeName: string = 'metadata'): Promise<void> {
  try {
    const { store, transaction } = await getTransaction('readwrite', storeName)
    store.delete(key)
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    })
  } catch {}
}

export async function clearExpired(storeName: string = 'metadata', maxAge: number = 300000): Promise<number> {
  try {
    const { store, transaction } = await getTransaction('readwrite', storeName)
    const index = store.index('timestamp')
    const cutoff = Date.now() - maxAge
    let cleared = 0
    return new Promise((resolve) => {
      const range = IDBKeyRange.upperBound(cutoff)
      const request = index.openCursor(range)
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          store.delete(cursor.primaryKey)
          cleared++
          cursor.continue()
        }
      }
      transaction.oncomplete = () => resolve(cleared)
      transaction.onerror = () => resolve(cleared)
    })
  } catch {
    return 0
  }
}

export async function getCacheSize(storeName: string = 'blobs'): Promise<number> {
  try {
    const { store } = await getTransaction('readonly', storeName)
    return new Promise((resolve) => {
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(0)
    })
  } catch {
    return 0
  }
}

const METADATA_TTL = 10 * 60 * 1000
const ARTWORK_TTL = 60 * 60 * 1000
const BLOB_TTL = 4 * 60 * 60 * 1000

export async function cacheMetadata(key: string, data: unknown): Promise<void> {
  await setCache(key, data, 'metadata', METADATA_TTL)
}

export async function getCachedMetadata<T>(key: string): Promise<T | null> {
  return getCache<T>(key, 'metadata', METADATA_TTL)
}

export async function cacheArtwork(key: string, blob: Blob): Promise<void> {
  await setCache(key, blob, 'artwork', ARTWORK_TTL)
}

export async function getCachedArtwork(key: string): Promise<Blob | null> {
  return getCache<Blob>(key, 'artwork', ARTWORK_TTL)
}

export async function cacheBlob(key: string, blob: Blob): Promise<void> {
  const size = await getCacheSize('blobs')
  if (size > 200) {
    await clearExpired('blobs', BLOB_TTL)
  }
  await setCache(key, blob, 'blobs', BLOB_TTL)
}

export async function getCachedBlob(key: string): Promise<Blob | null> {
  return getCache<Blob>(key, 'blobs', BLOB_TTL)
}