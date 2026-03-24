import { marked } from "marked"
import type { TestDocument, TemplateConfig } from "./types"
import { DEFAULT_TEMPLATE } from "./types"

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

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export type ImageResolveMode = "local" | "ado" | "none"

export function generateHtml(doc: TestDocument, template: TemplateConfig = DEFAULT_TEMPLATE, imageMode: ImageResolveMode = "local", imageDataMap?: Map<string, string>): string {
  const parts: string[] = []

  // Header — blockquote style
  const h = doc.header
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

  // Build image map for resolving img: references
  const imageMap = new Map<string, { data: string; name: string; adoUrl?: string }>()
  for (const section of doc.matrixSections) {
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
    parts.push(`<h2>${esc(section.title || "Test Matrix")}</h2>`)

    // Matrix summary table
    const validParams = section.parameters.filter(
      p => p.name.trim() && p.values.some(v => v.trim())
    )
    if (validParams.length > 0 && section.scenarios.length > 0) {
      const paramNames = validParams.map(p => p.name)
      const headers = [...paramNames, "Expected", "Result"]
      const headerCells = headers.map(n => `<th>${esc(n)}</th>`).join("")

      const dataRows = section.scenarios.map(s => {
        const vals = paramNames.map(name => esc(s.matrixCombo[name] || "—"))
        const expected = esc(s.expected.trim() || "—")
        const result = `${statusEmoji(s.status)} ${statusLabel(s.status)}`
        return [...vals, expected, result]
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
      parts.push(`<h3>Scenarios</h3>`)

      for (let i = 0; i < section.scenarios.length; i++) {
        const s = section.scenarios[i]
        if (s.status === "n-a") continue

        const titleSuffix = s.title ? `: ${esc(s.title)}` : ""
        parts.push(`<h4>${statusEmoji(s.status)} Scenario ${i + 1}${titleSuffix}</h4>`)

        // Combo inputs
        if (Object.keys(s.matrixCombo).length > 0) {
          const comboParts = Object.entries(s.matrixCombo)
            .map(([k, v]) => `<code>${esc(k)}: ${esc(v)}</code>`)
            .join("  ")
          parts.push(`<p>${comboParts}</p>`)
        }

        parts.push(`<p><strong>Status:</strong> ${statusLabel(s.status)}</p>`)

        if (s.description.trim()) {
          parts.push(`<p><strong>Description:</strong></p>`)
          parts.push(mdToHtml(resolveImages(s.description)))
        }
        if (s.expected.trim()) {
          parts.push(`<p><strong>Expected Result:</strong></p>`)
          parts.push(mdToHtml(resolveImages(s.expected)))
        }
        if (s.setup.trim()) {
          parts.push(`<p><strong>Setup / Preconditions:</strong></p>`)
          parts.push(mdToHtml(resolveImages(s.setup)))
        }
        if (s.steps.trim()) {
          parts.push(`<p><strong>Steps:</strong></p>`)
          parts.push(mdToHtml(resolveImages(s.steps)))
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

  // Matrix sections
  for (const section of doc.matrixSections) {
    lines.push(`## ${section.title || "Test Matrix"}`)
    lines.push("")

    // Matrix summary table — all combos with result
    const validParams = section.parameters.filter(
      p => p.name.trim() && p.values.some(v => v.trim())
    )
    if (validParams.length > 0 && section.scenarios.length > 0) {
      const paramNames = validParams.map(p => p.name)
      const headers = [...paramNames, "Expected", "Result"]

      // Build all rows first to compute column widths
      const dataRows: string[][] = section.scenarios.map(s => {
        const vals = paramNames.map(name => s.matrixCombo[name] || "—")
        const expected = s.expected.trim() || "—"
        const result = `${statusEmoji(s.status)} ${statusLabel(s.status)}`
        return [...vals, expected, result]
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
      lines.push("### Scenarios")
      lines.push("")

      for (let i = 0; i < section.scenarios.length; i++) {
        const s = section.scenarios[i]
        if (s.status === "n-a") continue // skip N/A scenarios in detail

        lines.push(
          `#### ${statusEmoji(s.status)} Scenario ${i + 1}${s.title ? `: ${s.title}` : ""}`
        )
        lines.push("")

        // Combo inputs
        if (Object.keys(s.matrixCombo).length > 0) {
          const comboParts = Object.entries(s.matrixCombo)
            .map(([k, v]) => `\`${k}: ${v}\``)
            .join("  ")
          lines.push(comboParts)
          lines.push("")
        }

        lines.push(`**Status:** ${statusLabel(s.status)}`)
        lines.push("")

        if (s.description.trim()) {
          lines.push("**Description:**")
          lines.push("")
          lines.push(s.description)
          lines.push("")
        }
        if (s.expected.trim()) {
          lines.push("**Expected Result:**")
          lines.push("")
          lines.push(s.expected)
          lines.push("")
        }
        if (s.setup.trim()) {
          lines.push("**Setup / Preconditions:**")
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

        lines.push("---")
        lines.push("")
      }
    }
  }

  let md = lines.join("\n")

  // Resolve img: references
  const imageMap = new Map<string, { data: string; name: string; adoUrl?: string }>()
  for (const section of doc.matrixSections) {
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
