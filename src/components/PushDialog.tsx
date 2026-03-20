import { useState, useEffect } from "react"
import { Upload, X, Plus, RefreshCw, Loader2 } from "lucide-react"
import { fetchTestCasesField, type TestIteration } from "../ado"
import styles from "./PushDialog.module.scss"

interface PushDialogProps {
  workItemId: number
  onPush: (target: number | null) => void
  onClose: () => void
}

export default function PushDialog({ workItemId, onPush, onClose }: PushDialogProps) {
  const [iterations, setIterations] = useState<TestIteration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null) // null = new

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { iterations } = await fetchTestCasesField(workItemId)
        if (cancelled) return
        setIterations(iterations)
        setSelected(null)
      } catch (err) {
        if (cancelled) return
        setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [workItemId])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Push to ADO</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>
              <Loader2 size={20} className={styles.spin} />
              Loading iterations…
            </div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : (
            <>
              <p className={styles.hint}>
                Choose where to push. Select "New Iteration" to add a new version,
                or select an existing iteration to replace it.
              </p>
              <div className={styles.list}>
                <label className={`${styles.option} ${selected === null ? styles.selected : ""}`}>
                  <input
                    type="radio"
                    name="iteration"
                    checked={selected === null}
                    onChange={() => setSelected(null)}
                  />
                  <Plus size={14} />
                  <span className={styles.optionLabel}>New Iteration</span>
                  <span className={styles.optionMeta}>
                    will be Iteration {iterations.length > 0 ? Math.max(...iterations.map(i => i.number)) + 1 : 1}
                  </span>
                </label>

                {iterations.map(it => (
                  <label
                    key={it.number}
                    className={`${styles.option} ${selected === it.number ? styles.selected : ""}`}
                  >
                    <input
                      type="radio"
                      name="iteration"
                      checked={selected === it.number}
                      onChange={() => setSelected(it.number)}
                    />
                    <RefreshCw size={14} />
                    <span className={styles.optionLabel}>Iteration {it.number}</span>
                    <span className={styles.optionMeta}>{it.timestamp}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            className={styles.pushBtn}
            disabled={loading || !!error}
            onClick={() => onPush(selected)}
          >
            <Upload size={14} />
            {selected === null ? "Push New Iteration" : `Replace Iteration ${selected}`}
          </button>
        </div>
      </div>
    </div>
  )
}
