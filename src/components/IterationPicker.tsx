import { useState, useEffect } from "react"
import { X, FileText, Plus, Loader2 } from "lucide-react"
import { fetchTestCasesField, type TestIteration } from "../ado"
import styles from "./PushDialog.module.scss"

interface IterationPickerProps {
  workItemId: number
  onSelect: (iteration: TestIteration | null) => void
  onClose: () => void
}

export default function IterationPicker({ workItemId, onSelect, onClose }: IterationPickerProps) {
  const [iterations, setIterations] = useState<TestIteration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<"blank" | number>("blank")

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { iterations } = await fetchTestCasesField(workItemId)
        if (cancelled) return
        setIterations(iterations)
        // Auto-select latest iteration if any exist
        if (iterations.length > 0) {
          setSelected(iterations[0].number)
        }
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

  function handleConfirm() {
    if (selected === "blank") {
      onSelect(null)
    } else {
      const iter = iterations.find(it => it.number === selected)
      onSelect(iter ?? null)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Load Iteration</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>
              <Loader2 size={20} className={styles.spin} />
              Checking for existing iterations…
            </div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : iterations.length === 0 ? (
            <>
              <p className={styles.hint}>No existing iterations found. Starting with a blank editor.</p>
              <div className={styles.footer}>
                <button className={styles.pushBtn} onClick={() => onSelect(null)}>
                  <Plus size={14} />
                  Start Blank
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.hint}>
                This work item has existing test iterations. Load one to populate the editor,
                or start blank.
              </p>
              <div className={styles.list}>
                <label className={`${styles.option} ${selected === "blank" ? styles.selected : ""}`}>
                  <input
                    type="radio"
                    name="iteration"
                    checked={selected === "blank"}
                    onChange={() => setSelected("blank")}
                  />
                  <Plus size={14} />
                  <span className={styles.optionLabel}>Start Blank</span>
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
                    <FileText size={14} />
                    <span className={styles.optionLabel}>Iteration {it.number}</span>
                    <span className={styles.optionMeta}>{it.timestamp}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {iterations.length > 0 && !loading && !error && (
          <div className={styles.footer}>
            <button className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button className={styles.pushBtn} onClick={handleConfirm}>
              <FileText size={14} />
              {selected === "blank" ? "Start Blank" : `Load Iteration ${selected}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
