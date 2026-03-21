import { useState } from "react"
import { nanoid } from "nanoid"
import { Plus, Trash2, X, Grid3X3, Check } from "lucide-react"
import type { MatrixSection, MatrixParameter, ScenarioData } from "../types"
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
    onChange({
      ...section,
      parameters: section.parameters.map(p =>
        p.id === paramId ? updated : p
      ),
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
    const values = [...param.values]
    values[valueIdx] = value
    updateParameter(paramId, { ...param, values })
  }

  function removeValue(paramId: string, valueIdx: number) {
    const param = section.parameters.find(p => p.id === paramId)
    if (!param || param.values.length <= 1) return
    updateParameter(paramId, {
      ...param,
      values: param.values.filter((_, i) => i !== valueIdx),
    })
  }

  // Generate all combinations from parameters
  function getCombinations(): Record<string, string>[] {
    const validParams = section.parameters.filter(
      p => p.name.trim() && p.values.some(v => v.trim())
    )
    if (validParams.length === 0) return []

    let combos: Record<string, string>[] = [{}]
    for (const param of validParams) {
      const next: Record<string, string>[] = []
      for (const combo of combos) {
        for (const value of param.values) {
          if (value.trim()) {
            next.push({ ...combo, [param.name]: value })
          }
        }
      }
      combos = next
    }
    return combos
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
        <button className={styles.deleteBtn} onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className={styles.parameters}>
        {section.parameters.map(param => (
          <div key={param.id} className={styles.paramRow}>
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
              className={styles.deleteParam}
              onClick={() => deleteParameter(param.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

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
                    {Object.keys(combos[0]).map(key => (
                      <th key={key}>{key}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {combos.map((combo, ci) => {
                    const added = isComboAlreadyAdded(combo)
                    return (
                      <tr key={ci} className={added ? styles.addedRow : ""}>
                        {Object.values(combo).map((val, vi) => (
                          <td key={vi}>{val}</td>
                        ))}
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
