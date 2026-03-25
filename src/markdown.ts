import { marked } from "marked"
import type { TestDocument, TemplateConfig } from "./types"
import { DEFAULT_TEMPLATE, computePerfStats, formatStat } from "./types"

marked.setOptions({ breaks: true, gfm: true })

const renderer = new marked.Renderer()
renderer.image = ({ href, title, text }) => {
  const alt = text ? ` alt="${text}"` : ""
  const ttl = title ? ` title="${title}"` : ""
  const img = `<img src="${href}"${alt}${ttl} width="320" style="border:1px solid #ddd;border-radius:4px;display:inline-block;vertical-align:bottom;margin:4px 2px;" />`
  return `<a href="${href}" target="_blank" rel="noopener">${img}</a>`
}

function mdToHtml(text: string): string {
  return marked.parse(text, { async: false, renderer }) as string
}

function statusEmoji(status: string): string {
  switch (status) {
    case "pass":
      return "✅"
    case "fail":
      return "❌"
    case "blocked":
      return "🚫"
    case "n-a":
      return "—"
    default:
      return "⬜"
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "pass":
      return "Pass"
    case "fail":
      return "Fail"
    case "blocked":
      return "Blocked"
    case "n-a":
      return "N/A"
    default:
      return "Not Run"
  }
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case "pass":
      return "#16a34a"
    case "fail":
      return "#dc2626"
    case "blocked":
      return "#9333ea"
    default:
      return "#6b7280"
  }
}

export function statusBadge(status: string): string {
  const label = statusLabel(status).toUpperCase()
  const bg = statusBadgeColor(status)
  return `<span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:11px;font-weight:700;color:#fff;background:${bg};margin-right:6px;vertical-align:middle">${label}</span>`
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export type ImageResolveMode = "local" | "ado" | "none"

export function deriveOverallStatus(doc: TestDocument): string {
  const statuses = doc.matrixSections.flatMap(s =>
    s.scenarios.filter(sc => sc.status !== "n-a").map(sc => sc.status)
  )
  if (statuses.length === 0) return "not-run"
  if (statuses.includes("fail")) return "fail"
  if (statuses.includes("blocked")) return "blocked"
  if (statuses.every(s => s === "pass")) return "pass"
  if (statuses.includes("not-run")) return "not-run"
  return "not-run"
}

export function generateHtml(doc: TestDocument, template: TemplateConfig = DEFAULT_TEMPLATE, imageMode: ImageResolveMode = "local", imageDataMap?: Map<string, string>): string {
  const parts: string[] = []

  // Header — blockquote style
  const h = doc.header
  const overall = deriveOverallStatus(doc)
  const headerLines: string[] = []
  for (const field of template.headerFields) {
    const val = h[field.key]
    if (val) {
      headerLines.push(`<strong>${esc(field.label)}:</strong> ${esc(val)}`)
    }
  }
  if (headerLines.length > 0) {
    parts.push(`<blockquote>\n<p>${headerLines.join("<br>")}</p>\n</blockquote>`)
  }

  // Notes
  if (doc.notes.trim()) {
    parts.push(`<h2>Notes</h2>`)
    parts.push(mdToHtml(doc.notes))
  }

  // Collect all blocked scenarios
  const blockedItems: { section: string; index: number; title: string; reason: string }[] = []
  for (const section of doc.matrixSections) {
    for (let i = 0; i < section.scenarios.length; i++) {
      const s = section.scenarios[i]
      if (s.status === "blocked" && s.blockedReason?.trim()) {
        blockedItems.push({
          section: section.title || "Scenario Matrix",
          index: i + 1,
          title: s.title || "",
          reason: s.blockedReason.trim(),
        })
      }
    }
  }
  if (blockedItems.length > 0) {
    parts.push(`<h2>Blocked</h2>`)
    parts.push(`<ul>`)
    for (const b of blockedItems) {
      const label = b.title ? `Test Case ${b.index}: ${esc(b.title)}` : `Test Case ${b.index}`
      parts.push(`<li><strong>${label}</strong> — ${esc(b.reason)}</li>`)
    }
    parts.push(`</ul>`)
  }

  parts.push(`<hr>`)

  // Build image map for resolving img: references
  const imageMap = new Map<string, { data: string; name: string; adoUrl?: string }>()
  for (const section of doc.matrixSections) {
    for (const img of section.images ?? []) {
      imageMap.set(img.id, { data: img.data, name: img.name, adoUrl: img.adoUrl })
    }
    for (const s of section.scenarios) {
      for (const img of s.images ?? []) {
        imageMap.set(img.id, { data: img.data, name: img.name, adoUrl: img.adoUrl })
      }
    }
  }

  function resolveImages(text: string): string {
    return text.replace(/!\[([^\]]*)\]\(img:([a-zA-Z0-9_-]+)\)/g, (_match, alt, id) => {
      const img = imageMap.get(id)
      if (!img) return _match
      const label = alt || img.name
      const data = img.data || imageDataMap?.get(id) || ""
      const url = imageMode === "ado" && img.adoUrl ? img.adoUrl : (data || img.adoUrl || "")
      return `![${label}](${url})`
    })
  }

  // Matrix sections
  for (const section of doc.matrixSections) {
    parts.push(`<h2>${esc(section.title || "Scenario Matrix")}</h2>`)

    if (section.description?.trim()) {
      parts.push(`<p><em>${esc(section.description)}</em></p>`)
    }

    if (section.prerequisites?.trim()) {
      parts.push(`<p><strong>Prerequisites:</strong></p>`)
      parts.push(mdToHtml(resolveImages(section.prerequisites)))
    }
    if (section.steps?.trim()) {
      parts.push(`<p><strong>General Steps:</strong></p>`)
      parts.push(mdToHtml(resolveImages(section.steps)))
    }
    if (section.expected?.trim()) {
      parts.push(`<p><strong>Expected:</strong></p>`)
      parts.push(mdToHtml(resolveImages(section.expected)))
    }

    // Matrix summary table (only when multiple scenarios)
    const validParams = section.parameters.filter(
      p => p.name.trim() && p.values.some(v => v.trim())
    )
    if (validParams.length > 0 && section.scenarios.length > 1) {
      parts.push(`<h3>Scenario Overview</h3>`)
      const paramNames = validParams.map(p => p.name)
      const headers = section.isPerformance
        ? ["#", ...paramNames, "Expected", "Avg", "P50", "P95", "P99", "Result"]
        : ["#", ...paramNames, "Expected", "Result"]

      const dataRows = section.scenarios.map((s, si) => {
        const vals = paramNames.map(name => esc(s.matrixCombo[name] || "—"))
        const expected = esc(s.expected.trim() || section.expected?.trim() || "—")
        const result = `${statusEmoji(s.status)} ${statusLabel(s.status)}`
        if (section.isPerformance) {
          const stats = computePerfStats(s.perfTrials)
          return [String(si + 1), ...vals, expected, `<strong>${formatStat(stats.avg)}</strong>`, `<strong>${formatStat(stats.p50)}</strong>`, `<strong>${formatStat(stats.p95)}</strong>`, `<strong>${formatStat(stats.p99)}</strong>`, result]
        }
        return [String(si + 1), ...vals, expected, result]
      })

      // Compute column widths for aligned raw HTML
      const colWidths = headers.map((h, i) =>
        Math.max(h.length, ...dataRows.map(r => r[i].length))
      )
      const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length))

      const headRow = headers.map((h, i) => `<th>${pad(esc(h), colWidths[i])}</th>`).join("")
      const rows = dataRows.map(row => {
        const cells = row.map((c, i) => `<td>${pad(c, colWidths[i])}</td>`).join("")
        return `  <tr>${cells}</tr>`
      })
      parts.push(`<table>\n<thead><tr>${headRow}</tr></thead>\n<tbody>\n${rows.join("\n")}\n</tbody>\n</table>`)
    }

    // Scenarios detail
    if (section.scenarios.length > 0) {
      parts.push(`<h3>Test Cases</h3>`)

      for (let i = 0; i < section.scenarios.length; i++) {
        const s = section.scenarios[i]
        if (s.status === "n-a") continue

        const titleSuffix = s.title ? `: ${esc(s.title)}` : ""
        parts.push(`<h4>${statusBadge(s.status)} Test Case ${i + 1}${titleSuffix}</h4>`)

        // Combo inputs
        if (Object.keys(s.matrixCombo).length > 0) {
          const comboParts = Object.entries(s.matrixCombo)
            .filter(([, v]) => v !== "N/A")
            .map(([k, v]) => `<code>${esc(k)}: ${esc(v)}</code>`)
            .join("  ")
          if (comboParts) parts.push(`<p>${comboParts}</p>`)
        }

        if (s.status === "blocked" && s.blockedReason?.trim()) {
          parts.push(`<p><strong>Blocked By:</strong> ${esc(s.blockedReason)}</p>`)
        }

        if (s.description.trim()) {
          parts.push(`<p><strong>Description:</strong></p>`)
          parts.push(mdToHtml(resolveImages(s.description)))
        }
        if (s.expected.trim()) {
          parts.push(`<p><strong>Expected:</strong></p>`)
          parts.push(mdToHtml(resolveImages(s.expected)))
        }
        if (s.setup.trim()) {
          parts.push(`<p><strong>Preconditions:</strong></p>`)
          parts.push(mdToHtml(resolveImages(s.setup)))
        }
        if (s.steps.trim()) {
          parts.push(`<p><strong>Steps:</strong></p>`)
          parts.push(mdToHtml(resolveImages(s.steps)))
        }

        // Inline perf trial results per scenario — one-row table
        if (section.isPerformance && s.perfTrials?.some(v => v !== null && v !== undefined)) {
          parts.push(`<p style="margin-top:1.2em;font-weight:600">Measurements</p>`)
          const trials = s.perfTrials ?? []
          const stats = computePerfStats(trials)
          const thCells = Array.from({ length: 10 }, (_, t) => `<th>T${t + 1}</th>`).join("") + `<th>Avg</th><th>P50</th><th>P95</th><th>P99</th>`
          const tdCells = Array.from({ length: 10 }, (_, t) => {
            const v = trials[t]
            return `<td>${v !== null && v !== undefined && !isNaN(v) ? v : "\u2014"}</td>`
          }).join("") + `<td><strong>${formatStat(stats.avg)}</strong></td><td><strong>${formatStat(stats.p50)}</strong></td><td><strong>${formatStat(stats.p95)}</strong></td><td><strong>${formatStat(stats.p99)}</strong></td>`
          parts.push(`<table>\n<thead><tr>${thCells}</tr></thead>\n<tbody>\n  <tr>${tdCells}</tr>\n</tbody>\n</table>`)
        }

        parts.push(`<hr>`)
      }
    }
  }

  return parts.join("\n")
}

export function generateMarkdown(doc: TestDocument, template: TemplateConfig = DEFAULT_TEMPLATE, imageMode: ImageResolveMode = "local"): string {
  const lines: string[] = []

  // No title — the work item title is used in ADO

  // Header — blockquote style
  const overallMd = deriveOverallStatus(doc)
  const h = doc.header
  for (const field of template.headerFields) {
    const val = h[field.key]
    if (val) {
      lines.push(`> **${field.label}:** ${val}`)
    }
  }
  lines.push("")

  // Notes
  if (doc.notes.trim()) {
    lines.push("## Notes")
    lines.push("")
    lines.push(doc.notes)
    lines.push("")
  }

  // Collect all blocked scenarios
  const blockedItemsMd: { section: string; index: number; title: string; reason: string }[] = []
  for (const section of doc.matrixSections) {
    for (let i = 0; i < section.scenarios.length; i++) {
      const s = section.scenarios[i]
      if (s.status === "blocked" && s.blockedReason?.trim()) {
        blockedItemsMd.push({
          section: section.title || "Scenario Matrix",
          index: i + 1,
          title: s.title || "",
          reason: s.blockedReason.trim(),
        })
      }
    }
  }
  if (blockedItemsMd.length > 0) {
    lines.push("## Blocked")
    lines.push("")
    for (const b of blockedItemsMd) {
      const label = b.title ? `Test Case ${b.index}: ${b.title}` : `Test Case ${b.index}`
      lines.push(`- **${label}** — ${b.reason}`)
    }
    lines.push("")
  }

  lines.push("---")
  lines.push("")

  // Matrix sections
  for (const section of doc.matrixSections) {
    lines.push(`## ${section.title || "Scenario Matrix"}`)
    lines.push("")

    if (section.description?.trim()) {
      lines.push(`_${section.description}_`)
      lines.push("")
    }

    if (section.prerequisites?.trim()) {
      lines.push("**Prerequisites:**")
      lines.push("")
      lines.push(section.prerequisites)
      lines.push("")
    }
    if (section.steps?.trim()) {
      lines.push("**General Steps:**")
      lines.push("")
      lines.push(section.steps)
      lines.push("")
    }
    if (section.expected?.trim()) {
      lines.push("**Expected:**")
      lines.push("")
      lines.push(section.expected)
      lines.push("")
    }

    // Matrix summary table (only when multiple scenarios)
    const validParams = section.parameters.filter(
      p => p.name.trim() && p.values.some(v => v.trim())
    )
    if (validParams.length > 0 && section.scenarios.length > 1) {
      lines.push("### Scenario Overview")
      lines.push("")
      const paramNames = validParams.map(p => p.name)
      const headers = section.isPerformance
        ? ["#", ...paramNames, "Expected", "Avg", "P50", "P95", "P99", "Result"]
        : ["#", ...paramNames, "Expected", "Result"]

      // Build all rows first to compute column widths
      const dataRows: string[][] = section.scenarios.map((s, si) => {
        const vals = paramNames.map(name => s.matrixCombo[name] || "—")
        const expected = s.expected.trim() || section.expected?.trim() || "—"
        const result = `${statusEmoji(s.status)} ${statusLabel(s.status)}`
        if (section.isPerformance) {
          const stats = computePerfStats(s.perfTrials)
          return [String(si + 1), ...vals, expected, `**${formatStat(stats.avg)}**`, `**${formatStat(stats.p50)}**`, `**${formatStat(stats.p95)}**`, `**${formatStat(stats.p99)}**`, result]
        }
        return [String(si + 1), ...vals, expected, result]
      })

      const colWidths = headers.map((h, i) =>
        Math.max(h.length, ...dataRows.map(r => r[i].length))
      )

      const pad = (s: string, w: number) => s + " ".repeat(w - s.length)
      lines.push(`| ${headers.map((h, i) => pad(h, colWidths[i])).join(" | ")} |`)
      lines.push(`| ${colWidths.map(w => "-".repeat(w)).join(" | ")} |`)
      for (const row of dataRows) {
        lines.push(`| ${row.map((c, i) => pad(c, colWidths[i])).join(" | ")} |`)
      }
      lines.push("")
    }

    // Scenarios detail
    if (section.scenarios.length > 0) {
      lines.push("### Test Cases")
      lines.push("")

      for (let i = 0; i < section.scenarios.length; i++) {
        const s = section.scenarios[i]
        if (s.status === "n-a") continue // skip N/A scenarios in detail

        lines.push(
          `#### [${statusLabel(s.status).toUpperCase()}] Test Case ${i + 1}${s.title ? `: ${s.title}` : ""}`
        )
        lines.push("")

        // Combo inputs
        if (Object.keys(s.matrixCombo).length > 0) {
          const comboParts = Object.entries(s.matrixCombo)
            .filter(([, v]) => v !== "N/A")
            .map(([k, v]) => `\`${k}: ${v}\``)
            .join("  ")
          if (comboParts) {
            lines.push(comboParts)
            lines.push("")
          }
        }

        if (s.status === "blocked" && s.blockedReason?.trim()) {
          lines.push(`**Blocked By:** ${s.blockedReason}`)
          lines.push("")
        }

        if (s.description.trim()) {
          lines.push("**Description:**")
          lines.push("")
          lines.push(s.description)
          lines.push("")
        }
        if (s.expected.trim()) {
          lines.push("**Expected:**")
          lines.push("")
          lines.push(s.expected)
          lines.push("")
        }
        if (s.setup.trim()) {
          lines.push("**Preconditions:**")
          lines.push("")
          lines.push(s.setup)
          lines.push("")
        }
        if (s.steps.trim()) {
          lines.push("**Steps:**")
          lines.push("")
          lines.push(s.steps)
          lines.push("")
        }

        // Inline perf trial results per scenario — one-row table
        if (section.isPerformance && s.perfTrials?.some(v => v !== null && v !== undefined)) {
          lines.push("**Measurements:**")
          lines.push("")
          const trials = s.perfTrials ?? []
          const stats = computePerfStats(trials)
          const hdrs = Array.from({ length: 10 }, (_, t) => `T${t + 1}`)
          hdrs.push("Avg", "P50", "P95", "P99")
          const vals = Array.from({ length: 10 }, (_, t) => {
            const v = trials[t]
            return v !== null && v !== undefined && !isNaN(v) ? String(v) : "\u2014"
          })
          vals.push(`**${formatStat(stats.avg)}**`, `**${formatStat(stats.p50)}**`, `**${formatStat(stats.p95)}**`, `**${formatStat(stats.p99)}**`)
          lines.push(`| ${hdrs.join(" | ")} |`)
          lines.push(`| ${hdrs.map(() => "---").join(" | ")} |`)
          lines.push(`| ${vals.join(" | ")} |`)
          lines.push("")
        }

        lines.push("---")
        lines.push("")
      }
    }
  }

  let md = lines.join("\n")

  // Resolve img: references
  const imageMap = new Map<string, { data: string; name: string; adoUrl?: string }>()
  for (const section of doc.matrixSections) {
    for (const img of section.images ?? []) {
      imageMap.set(img.id, { data: img.data, name: img.name, adoUrl: img.adoUrl })
    }
    for (const s of section.scenarios) {
      for (const img of s.images ?? []) {
        imageMap.set(img.id, { data: img.data, name: img.name, adoUrl: img.adoUrl })
      }
    }
  }
  if (imageMode !== "none") {
    md = md.replace(/!\[([^\]]*)\]\(img:([a-zA-Z0-9_-]+)\)/g, (_match, alt, id) => {
      const img = imageMap.get(id)
      if (!img) return _match
      const label = alt || img.name
      const url = imageMode === "ado" && img.adoUrl ? img.adoUrl : (img.data || img.adoUrl || "")
      return `![${label}](${url})`
    })
  }

  return md
}
