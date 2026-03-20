import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { nanoid } from "nanoid"
import { Plus, FileText, Trash2, Download, Settings, RefreshCw, Loader2, Bug, BookOpen, ClipboardList } from "lucide-react"
import { loadDocuments, saveDocument, deleteDocument } from "../storage"
import { createDefaultDocument } from "../types"
import type { TestDocument } from "../types"
import { loadAdoSettings, runSavedQuery, fetchWorkItemsBatch, fetchWorkItem, mapWorkItemToHeader, isAdoConfigured } from "../ado"
import type { MappedWorkItem, AdoWorkItemSummary } from "../ado"
import ImportWorkItem from "./ImportWorkItem"
import styles from "./Dashboard.module.scss"

interface QueryResult {
  queryId: string
  queryName: string
  items: AdoWorkItemSummary[]
  loading: boolean
  error: string
}

export default function Dashboard() {
  const [docs, setDocs] = useState<TestDocument[]>([])
  const [showImport, setShowImport] = useState(false)
  const [queryResults, setQueryResults] = useState<QueryResult[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    setDocs(loadDocuments())
  }, [])

  const loadQueries = useCallback(async () => {
    const settings = loadAdoSettings()
    if (!settings.savedQueries.length || !isAdoConfigured()) return

    const initial: QueryResult[] = settings.savedQueries.map(q => ({
      queryId: q.id,
      queryName: q.name,
      items: [],
      loading: true,
      error: "",
    }))
    setQueryResults(initial)

    for (let i = 0; i < settings.savedQueries.length; i++) {
      const q = settings.savedQueries[i]
      try {
        const ids = await runSavedQuery(q.id)
        const items = await fetchWorkItemsBatch(ids.slice(0, 50)) // limit to 50
        setQueryResults(prev =>
          prev.map(r =>
            r.queryId === q.id ? { ...r, items, loading: false } : r
          )
        )
      } catch (err) {
        setQueryResults(prev =>
          prev.map(r =>
            r.queryId === q.id
              ? { ...r, loading: false, error: err instanceof Error ? err.message : "Failed" }
              : r
          )
        )
      }
    }
  }, [])

  useEffect(() => {
    loadQueries()
  }, [loadQueries])

  function handleCreate() {
    const doc = createDefaultDocument(nanoid(), "Untitled Test Document")
    saveDocument(doc)
    navigate(`/edit/${doc.id}`)
  }

  function handleImport(mapped: MappedWorkItem) {
    const doc = createDefaultDocument(nanoid(), mapped.documentName)
    doc.header = { ...doc.header, ...mapped.header }
    doc.adoFields = mapped.rawFields
    doc.adoWorkItemId = mapped.workItemId
    saveDocument(doc)
    setShowImport(false)
    navigate(`/edit/${doc.id}`)
  }

  async function handleOpenWorkItem(wiId: number) {
    try {
      const wi = await fetchWorkItem(wiId)
      const mapped = mapWorkItemToHeader(wi)
      const doc = createDefaultDocument(nanoid(), mapped.documentName)
      doc.header = { ...doc.header, ...mapped.header }
      doc.adoFields = mapped.rawFields
      doc.adoWorkItemId = mapped.workItemId
      saveDocument(doc)
      navigate(`/edit/${doc.id}`)
    } catch {
      // fallback: create doc with just the ID as name
      const doc = createDefaultDocument(nanoid(), `Work Item ${wiId}`)
      saveDocument(doc)
      navigate(`/edit/${doc.id}`)
    }
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

      {queryResults.length > 0 && (
        <div className={styles.querySections}>
          {queryResults.map(qr => (
            <section key={qr.queryId} className={styles.querySection}>
              <div className={styles.querySectionHeader}>
                <h2>{qr.queryName}</h2>
                <button
                  className={styles.refreshBtn}
                  onClick={loadQueries}
                  title="Refresh"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              {qr.loading ? (
                <div className={styles.queryLoading}>
                  <Loader2 size={18} className={styles.spin} />
                  <span>Loading...</span>
                </div>
              ) : qr.error ? (
                <p className={styles.queryError}>{qr.error}</p>
              ) : qr.items.length === 0 ? (
                <p className={styles.queryEmpty}>No items found.</p>
              ) : (
                <div className={styles.wiGrid}>
                  {qr.items.map(wi => (
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
          ))}
        </div>
      )}

      {docs.length === 0 && queryResults.length === 0 && (
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
