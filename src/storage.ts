import type { TestDocument } from "./types"

const STORAGE_KEY = "rapid_tester_documents"

export function loadDocuments(): TestDocument[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  return JSON.parse(raw) as TestDocument[]
}

export function saveDocuments(docs: TestDocument[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs))
}

export function loadDocument(id: string): TestDocument | undefined {
  return loadDocuments().find(d => d.id === id)
}

export function saveDocument(doc: TestDocument): void {
  const docs = loadDocuments()
  const idx = docs.findIndex(d => d.id === doc.id)
  const updated = { ...doc, updatedAt: new Date().toISOString() }
  if (idx >= 0) {
    docs[idx] = updated
  } else {
    docs.push(updated)
  }
  saveDocuments(docs)
}

export function deleteDocument(id: string): void {
  saveDocuments(loadDocuments().filter(d => d.id !== id))
}
