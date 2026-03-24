import { nanoid } from "nanoid"
import type { HeaderData, MatrixSection, ScenarioData, ScenarioStatus, ScenarioImage, MatrixParameter } from "./types"
import { DEFAULT_TEMPLATE } from "./types"

/**
 * Reverse-parse an iteration's HTML content back into editor fields.
 * This handles the HTML that `marked()` produces from `generateMarkdown()`.
 */
export function parseIterationHtml(html: string): {
  header: HeaderData
  notes: string
  matrixSections: MatrixSection[]
} {
  const parser = new DOMParser()
  const dom = parser.parseFromString(`<body>${html}</body>`, "text/html")
  const body = dom.body

  const header: HeaderData = {}
  let notes = ""
  const matrixSections: MatrixSection[] = []

  // Label -> header key mapping from template
  const labelToKey: Record<string, string> = {}
  for (const f of DEFAULT_TEMPLATE.headerFields) {
    labelToKey[f.label.toLowerCase()] = f.key
  }

  const children = Array.from(body.children)
  let i = 0

  // Parse header from blockquote
  while (i < children.length) {
    const el = children[i]
    if (el.tagName === "BLOCKQUOTE") {
      // Fields may be in separate <p> tags or combined in one <p> with <br> separators.
      // Walk through all <strong> elements in the blockquote and extract the text
      // between each <strong> and the next one (or end of parent).
      for (const p of Array.from(el.querySelectorAll("p"))) {
        const strongs = Array.from(p.querySelectorAll("strong"))
        if (strongs.length === 0) continue

        if (strongs.length === 1) {
          // Single field in this <p>
          const strong = strongs[0]
          const labelText = (strong.textContent ?? "").replace(/:$/, "").trim().toLowerCase()
          const key = labelToKey[labelText]
          if (key) {
            const fullText = p.textContent ?? ""
            const labelPart = strong.textContent ?? ""
            header[key] = fullText.slice(fullText.indexOf(labelPart) + labelPart.length).trim()
          }
        } else {
          // Multiple fields in one <p> separated by <br>
          // Split the innerHTML on <br> variants, then parse each segment
          const segments = p.innerHTML.split(/<br\s*\/?>/i)
          for (const seg of segments) {
            const segMatch = seg.match(/<strong>\s*(.+?)\s*<\/strong>\s*(.*)/i)
            if (!segMatch) continue
            const labelText = segMatch[1].replace(/:$/, "").trim().toLowerCase()
            const key = labelToKey[labelText]
            if (key) {
              // Strip any remaining HTML tags from the value
              const value = segMatch[2].replace(/<[^>]*>/g, "").trim()
              header[key] = value
            }
          }
        }
      }
      i++
      break
    }
    i++
  }

  // Parse remaining sections
  while (i < children.length) {
    const el = children[i]

    if (el.tagName === "H2") {
      const title = (el.textContent ?? "").trim()

      if (title.toLowerCase() === "notes") {
        // Collect everything until next h2
        i++
        const noteParts: string[] = []
        while (i < children.length && children[i].tagName !== "H2") {
          noteParts.push(children[i].textContent ?? "")
          i++
        }
        notes = noteParts.join("\n").trim()
        continue
      }

      // Otherwise it's a matrix section
      const section: MatrixSection = {
        id: nanoid(),
        title,
        parameters: [],
        scenarios: [],
      }

      i++

      // Look for the summary table
      if (i < children.length && children[i].tagName === "TABLE") {
        const table = children[i]
        const headerCells = Array.from(table.querySelectorAll("thead th, tr:first-child th"))
        // If no thead, try first row
        const rows = Array.from(table.querySelectorAll("tbody tr, tr"))
        const colNames = headerCells.map(th => (th.textContent ?? "").trim())
        // Columns: paramNames..., "Expected", "Result"
        const expectedIdx = colNames.findIndex(c => c.toLowerCase() === "expected")
        const paramNames = expectedIdx > 0 ? colNames.slice(0, expectedIdx) : colNames.slice(0, -2)

        // Build parameters from table header
        const paramValuesMap: Record<string, Set<string>> = {}
        for (const name of paramNames) {
          paramValuesMap[name] = new Set()
        }

        // Parse table rows (skip header row if in tbody)
        const dataRows = rows.filter(row => {
          const cells = row.querySelectorAll("td")
          return cells.length > 0
        })

        for (const row of dataRows) {
          const cells = Array.from(row.querySelectorAll("td"))
          for (let p = 0; p < paramNames.length && p < cells.length; p++) {
            const val = (cells[p].textContent ?? "").trim()
            if (val && val !== "—") {
              paramValuesMap[paramNames[p]].add(val)
            }
          }
        }

        // Create MatrixParameters
        const parameters: MatrixParameter[] = paramNames.map(name => ({
          id: nanoid(),
          name,
          values: Array.from(paramValuesMap[name] ?? []),
        }))
        section.parameters = parameters

        i++
      }

      // Look for "Scenarios" h3 and scenario details
      if (i < children.length && children[i].tagName === "H3" &&
          (children[i].textContent ?? "").trim().toLowerCase() === "scenarios") {
        i++
      }

      // Parse scenario blocks (h4 elements)
      while (i < children.length && children[i].tagName !== "H2") {
        const el2 = children[i]

        if (el2.tagName === "H4") {
          const scenario = parseScenarioBlock(children, i)
          section.scenarios.push(scenario.data)
          i = scenario.nextIndex
          continue
        }

        // skip <hr> and other elements between scenarios
        i++
      }

      matrixSections.push(section)
      continue
    }

    i++
  }

  return { header, notes, matrixSections }
}

function parseStatusFromEmoji(text: string): ScenarioStatus {
  if (text.includes("✅")) return "pass"
  if (text.includes("❌")) return "fail"
  if (text.includes("🚫")) return "blocked"
  if (text.includes("—") && text.toLowerCase().includes("n/a")) return "n-a"
  return "not-run"
}

function parseStatusFromLabel(text: string): ScenarioStatus {
  const lower = text.toLowerCase().trim()
  if (lower === "pass") return "pass"
  if (lower === "fail") return "fail"
  if (lower === "blocked") return "blocked"
  if (lower === "n/a" || lower === "not applicable") return "n-a"
  return "not-run"
}

function parseScenarioBlock(
  children: Element[],
  startIndex: number
): { data: ScenarioData; nextIndex: number } {
  const h4 = children[startIndex]
  const h4Text = (h4.textContent ?? "").trim()

  // Parse: "✅ Scenario 1: My Title" or "✅ Scenario 1"
  const status = parseStatusFromEmoji(h4Text)
  const titleMatch = h4Text.match(/Scenario\s+\d+(?::\s*(.+))?$/i)
  const title = titleMatch?.[1]?.trim() ?? ""

  const scenario: ScenarioData = {
    id: nanoid(),
    matrixCombo: {},
    status,
    title,
    description: "",
    expected: "",
    setup: "",
    steps: "",
    images: [],
  }

  let i = startIndex + 1

  // Parse combo parameters (inline code elements in a <p>)
  if (i < children.length && children[i].tagName === "P") {
    const codes = children[i].querySelectorAll("code")
    if (codes.length > 0) {
      for (const code of Array.from(codes)) {
        const text = (code.textContent ?? "").trim()
        const colonIdx = text.indexOf(":")
        if (colonIdx > 0) {
          const key = text.slice(0, colonIdx).trim()
          const val = text.slice(colonIdx + 1).trim()
          scenario.matrixCombo[key] = val
        }
      }
      i++
    }
  }

  // Parse field blocks: Status, Description, Expected Result, Setup, Steps
  while (i < children.length) {
    const el = children[i]
    if (el.tagName === "H4" || el.tagName === "H3" || el.tagName === "H2") break
    if (el.tagName === "HR") {
      i++
      break
    }

    if (el.tagName === "P") {
      const strong = el.querySelector("strong")
      if (strong) {
        const label = (strong.textContent ?? "").replace(/:$/, "").trim().toLowerCase()

        if (label === "status") {
          const statusText = (el.textContent ?? "").replace(/^.*Status:\s*/i, "").trim()
          scenario.status = parseStatusFromLabel(statusText)
          i++
          continue
        }

        // Collect content after this labeled paragraph
        const fieldKey = mapFieldLabel(label)
        if (fieldKey) {
          i++
          const parts: string[] = []
          while (i < children.length) {
            const next = children[i]
            if (next.tagName === "H4" || next.tagName === "H3" || next.tagName === "H2" || next.tagName === "HR") break
            // Stop if next el is a <p> with <strong> (next field)
            if (next.tagName === "P" && next.querySelector("strong")) break
            parts.push(extractTextWithImages(next, scenario.images!))
            i++
          }
          ;(scenario as unknown as Record<string, unknown>)[fieldKey] = parts.join("\n").trim()
          continue
        }
      }
    }

    i++
  }

  return { data: scenario, nextIndex: i }
}

function mapFieldLabel(label: string): string | null {
  switch (label) {
    case "description": return "description"
    case "expected result": return "expected"
    case "setup / preconditions": return "setup"
    case "steps": return "steps"
    default: return null
  }
}

/**
 * Extract text content from an element, converting <img> tags into
 * ScenarioImage objects and ![name](img:id) markdown references.
 */
function extractTextWithImages(el: Element, images: ScenarioImage[]): string {
  // Handle the element itself if it's a block-level list or code block
  if (el.tagName === "OL" || el.tagName === "UL") {
    return extractList(el, images, 0)
  }
  if (el.tagName === "PRE") {
    const code = el.querySelector("code")
    const codeText = code ? (code.textContent ?? "") : (el.textContent ?? "")
    const langClass = code?.getAttribute("class") ?? ""
    const langMatch = langClass.match(/language-(\w+)/)
    const lang = langMatch ? langMatch[1] : ""
    return `\`\`\`${lang}\n${codeText}\n\`\`\``
  }

  const parts: string[] = []

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "")
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element
      if (child.tagName === "IMG") {
        const src = child.getAttribute("src") ?? ""
        const alt = child.getAttribute("alt") ?? "image"
        if (src) {
          const imgId = nanoid()
          images.push({
            id: imgId,
            data: "", // no base64 available from ADO URL
            name: alt,
            adoUrl: src,
          })
          parts.push(`![${alt}](img:${imgId})`)
        }
      } else if (child.tagName === "OL" || child.tagName === "UL") {
        // Ensure nested list starts on its own line
        const last = parts[parts.length - 1]
        if (last && !last.endsWith("\n")) parts.push("\n")
        parts.push(extractList(child, images, 0))
      } else if (child.tagName === "PRE") {
        const code = child.querySelector("code")
        const codeText = code ? (code.textContent ?? "") : (child.textContent ?? "")
        // Detect language from class like "language-sql"
        const langClass = code?.getAttribute("class") ?? ""
        const langMatch = langClass.match(/language-(\w+)/)
        const lang = langMatch ? langMatch[1] : ""
        parts.push(`\n\`\`\`${lang}\n${codeText}\n\`\`\`\n`)
      } else if (child.tagName === "CODE") {
        parts.push(`\`${child.textContent ?? ""}\``)
      } else if (child.tagName === "STRONG" || child.tagName === "B") {
        parts.push(`**${child.textContent ?? ""}**`)
      } else if (child.tagName === "EM" || child.tagName === "I") {
        parts.push(`*${child.textContent ?? ""}*`)
      } else if (child.tagName === "BR") {
        parts.push("\n")
      } else {
        // Recurse into child elements
        parts.push(extractTextWithImages(child, images))
      }
    }
  }

  return parts.join("")
}

function extractList(list: Element, images: ScenarioImage[], depth: number): string {
  const ordered = list.tagName === "OL"
  const lines: string[] = []
  let index = 1
  const indent = "    ".repeat(depth)

  for (const node of Array.from(list.children)) {
    if (node.tagName === "LI") {
      const prefix = ordered ? `${index}. ` : "- "
      // Separate direct text/inline content from nested block elements
      const inlineParts: string[] = []
      const blockParts: string[] = []

      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          inlineParts.push(child.textContent ?? "")
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as Element
          if (el.tagName === "OL" || el.tagName === "UL") {
            blockParts.push(extractList(el, images, depth + 1))
          } else if (el.tagName === "PRE") {
            const code = el.querySelector("code")
            const codeText = code ? (code.textContent ?? "") : (el.textContent ?? "")
            const langClass = code?.getAttribute("class") ?? ""
            const langMatch = langClass.match(/language-(\w+)/)
            const lang = langMatch ? langMatch[1] : ""
            const codeIndent = "    ".repeat(depth + 1)
            blockParts.push(`\n${codeIndent}\`\`\`${lang}\n${codeText.split("\n").map(l => codeIndent + l).join("\n")}\n${codeIndent}\`\`\`\n`)
          } else {
            inlineParts.push(extractTextWithImages(el, images))
          }
        }
      }

      const inlineText = inlineParts.join("").trim()
      lines.push(`${indent}${prefix}${inlineText}`)
      for (const block of blockParts) {
        lines.push(block)
      }
      index++
    }
  }

  // Ensure list is separated from surrounding text
  let result = lines.join("\n")
  if (result && !result.endsWith("\n")) result += "\n"
  return result
}
