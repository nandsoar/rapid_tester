import ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import { computePerfStats } from "./types"
import type { TestDocument } from "./types"

const TRIALS = 10

// ExcelJS requires 8-char ARGB (alpha + RGB)
const TITLE_BG = "FF1F4E3D"
const TITLE_FG = "FFFFFFFF"
const DESC_BG = "FFE8F0E8"
const DESC_FG = "FF333333"
const HEADER_BG = "FF2D6B4F"
const HEADER_FG = "FFFFFFFF"
const SCENARIO_BG = "FF1B5E50"
const HEADER_TRIAL_BG = "FF2B5D6B"
const HEADER_STAT_BG = "FF2E4A62"
const DATA_PARAM_BG = "FFF3F8F3"
const DATA_TRIAL_BG = "FFF0F5F9"
const DATA_STAT_BG = "FFEDF1F7"

function fillRow(ws: ExcelJS.Worksheet, row: number, cols: number, fill: ExcelJS.Fill) {
  for (let c = 1; c <= cols; c++) {
    ws.getCell(row, c).fill = fill
  }
}

export async function generateXlsx(doc: TestDocument) {
  const wb = new ExcelJS.Workbook()

  for (const section of doc.matrixSections) {
    if (!section.isPerformance) continue
    const paramNames = section.parameters.map(p => p.name).filter(n => n)
    const scenarios = section.scenarios

    // Trial columns: T1..T10 | Mean | P50 | P95 | P99
    const trialCols = TRIALS + 4
    const totalCols = Math.max(paramNames.length, trialCols)

    const sheetTitle = (section.title || "Sheet").replace(/[\\/*?[\]:]/g, "").slice(0, 31) || "Sheet"
    const ws = wb.addWorksheet(sheetTitle)

    const titleFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_BG } }
    const descFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: DESC_BG } }
    const scenarioFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: SCENARIO_BG } }
    const paramLabelFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } }
    const paramDataFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: DATA_PARAM_BG } }
    const trialHeaderFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_TRIAL_BG } }
    const trialDataFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: DATA_TRIAL_BG } }
    const statHeaderFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_STAT_BG } }
    const statDataFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: DATA_STAT_BG } }

    // Row 1: Section title
    ws.mergeCells(1, 1, 1, totalCols)
    const titleCell = ws.getCell(1, 1)
    titleCell.value = section.title || ""
    titleCell.font = { bold: true, color: { argb: TITLE_FG }, size: 14 }
    titleCell.fill = titleFill
    titleCell.alignment = { horizontal: "center", vertical: "middle" }
    ws.getRow(1).height = 28
    fillRow(ws, 1, totalCols, titleFill)

    // Row 2: Description
    ws.mergeCells(2, 1, 2, totalCols)
    const descCell = ws.getCell(2, 1)
    descCell.value = section.description || ""
    descCell.font = { italic: true, color: { argb: DESC_FG }, size: 10 }
    descCell.fill = descFill
    descCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    ws.getRow(2).height = 22
    fillRow(ws, 2, totalCols, descFill)

    let row = 3

    for (let tcIdx = 0; tcIdx < scenarios.length; tcIdx++) {
      const scenario = scenarios[tcIdx]
      const font: Partial<ExcelJS.Font> = { size: 10 }

      // -- Blank separator row between scenarios --
      if (tcIdx > 0) row++

      // -- Scenario label row (merged across all cols) --
      ws.mergeCells(row, 1, row, totalCols)
      const labelCell = ws.getCell(row, 1)
      labelCell.value = `Test Case ${tcIdx + 1}`
      labelCell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 }
      labelCell.fill = scenarioFill
      labelCell.alignment = { horizontal: "left", vertical: "middle" }
      fillRow(ws, row, totalCols, scenarioFill)
      row++

      // -- Parameter header row --
      for (let pIdx = 0; pIdx < paramNames.length; pIdx++) {
        const cell = ws.getCell(row, pIdx + 1)
        cell.value = paramNames[pIdx]
        cell.font = { bold: true, size: 10, color: { argb: HEADER_FG } }
        cell.fill = paramLabelFill
        cell.alignment = { horizontal: "center" }
      }
      row++

      // -- Parameter value row --
      for (let pIdx = 0; pIdx < paramNames.length; pIdx++) {
        const cell = ws.getCell(row, pIdx + 1)
        cell.value = scenario.matrixCombo[paramNames[pIdx]] ?? ""
        cell.font = font
        cell.fill = paramDataFill
        cell.alignment = { horizontal: "center" }
      }
      row++

      // -- Trial header row --
      const trialHeaders = []
      for (let t = 1; t <= TRIALS; t++) trialHeaders.push(`T${t}`)
      trialHeaders.push("Mean", "P50", "P95", "P99")

      for (let i = 0; i < trialHeaders.length; i++) {
        const cell = ws.getCell(row, i + 1)
        cell.value = trialHeaders[i]
        cell.font = { bold: true, color: { argb: HEADER_FG }, size: 10 }
        cell.alignment = { horizontal: "center" }
        cell.fill = i >= TRIALS ? statHeaderFill : trialHeaderFill
      }
      row++

      // -- Trial data row --
      const trials = scenario.perfTrials ?? []
      for (let t = 0; t < TRIALS; t++) {
        const val = trials[t]
        const cell = ws.getCell(row, t + 1)
        cell.fill = trialDataFill
        cell.alignment = { horizontal: "center" }
        if (val !== null && val !== undefined && !isNaN(val)) {
          cell.value = val
          cell.font = font
        }
      }

      // Stats
      const stats = computePerfStats(scenario.perfTrials)
      const statEntries: [number, number | null][] = [
        [TRIALS + 1, stats.avg],
        [TRIALS + 2, stats.p50],
        [TRIALS + 3, stats.p95],
        [TRIALS + 4, stats.p99],
      ]
      for (const [col, val] of statEntries) {
        const cell = ws.getCell(row, col)
        if (val !== null) cell.value = Math.round(val * 100) / 100
        cell.font = { bold: true, size: 10 }
        cell.fill = statDataFill
        cell.alignment = { horizontal: "center" }
      }
      row++
    }

    // Column widths
    ws.getColumn(1).width = 14
    for (let t = 2; t <= TRIALS; t++) {
      ws.getColumn(t).width = 8
    }
    for (let c = TRIALS + 1; c <= TRIALS + 4; c++) {
      ws.getColumn(c).width = 10
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  saveAs(blob, `${doc.name || "test_cases"}.xlsx`)
}
