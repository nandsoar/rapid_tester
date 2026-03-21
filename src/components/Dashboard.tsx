import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { nanoid } from "nanoid"
import { Plus, FileText, Trash2, Download, Settings, RefreshCw, Loader2, Bug, BookOpen, ClipboardList } from "lucide-react"
import { loadDocuments, saveDocument, deleteDocument } from "../storage"
import { createDefaultDocument } from "../types"
import type { TestDocument } from "../types"
import { loadAdoSettings, runSavedQuery, fetchWorkItemsBatch, fetchWorkItem, mapWorkItemToHeader, isAdoConfigured, fetchTestCasesField } from "../ado"
import type { MappedWorkItem, AdoWorkItemSummary, SavedQuery } from "../ado"
import ImportWorkItem from "./ImportWorkItem"
import { parseIterationHtml } from "../parseIteration"
import styles from "./Dashboard.module.scss"

export default function Dashboard() {
  const [docs, setDocs] = useState<TestDocument[]>([])
  const [showImport, setShowImport] = useState(false)
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [activeQueryId, setActiveQueryId] = useState("")
  const [queryItems, setQueryItems] = useState<AdoWorkItemSummary[]>([])
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState("")
  const navigate = useNavigate()

  useEffect(() => {
    setDocs(loadDocuments())
    const settings = loadAdoSettings()
    if (settings.savedQueries.length && isAdoConfigured()) {
      setSavedQueries(settings.savedQueries)
    }
  }, [])

  const loadQuery = useCallback(async (queryId: string) => {
    if (!queryId) {
      setQueryItems([])
      return
    }
    setActiveQueryId(queryId)
    setQueryLoading(true)
    setQueryError("")
    setQueryItems([])

    try {
      const ids = await runSavedQuery(queryId)
      const items = await fetchWorkItemsBatch(ids.slice(0, 50))
      setQueryItems(items)
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : "Failed to load query")
    } finally {
      setQueryLoading(false)
    }
  }, [])

  function handleCreate() {
    const doc = createDefaultDocument(nanoid(), "Untitled Test Document")
    saveDocument(doc)
    navigate(`/edit/${doc.id}`)
  }

  function handleImport(mapped: MappedWorkItem) {
    setShowImport(false)
    // Reuse existing document for this work item if one exists
    const existing = docs.find(d => d.adoWorkItemId === mapped.workItemId)
    if (existing) {
      navigate(`/edit/${existing.id}`)
      return
    }
    const doc = createDefaultDocument(nanoid(), mapped.documentName)
    doc.header = { ...doc.header, ...mapped.header }
    doc.adoFields = mapped.rawFields
    doc.adoWorkItemId = mapped.workItemId
    autoLoadLatest(doc)
  }

  async function handleOpenWorkItem(wiId: number) {
    // Reuse existing document for this work item if one exists
    const existing = docs.find(d => d.adoWorkItemId === wiId)
    if (existing) {
      navigate(`/edit/${existing.id}`)
      return
    }
    try {
      const wi = await fetchWorkItem(wiId)
      const mapped = mapWorkItemToHeader(wi)
      const doc = createDefaultDocument(nanoid(), mapped.documentName)
      doc.header = { ...doc.header, ...mapped.header }
      doc.adoFields = mapped.rawFields
      doc.adoWorkItemId = mapped.workItemId
      autoLoadLatest(doc)
    } catch {
      const doc = createDefaultDocument(nanoid(), `Work Item ${wiId}`)
      doc.adoWorkItemId = wiId
      saveDocument(doc)
      navigate(`/edit/${doc.id}`)
    }
  }

  async function autoLoadLatest(doc: TestDocument) {
    try {
      if (doc.adoWorkItemId) {
        const { iterations } = await fetchTestCasesField(doc.adoWorkItemId)
        if (iterations.length > 0) {
          const latest = iterations.reduce((a, b) => b.number > a.number ? b : a)
          const parsed = parseIterationHtml(latest.content)
          doc.header = { ...doc.header, ...parsed.header }
          doc.notes = parsed.notes
          doc.matrixSections = parsed.matrixSections
        }
      }
    } catch { /* proceed without iteration data */ }
    saveDocument(doc)
    navigate(`/edit/${doc.id}`)
  }

  function handleDelete(id: string) {
    deleteDocument(id)
    setDocs(loadDocuments())
  }

  const typeIcon = (type: string) => {
    const t = type.toLowerCase()
    if (t.includes("bug")) return <Bug size={16} />
    if (t.includes("story") || t.includes("user")) return <BookOpen size={16} />
    return <ClipboardList size={16} />
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1>Rapid Tester</h1>
        <div className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            onClick={() => navigate("/settings")}
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div className={styles.startActions}>
        <button className={styles.createBtn} onClick={handleCreate}>
          <Plus size={18} />
          Blank Document
        </button>
        <button className={styles.importBtn} onClick={() => setShowImport(true)}>
          <Download size={18} />
          Import Work Item
        </button>
      </div>

      {savedQueries.length > 0 && (
        <section className={styles.querySection}>
          <div className={styles.querySectionHeader}>
            <select
              className={styles.queryPicker}
              value={activeQueryId}
              onChange={e => loadQuery(e.target.value)}
            >
              <option value="">Select a query...</option>
              {savedQueries.map(q => (
                <option key={q.id} value={q.id}>{q.name}</option>
              ))}
            </select>
            {activeQueryId && (
              <button
                className={styles.refreshBtn}
                onClick={() => loadQuery(activeQueryId)}
                title="Refresh"
                disabled={queryLoading}
              >
                <RefreshCw size={14} className={queryLoading ? styles.spin : undefined} />
              </button>
            )}
          </div>

          {queryLoading && (
            <div className={styles.queryLoading}>
              <Loader2 size={18} className={styles.spin} />
              <span>Loading...</span>
            </div>
          )}
          {queryError && <p className={styles.queryError}>{queryError}</p>}
          {!queryLoading && !queryError && activeQueryId && queryItems.length === 0 && (
            <p className={styles.queryEmpty}>No items found.</p>
          )}
          {queryItems.length > 0 && (
            <div className={styles.wiGrid}>
              {queryItems.map(wi => (
                <div
                  key={wi.id}
                  className={styles.wiCard}
                  onClick={() => handleOpenWorkItem(wi.id)}
                >
                  <div className={styles.wiCardHeader}>
                    {typeIcon(wi.type)}
                    <span className={styles.wiType}>{wi.type}</span>
                    <span className={styles.wiId}>#{wi.id}</span>
                  </div>
                  <h3 className={styles.wiTitle}>{wi.title}</h3>
                  <div className={styles.wiMeta}>
                    <span className={styles.wiState}>{wi.state}</span>
                    {wi.assignedTo && <span>{wi.assignedTo}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {docs.length === 0 && savedQueries.length === 0 && (
        <div className={styles.empty}>
          <FileText size={48} strokeWidth={1} />
          <p>No test documents yet</p>
        </div>
      )}

      {docs.length > 0 && (
        <section className={styles.docsSection}>
          <h2>My Documents</h2>
          <div className={styles.grid}>
            {docs.map(doc => (
              <div
                key={doc.id}
                className={styles.card}
                onClick={() => navigate(`/edit/${doc.id}`)}
              >
                <div className={styles.cardHeader}>
                  <FileText size={20} />
                  <h2>{doc.name}</h2>
                </div>
                <div className={styles.cardMeta}>
                  <span>
                    {doc.matrixSections.length} matrix
                    {doc.matrixSections.length !== 1 ? "es" : ""}
                  </span>
                  <span>•</span>
                  <span>
                    {doc.matrixSections.reduce(
                      (sum, m) => sum + m.scenarios.length,
                      0
                    )}{" "}
                    scenarios
                  </span>
                </div>
                <div className={styles.cardFooter}>
                  <span>
                    Updated{" "}
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </span>
                  <button
                    className={styles.deleteBtn}
                    onClick={e => {
                      e.stopPropagation()
                      handleDelete(doc.id)
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showImport && (
        <ImportWorkItem
          onImport={handleImport}
          onCancel={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
