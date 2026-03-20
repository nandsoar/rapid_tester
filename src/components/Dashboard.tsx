import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { nanoid } from "nanoid"
import { Plus, FileText, Trash2 } from "lucide-react"
import { loadDocuments, saveDocument, deleteDocument } from "../storage"
import { createDefaultDocument } from "../types"
import type { TestDocument } from "../types"
import styles from "./Dashboard.module.scss"

export default function Dashboard() {
  const [docs, setDocs] = useState<TestDocument[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    setDocs(loadDocuments())
  }, [])

  function handleCreate() {
    const doc = createDefaultDocument(nanoid(), "Untitled Test Document")
    saveDocument(doc)
    navigate(`/edit/${doc.id}`)
  }

  function handleDelete(id: string) {
    deleteDocument(id)
    setDocs(loadDocuments())
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1>Rapid Tester</h1>
        <button className={styles.createBtn} onClick={handleCreate}>
          <Plus size={18} />
          New Document
        </button>
      </header>

      {docs.length === 0 ? (
        <div className={styles.empty}>
          <FileText size={48} strokeWidth={1} />
          <p>No test documents yet</p>
          <button className={styles.createBtn} onClick={handleCreate}>
            <Plus size={18} />
            Create your first document
          </button>
        </div>
      ) : (
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
      )}
    </div>
  )
}
