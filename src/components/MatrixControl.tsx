import { useState } from "react"
import { nanoid } from "nanoid"
import { Plus, Trash2, X, Grid3X3, Check, Timer, Filter } from "lucide-react"
import type { MatrixSection, MatrixParameter, ScenarioData } from "../types"
import { computePerfStats, formatStat } from "../types"
import styles from "./MatrixControl.module.scss"

interface Props {
  index: number
  section: MatrixSection
  onChange: (section: MatrixSection) => void
  onDelete: () => void
}

export default function MatrixControl({
  index,
  section,
  onChange,
  onDelete,
}: Props) {
  const [showPicker, setShowPicker] = useState(false)

  function addParameter() {
    const param: MatrixParameter = { id: nanoid(), name: "", values: [""] }
    onChange({ ...section, parameters: [...section.parameters, param] })
  }

  function updateParameter(paramId: string, updated: MatrixParameter) {
    const old = section.parameters.find(p => p.id === paramId)
    if (!old) return

    // Auto-sync renamed param key across all scenario combos
    let updatedScenarios = section.scenarios
    if (old.name && updated.name && old.name !== updated.name) {
      updatedScenarios = updatedScenarios.map(s => {
        if (!(old.name in s.matrixCombo)) return s
        const combo = { ...s.matrixCombo }
        combo[updated.name] = combo[old.name]
        delete combo[old.name]
        return { ...s, matrixCombo: combo }
      })
    }

    onChange({
      ...section,
      parameters: section.parameters.map(p =>
        p.id === paramId ? updated : p
      ),
      scenarios: updatedScenarios,
    })
  }

  function deleteParameter(paramId: string) {
    onChange({
      ...section,
      parameters: section.parameters.filter(p => p.id !== paramId),
    })
  }

  function addValue(paramId: string) {
    const param = section.parameters.find(p => p.id === paramId)
    if (!param) return
    updateParameter(paramId, { ...param, values: [...param.values, ""] })
  }

  function updateValue(paramId: string, valueIdx: number, value: string) {
    const param = section.parameters.find(p => p.id === paramId)
    if (!param) return
    const oldVal = param.values[valueIdx]
    const values = [...param.values]
    values[valueIdx] = value

    // Auto-sync renamed value across scenario combos
    let updatedScenarios = section.scenarios
    if (param.name && oldVal && value && oldVal !== value) {
      updatedScenarios = updatedScenarios.map(s => {
        if (s.matrixCombo[param.name] !== oldVal) return s
        return { ...s, matrixCombo: { ...s.matrixCombo, [param.name]: value } }
      })
    }

    onChange({
      ...section,
      parameters: section.parameters.map(p =>
        p.id === paramId ? { ...param, values } : p
      ),
      scenarios: updatedScenarios,
    })
  }

  function removeValue(paramId: string, valueIdx: number) {
    const param = section.parameters.find(p => p.id === paramId)
    if (!param || param.values.length <= 1) return
    updateParameter(paramId, {
      ...param,
      values: param.values.filter((_, i) => i !== valueIdx),
    })
  }

  // Generate all combinations from parameters, respecting appliesWhen conditions
  function getCombinations(): Record<string, string>[] {
    const validParams = section.parameters.filter(
      p => p.name.trim() && p.values.some(v => v.trim())
    )
    if (validParams.length === 0) return []

    let combos: Record<string, string>[] = [{}]
    for (const param of validParams) {
      const next: Record<string, string>[] = []
      for (const combo of combos) {
        // Check if this param applies given the current combo
        if (param.appliesWhen) {
          const triggerParam = section.parameters.find(p => p.id === param.appliesWhen!.paramId)
          if (triggerParam) {
            const triggerVal = combo[triggerParam.name]
            if (triggerVal && !param.appliesWhen.values.includes(triggerVal)) {
              // Condition not met — param is N/A for this combo
              next.push({ ...combo, [param.name]: "N/A" })
              continue
            }
          }
        }
        for (const value of param.values) {
          if (value.trim()) {
            next.push({ ...combo, [param.name]: value })
          }
        }
      }
      combos = next
    }
    // Deduplicate (N/A collapse can create dupes)
    const seen = new Set<string>()
    return combos.filter(c => {
      const key = JSON.stringify(c)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function addAllCombos() {
    const newScenarios = combos
      .filter(c => !isComboAlreadyAdded(c))
      .map((combo) => {
        return {
          id: nanoid(),
          matrixCombo: combo,
          status: "not-run" as const,
          title: "",
          description: "",
          expected: "",
          setup: "",
          steps: "",
        }
      })
    if (newScenarios.length > 0) {
      onChange({ ...section, scenarios: [...section.scenarios, ...newScenarios] })
    }
  }

  function isComboAlreadyAdded(combo: Record<string, string>): boolean {
    return section.scenarios.some(
      s => JSON.stringify(s.matrixCombo) === JSON.stringify(combo)
    )
  }

  function addScenarioFromCombo(combo: Record<string, string>) {
    const scenario: ScenarioData = {
      id: nanoid(),
      matrixCombo: combo,
      status: "not-run",
      title: "",
      description: "",
      expected: "",
      setup: "",
      steps: "",
    }
    onChange({ ...section, scenarios: [...section.scenarios, scenario] })
  }

  const combos = getCombinations()

  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <Grid3X3 size={16} />
        <input
          className={styles.sectionTitle}
          value={section.title}
          onChange={e => onChange({ ...section, title: e.target.value })}
          placeholder={`Matrix ${index + 1} — Title...`}
        />
        <button
          className={`${styles.perfToggle} ${section.isPerformance ? styles.perfActive : ""}`}
          onClick={() => onChange({ ...section, isPerformance: !section.isPerformance })}
          title={section.isPerformance ? "Disable performance trials" : "Enable performance trials"}
        >
          <Timer size={14} />
          Perf
        </button>
        <button className={styles.deleteBtn} onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>

      <textarea
        className={styles.sectionDesc}
        value={section.description}
        onChange={e => onChange({ ...section, description: e.target.value })}
        placeholder="Matrix description..."
        rows={2}
      />

      <div className={styles.parameters}>
        {section.parameters.map(param => {
          // Other params that could be used as a condition trigger (must appear before this one)
          const otherParams = section.parameters.filter(
            p => p.id !== param.id && p.name.trim() && p.values.some(v => v.trim())
          )
          const triggerParam = param.appliesWhen
            ? section.parameters.find(p => p.id === param.appliesWhen!.paramId)
            : null

          return (
          <div key={param.id} className={styles.paramGroup}>
            <div className={styles.paramRow}>
            <input
              className={styles.paramName}
              value={param.name}
              onChange={e =>
                updateParameter(param.id, { ...param, name: e.target.value })
              }
              placeholder="Parameter name..."
            />
            <div className={styles.valuesList}>
              {param.values.map((val, vi) => (
                <div key={vi} className={styles.valueChip}>
                  <input
                    value={val}
                    onChange={e => updateValue(param.id, vi, e.target.value)}
                    placeholder="value..."
                  />
                  {param.values.length > 1 && (
                    <button onClick={() => removeValue(param.id, vi)}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button
                className={styles.addValue}
                onClick={() => addValue(param.id)}
              >
                <Plus size={12} />
              </button>
            </div>
            <button
              className={`${styles.conditionToggle} ${param.appliesWhen ? styles.conditionActive : ""}`}
              onClick={() => {
                if (param.appliesWhen) {
                  updateParameter(param.id, { ...param, appliesWhen: undefined })
                } else if (otherParams.length > 0) {
                  updateParameter(param.id, {
                    ...param,
                    appliesWhen: { paramId: otherParams[0].id, values: [] },
                  })
                }
              }}
              title={param.appliesWhen ? "Remove condition" : "Add condition (applies when...)"}
              disabled={!param.appliesWhen && otherParams.length === 0}
            >
              <Filter size={12} />
            </button>
            <button
              className={styles.deleteParam}
              onClick={() => deleteParameter(param.id)}
            >
              <Trash2 size={14} />
            </button>
            </div>
            {param.appliesWhen && (
              <div className={styles.conditionRow}>
                <span className={styles.conditionLabel}>Applies when</span>
                <select
                  className={styles.conditionSelect}
                  value={param.appliesWhen.paramId}
                  onChange={e => updateParameter(param.id, {
                    ...param,
                    appliesWhen: { paramId: e.target.value, values: [] },
                  })}
                >
                  {otherParams.map(p => (
                    <option key={p.id} value={p.id}>{p.name || "(unnamed)"}</option>
                  ))}
                </select>
                <span className={styles.conditionLabel}>=</span>
                <div className={styles.conditionValues}>
                  {triggerParam?.values.filter(v => v.trim()).map(v => {
                    const isChecked = param.appliesWhen!.values.includes(v)
                    return (
                      <label key={v} className={`${styles.conditionChip} ${isChecked ? styles.conditionChipActive : ""}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const vals = isChecked
                              ? param.appliesWhen!.values.filter(x => x !== v)
                              : [...param.appliesWhen!.values, v]
                            updateParameter(param.id, {
                              ...param,
                              appliesWhen: { ...param.appliesWhen!, values: vals },
                            })
                          }}
                        />
                        {v}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          )
        })}

        <button className={styles.addParam} onClick={addParameter}>
          <Plus size={14} />
          Add Parameter
        </button>
      </div>

      {combos.length > 0 && (
        <div className={styles.pickerArea}>
          <div className={styles.pickerActions}>
            <button
              className={styles.pickerToggle}
              onClick={() => setShowPicker(p => !p)}
            >
              {showPicker ? "Hide" : "Pick"} Scenarios ({combos.length} combos)
            </button>
            {showPicker && combos.some(c => !isComboAlreadyAdded(c)) && (
              <button className={styles.addAllBtn} onClick={addAllCombos}>
                <Plus size={14} />
                Add All
              </button>
            )}
          </div>

          {showPicker && (
            <div className={styles.comboTable}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    {Object.keys(combos[0]).map(key => (
                      <th key={key}>{key}</th>
                    ))}
                    {section.isPerformance && <th>Avg</th>}
                    {section.isPerformance && <th>P50</th>}
                    {section.isPerformance && <th>P95</th>}
                    {section.isPerformance && <th>P99</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {combos.map((combo, ci) => {
                    const added = isComboAlreadyAdded(combo)
                    const matchedIdx = added
                      ? section.scenarios.findIndex(s => JSON.stringify(s.matrixCombo) === JSON.stringify(combo))
                      : -1
                    const matchedScenario = matchedIdx >= 0 ? section.scenarios[matchedIdx] : undefined
                    const stats = matchedScenario ? computePerfStats(matchedScenario.perfTrials) : { avg: null, p50: null, p95: null, p99: null }
                    return (
                      <tr key={ci} className={added ? styles.addedRow : ""}>
                        <td className={styles.numCell}>{matchedIdx >= 0 ? matchedIdx + 1 : ci + 1}</td>
                        {Object.entries(combo).map(([key, val], vi) => (
                          <td key={vi} className={val === "N/A" ? styles.naCell : ""}>{val}</td>
                        ))}
                        {section.isPerformance && (
                          <td className={styles.avgCell}>{formatStat(stats.avg)}</td>
                        )}
                        {section.isPerformance && (
                          <td className={styles.avgCell}>{formatStat(stats.p50)}</td>
                        )}
                        {section.isPerformance && (
                          <td className={styles.avgCell}>{formatStat(stats.p95)}</td>
                        )}
                        {section.isPerformance && (
                          <td className={styles.avgCell}>{formatStat(stats.p99)}</td>
                        )}
                        <td>
                          <button
                            className={`${styles.rowAddBtn} ${added ? styles.added : ""}`}
                            onClick={() => !added && addScenarioFromCombo(combo)}
                            disabled={added}
                          >
                            {added ? <Check size={14} /> : <Plus size={14} />}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
