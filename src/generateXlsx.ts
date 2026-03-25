import ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import type { TestDocument } from "./types"

const TRIALS = 10

// ExcelJS requires 8-char ARGB (alpha + RGB)
const TITLE_BG = "FF1F4E3D"
const TITLE_FG = "FFFFFFFF"
const DESC_BG = "FFE8F0E8"
const DESC_FG = "FF333333"
const HEADER_BG = "FF2D6B4F"
const HEADER_FG = "FFFFFFFF"

function colLetter(col: number): string {
  let s = ""
  let n = col
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function fillRow(ws: ExcelJS.Worksheet, row: number, cols: number, fill: ExcelJS.Fill) {
  for (let c = 1; c <= cols; c++) {
    ws.getCell(row, c).fill = fill
  }
}

export async function generateXlsx(doc: TestDocument) {
  const wb = new ExcelJS.Workbook()

  for (const section of doc.matrixSections) {
    const paramNames = section.parameters.map(p => p.name).filter(n => n)
    const nParams = paramNames.length
    const scenarios = section.scenarios

    // Build header columns: # | [params...] | Status | Trial 1..N | Mean | P50 | P95 | P99
    const fixedBefore = nParams + 2 // # + params + Status
    const trialStartCol = fixedBefore + 1
    const trialEndCol = trialStartCol + TRIALS - 1
    const meanCol = trialEndCol + 1
    const p50Col = meanCol + 1
    const p95Col = p50Col + 1
    const p99Col = p95Col + 1
    const totalCols = p99Col

    const headers: string[] = ["#"]
    for (const p of paramNames) headers.push(p)
    headers.push("Status")
    for (let t = 1; t <= TRIALS; t++) headers.push(`Trial ${t}`)
    headers.push("Mean", "P50", "P95", "P99")

    // Sheet name: use matrix section title, max 31 chars, strip invalid chars
    const sheetTitle = (section.title || "Sheet").replace(/[\\/*?[\]:]/g, "").slice(0, 31) || "Sheet"
    const ws = wb.addWorksheet(sheetTitle)

    const titleFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_BG } }
    const descFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: DESC_BG } }
    const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } }

    // Row 1: Section title
    ws.mergeCells(1, 1, 1, totalCols)
    const titleCell = ws.getCell(1, 1)
    titleCell.value = section.title || ""
    titleCell.font = { bold: true, color: { argb: TITLE_FG }, size: 14 }
    titleCell.fill = titleFill
    titleCell.alignment = { horizontal: "center", vertical: "middle" }
    ws.getRow(1).height = 28
    fillRow(ws, 1, totalCols, titleFill)

    // Row 2: Description from section
    const descText = section.description || ""
    ws.mergeCells(2, 1, 2, totalCols)
    const descCell = ws.getCell(2, 1)
    descCell.value = descText
    descCell.font = { italic: true, color: { argb: DESC_FG }, size: 10 }
    descCell.fill = descFill
    descCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    ws.getRow(2).height = 22
    fillRow(ws, 2, totalCols, descFill)

    // Row 3: Column headers
    for (let i = 0; i < headers.length; i++) {
      const cell = ws.getCell(3, i + 1)
      cell.value = headers[i]
      cell.font = { bold: true, color: { argb: HEADER_FG }, size: 10 }
      cell.fill = headerFill
      cell.alignment = { horizontal: "center", wrapText: true }
    }

    // Data rows (row 4+)
    for (let tcIdx = 0; tcIdx < scenarios.length; tcIdx++) {
      const scenario = scenarios[tcIdx]
      const r = tcIdx + 4

      // #
      ws.getCell(r, 1).value = tcIdx + 1
      ws.getCell(r, 1).font = { size: 10 }

      // Parameter values (if any)
      for (let pIdx = 0; pIdx < nParams; pIdx++) {
        const cell = ws.getCell(r, 2 + pIdx)
        cell.value = scenario.matrixCombo[paramNames[pIdx]] ?? ""
        cell.font = { size: 10 }
      }

      // Status
      const statusCell = ws.getCell(r, nParams + 2)
      statusCell.value = scenario.status === "not-run" ? "TODO" : scenario.status.toUpperCase()
      statusCell.font = { size: 10 }

      // Pre-fill trial columns from perfTrials data if available
      const trials = scenario.perfTrials ?? []
      for (let t = 0; t < TRIALS; t++) {
        const val = trials[t]
        if (val !== null && val !== undefined && !isNaN(val)) {
          ws.getCell(r, trialStartCol + t).value = val
          ws.getCell(r, trialStartCol + t).font = { size: 10 }
        }
      }

      // Stats formulas
      const sL = colLetter(trialStartCol)
      const eL = colLetter(trialEndCol)
      const range = `${sL}${r}:${eL}${r}`

      const setFormula = (col: number, formula: string) => {
        const cell = ws.getCell(r, col)
        cell.value = { formula } as ExcelJS.CellFormulaValue
        cell.font = { bold: true, size: 10 }
      }

      setFormula(meanCol, `IF(COUNTA(${range})>0,AVERAGE(${range}),"")`)
      setFormula(p50Col, `IF(COUNTA(${range})>0,PERCENTILE(${range},0.5),"")`)
      setFormula(p95Col, `IF(COUNTA(${range})>0,PERCENTILE(${range},0.95),"")`)
      setFormula(p99Col, `IF(COUNTA(${range})>0,PERCENTILE(${range},0.99),"")`)
    }

    // Column widths
    ws.getColumn(1).width = 5
    for (let pIdx = 0; pIdx < nParams; pIdx++) {
      ws.getColumn(2 + pIdx).width = 14
    }
    ws.getColumn(nParams + 2).width = 10
    for (let t = 0; t < TRIALS; t++) {
      ws.getColumn(trialStartCol + t).width = 10
    }
    for (const c of [meanCol, p50Col, p95Col, p99Col]) {
      ws.getColumn(c).width = 10
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  saveAs(blob, `${doc.name || "test_cases"}.xlsx`)
}
