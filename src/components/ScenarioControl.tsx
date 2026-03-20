import { ChevronDown, Trash2 } from "lucide-react"
import type { ScenarioData, ScenarioStatus } from "../types"
import styles from "./ScenarioControl.module.scss"

interface Props {
  scenario: ScenarioData
  onChange: (scenario: ScenarioData) => void
  onDelete: () => void
}

const STATUS_OPTIONS: { value: ScenarioStatus; label: string }[] = [
  { value: "not-run", label: "Not Run" },
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "blocked", label: "Blocked" },
  { value: "n-a", label: "N/A" },
]

export default function ScenarioControl({
  scenario,
  onChange,
  onDelete,
}: Props) {
  function update(field: keyof ScenarioData, value: string) {
    onChange({ ...scenario, [field]: value })
  }

  const isNA = scenario.status === "n-a"

  return (
    <section className={`${styles.root} ${isNA ? styles.dimmed : ""}`}>
      <div className={styles.titleRow}>
        <input
          className={styles.title}
          value={scenario.title}
          onChange={e => update("title", e.target.value)}
          placeholder="Scenario title..."
        />
        <button className={styles.deleteBtn} onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className={styles.topRow}>
        <div className={`${styles.statusBadge} ${styles[scenario.status]}`}>
          <select
            value={scenario.status}
            onChange={e =>
              onChange({
                ...scenario,
                status: e.target.value as ScenarioStatus,
              })
            }
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} />
        </div>

        {Object.keys(scenario.matrixCombo).length > 0 && (
          <div className={styles.comboTags}>
            {Object.entries(scenario.matrixCombo).map(([param, val]) => (
              <span key={param} className={styles.tag}>
                <span className={styles.tagParam}>{param}:</span> {val}
              </span>
            ))}
          </div>
        )}
      </div>

      {!isNA && (
        <div className={styles.fields}>
          <div className={styles.field}>
            <label>Description</label>
            <textarea
              value={scenario.description}
              onChange={e => update("description", e.target.value)}
              placeholder="What is being tested..."
              rows={2}
            />
          </div>
          <div className={styles.field}>
            <label>Expected Result</label>
            <textarea
              value={scenario.expected}
              onChange={e => update("expected", e.target.value)}
              placeholder="What should happen..."
              rows={2}
            />
          </div>
          <div className={styles.field}>
            <label>Setup / Preconditions</label>
            <textarea
              value={scenario.setup}
              onChange={e => update("setup", e.target.value)}
              placeholder="Required state before testing..."
              rows={2}
            />
          </div>
          <div className={styles.field}>
            <label>Steps</label>
            <textarea
              value={scenario.steps}
              onChange={e => update("steps", e.target.value)}
              placeholder="1. Do this&#10;2. Then that&#10;3. Verify..."
              rows={3}
            />
          </div>
        </div>
      )}
    </section>
  )
}
