import { Timer } from "lucide-react"
import type { MatrixSection, ScenarioData } from "../types"
import styles from "./PerfMatrix.module.scss"

const TRIAL_COUNT = 10

interface Props {
  section: MatrixSection
  onScenarioChange: (sectionId: string, updated: ScenarioData) => void
}

function mean(trials: (number | null)[]): number | null {
  const nums = trials.filter((v): v is number => v !== null && !isNaN(v))
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export default function PerfMatrix({ section, onScenarioChange }: Props) {
  if (section.scenarios.length === 0) return null

  const paramNames = section.parameters
    .map(p => p.name)
    .filter(n => n.trim())

  function handleTrialChange(scenario: ScenarioData, trialIdx: number, raw: string) {
    const trials = [...(scenario.perfTrials ?? new Array(TRIAL_COUNT).fill(null))]
    trials[trialIdx] = raw === "" ? null : parseFloat(raw)
    onScenarioChange(section.id, { ...scenario, perfTrials: trials })
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Timer size={16} />
        <span className={styles.title}>Performance Trials</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.numCol}>#</th>
              <th className={styles.nameCol}>Scenario</th>
              {paramNames.map(p => (
                <th key={p} className={styles.paramCol}>{p}</th>
              ))}
              {Array.from({ length: TRIAL_COUNT }, (_, i) => (
                <th key={i} className={styles.trialCol}>T{i + 1}</th>
              ))}
              <th className={styles.meanCol}>Avg</th>
            </tr>
          </thead>
          <tbody>
            {section.scenarios.map((sc, idx) => {
              const trials = sc.perfTrials ?? new Array(TRIAL_COUNT).fill(null)
              const avg = mean(trials)
              return (
                <tr key={sc.id}>
                  <td className={styles.numCol}>{idx + 1}</td>
                  <td className={styles.nameCol} title={sc.title || sc.description}>
                    {sc.title || `Scenario ${idx + 1}`}
                  </td>
                  {paramNames.map(p => (
                    <td key={p} className={styles.paramCol}>{sc.matrixCombo[p] ?? ""}</td>
                  ))}
                  {Array.from({ length: TRIAL_COUNT }, (_, i) => (
                    <td key={i} className={styles.trialCol}>
                      <input
                        type="number"
                        step="any"
                        className={styles.trialInput}
                        value={trials[i] !== null && trials[i] !== undefined ? trials[i] : ""}
                        onChange={e => handleTrialChange(sc, i, e.target.value)}
                        placeholder="—"
                      />
                    </td>
                  ))}
                  <td className={styles.meanCol}>
                    {avg !== null ? avg.toFixed(1) : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
