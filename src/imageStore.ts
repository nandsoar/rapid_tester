/**
 * IndexedDB-backed image store.
 * Keeps large base64 image data out of localStorage.
 */

const DB_NAME = "rapid_tester_images"
const DB_VERSION = 1
const STORE_NAME = "images"

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Save an image's base64 data URL into IndexedDB, keyed by image id. */
export async function saveImageData(id: string, data: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).put(data, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Load an image's base64 data URL from IndexedDB. Returns undefined if not found. */
export async function loadImageData(id: string): Promise<string | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const req = tx.objectStore(STORE_NAME).get(id)
    req.onsuccess = () => resolve(req.result as string | undefined)
    req.onerror = () => reject(req.error)
  })
}

/** Delete an image from IndexedDB. */
export async function deleteImageData(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Load multiple images by id. Returns a Map of id -> data URL. */
export async function loadImageDataBatch(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const db = await openDb()
  const results = new Map<string, string>()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    for (const id of ids) {
      const req = store.get(id)
      req.onsuccess = () => {
        if (req.result) results.set(id, req.result as string)
      }
    }
    tx.oncomplete = () => resolve(results)
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Compress/resize an image data URL.
 * Scales down to maxDim on the longest side, re-encodes as JPEG at given quality.
 * Returns the compressed data URL. PNGs with transparency are kept as PNG.
 */
export function compressImage(dataUrl: string, maxDim = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      // If already small enough, return original
      if (width <= maxDim && height <= maxDim) {
        resolve(dataUrl)
        return
      }
      // Scale down
      if (width > height) {
        height = Math.round(height * (maxDim / width))
        width = maxDim
      } else {
        width = Math.round(width * (maxDim / height))
        height = maxDim
      }
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0, width, height)
      // Use JPEG for compression (smaller files)
      const compressed = canvas.toDataURL("image/jpeg", quality)
      resolve(compressed)
    }
    img.onerror = () => resolve(dataUrl) // fallback to original on error
    img.src = dataUrl
  })
}
