import { useState } from "react"
import { X, Download, AlertCircle, Loader2 } from "lucide-react"
import { fetchWorkItem, mapWorkItemToHeader, isAdoConfigured } from "../ado"
import type { MappedWorkItem } from "../ado"
import styles from "./ImportWorkItem.module.scss"

interface Props {
  onImport: (mapped: MappedWorkItem) => void
  onCancel: () => void
}

export default function ImportWorkItem({ onImport, onCancel }: Props) {
  const [mode, setMode] = useState<"fetch" | "paste">(isAdoConfigured() ? "fetch" : "paste")
  const [workItemId, setWorkItemId] = useState("")
  const [jsonText, setJsonText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [preview, setPreview] = useState<MappedWorkItem | null>(null)

  async function handleFetch() {
    const id = parseInt(workItemId, 10)
    if (isNaN(id) || id <= 0) {
      setError("Enter a valid work item ID (number).")
      return
    }
    setLoading(true)
    setError("")
    try {
      const wi = await fetchWorkItem(id)
      const mapped = mapWorkItemToHeader(wi)
      setPreview(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch work item.")
    } finally {
      setLoading(false)
    }
  }

  function handleParse() {
    setError("")
    try {
      const parsed = JSON.parse(jsonText)
      // Support both full API response and just the fields object
      const fields = parsed.fields ?? parsed
      const id = parsed.id ?? 0
      const mapped = mapWorkItemToHeader({ id, fields })
      setPreview(mapped)
    } catch {
      setError("Invalid JSON. Paste the full API response or just the fields object.")
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.dialogHeader}>
          <h2>Import Work Item</h2>
          <button className={styles.closeBtn} onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        {!preview ? (
          <>
            <div className={styles.tabs}>
              <button
                className={mode === "fetch" ? styles.tabActive : styles.tab}
                onClick={() => { setMode("fetch"); setError("") }}
              >
                Fetch by ID
              </button>
              <button
                className={mode === "paste" ? styles.tabActive : styles.tab}
                onClick={() => { setMode("paste"); setError("") }}
              >
                Paste JSON
              </button>
            </div>

            {mode === "fetch" ? (
              <div className={styles.fetchForm}>
                {!isAdoConfigured() && (
                  <p className={styles.warning}>
                    <AlertCircle size={14} />
                    ADO not configured. Go to Settings first, or use Paste JSON.
                  </p>
                )}
                <label className={styles.field}>
                  <span>Work Item ID</span>
                  <input
                    type="number"
                    value={workItemId}
                    onChange={e => setWorkItemId(e.target.value)}
                    placeholder="e.g. 12345"
                    onKeyDown={e => e.key === "Enter" && handleFetch()}
                  />
                </label>
                <button
                  className={styles.primaryBtn}
                  onClick={handleFetch}
                  disabled={loading || !isAdoConfigured()}
                >
                  {loading ? <Loader2 size={16} className={styles.spin} /> : <Download size={16} />}
                  {loading ? "Fetching..." : "Fetch"}
                </button>
              </div>
            ) : (
              <div className={styles.pasteForm}>
                <p className={styles.hint}>
                  Paste the JSON response from the ADO REST API, DevTools, or Azure CLI.
                </p>
                <textarea
                  className={styles.jsonArea}
                  value={jsonText}
                  onChange={e => setJsonText(e.target.value)}
                  placeholder='{"id": 12345, "fields": { "System.Title": "...", ... }}'
                  rows={10}
                />
                <button
                  className={styles.primaryBtn}
                  onClick={handleParse}
                  disabled={!jsonText.trim()}
                >
                  <Download size={16} />
                  Parse
                </button>
              </div>
            )}

            {error && (
              <p className={styles.error}>
                <AlertCircle size={14} />
                {error}
              </p>
            )}
          </>
        ) : (
          <div className={styles.previewSection}>
            <h3>Mapped Fields</h3>
            <div className={styles.previewGrid}>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>Document Name</span>
                <span className={styles.previewValue}>{preview.documentName}</span>
              </div>
              {Object.entries(preview.header).map(([key, value]) => (
                <div key={key} className={styles.previewRow}>
                  <span className={styles.previewLabel}>{key}</span>
                  <span className={styles.previewValue}>{value || "—"}</span>
                </div>
              ))}
            </div>
            <div className={styles.previewActions}>
              <button
                className={styles.secondaryBtn}
                onClick={() => setPreview(null)}
              >
                Back
              </button>
              <button
                className={styles.primaryBtn}
                onClick={() => onImport(preview)}
              >
                Create Document
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
