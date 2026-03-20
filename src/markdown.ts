import type { TestDocument, TemplateConfig } from "./types"
import { DEFAULT_TEMPLATE } from "./types"

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

export function generateMarkdown(doc: TestDocument, template: TemplateConfig = DEFAULT_TEMPLATE): string {
  const lines: string[] = []

  // Title
  lines.push(`# ${doc.name || "Test Document"}`)
  lines.push("")

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
      lines.push(`| ${paramNames.join(" | ")} | Result |`)
      lines.push(`| ${paramNames.map(() => "---").join(" | ")} | --- |`)

      for (const s of section.scenarios) {
        const vals = paramNames.map(name => s.matrixCombo[name] || "—")
        lines.push(`| ${vals.join(" | ")} | ${statusEmoji(s.status)} ${statusLabel(s.status)} |`)
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
          `#### ${statusEmoji(s.status)} Scenario ${i + 1}: ${s.title || "Untitled"}`
        )
        lines.push("")
        lines.push(`**Status:** ${statusLabel(s.status)}`)
        lines.push("")

        if (s.description.trim()) {
          lines.push(`**Description:** ${s.description}`)
          lines.push("")
        }
        if (s.expected.trim()) {
          lines.push(`**Expected Result:** ${s.expected}`)
          lines.push("")
        }
        if (s.setup.trim()) {
          lines.push(`**Setup / Preconditions:** ${s.setup}`)
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

  return lines.join("\n")
}
