import { useState, useMemo, useEffect, useRef } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { marked } from "marked"
import clsx from "clsx"
import { downloadAttachment } from "../ado"
import styles from "./WorkItemDrawer.module.scss"

/** Compact metadata fields shown at the top */
const DISPLAY_FIELDS: { key: string; label: string; types?: string[] }[] = [
  { key: "System.WorkItemType", label: "Type" },
  { key: "System.State", label: "State" },
  { key: "System.AssignedTo", label: "Assigned To" },
  { key: "System.IterationPath", label: "Iteration" },
  { key: "System.AreaPath", label: "Area" },
  { key: "Microsoft.VSTS.Common.Priority", label: "Priority" },
  { key: "Microsoft.VSTS.Common.Severity", label: "Severity", types: ["Bug"] },
  { key: "Microsoft.VSTS.Build.FoundIn", label: "Found In", types: ["Bug"] },
]

/** Rich-text / long-content fields, rendered as tabs — order matches ADO UI */
const RICH_FIELDS: { key: string; label: string; shortLabel?: string; types?: string[] }[] = [
  { key: "Microsoft.VSTS.TCM.ReproSteps", label: "Repro Steps", shortLabel: "Repro", types: ["Bug"] },
  { key: "Microsoft.VSTS.TCM.LocalDataSource", label: "Design" },
  { key: "Microsoft.VSTS.TCM.Steps", label: "Test Cases / Steps", shortLabel: "Test Cases" },
  { key: "Microsoft.VSTS.Common.ReleaseNotes", label: "Release Notes", shortLabel: "Notes" },
  { key: "Microsoft.VSTS.CMMI.Deliverables", label: "Deliverables" },
  { key: "Custom.Deliverables", label: "Deliverables" },
  { key: "Microsoft.VSTS.CMMI.SWUnitTest", label: "SW Unit Test", shortLabel: "Unit Test" },
  { key: "Custom.SWUnitTest", label: "SW Unit Test", shortLabel: "Unit Test" },
  { key: "System.Description", label: "Description" },
]

/** Keys already handled — used to detect extra rich-text fields */
const KNOWN_KEYS = new Set([
  ...DISPLAY_FIELDS.map(f => f.key),
  ...RICH_FIELDS.map(f => f.key),
  "System.Title", "System.Id", "System.Rev", "System.CreatedDate",
  "System.CreatedBy", "System.ChangedDate", "System.ChangedBy",
  "System.TeamProject", "System.Reason", "System.BoardColumn",
  "System.BoardColumnDone", "System.CommentCount", "System.Tags",
  "System.History", "System.Watermark",
])

function resolveValue(val: unknown): string {
  if (val == null) return ""
  if (typeof val === "string") return val
  if (typeof val === "number") return String(val)
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>
    if ("displayName" in obj) return String(obj.displayName)
    if ("name" in obj) return String(obj.name)
    return JSON.stringify(val)
  }
  return String(val)
}

function isHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text)
}

interface Props {
  fields: Record<string, unknown>
  workItemId?: number
}

export default function WorkItemPanel({ fields, workItemId }: Props) {
  const wiType = resolveValue(fields["System.WorkItemType"])

  const visibleMeta = DISPLAY_FIELDS.filter(f => {
    if (f.types && !f.types.includes(wiType)) return false
    return !!resolveValue(fields[f.key])
  })

  // Deduplicate: if both CMMI and Custom variants exist, only show the one with data
  const seen = new Set<string>()
  const tabs = RICH_FIELDS.filter(f => {
    if (f.types && !f.types.includes(wiType)) return false
    const val = resolveValue(fields[f.key])
    if (!val) return false
    // Deduplicate by label (e.g. Custom.Deliverables vs Microsoft.VSTS.CMMI.Deliverables)
    if (seen.has(f.label)) return false
    seen.add(f.label)
    return true
  })

  // Catch-all: any remaining rich-text fields not in the predefined lists
  for (const [key, val] of Object.entries(fields)) {
    if (KNOWN_KEYS.has(key)) continue
    const str = resolveValue(val)
    if (!str) continue
    if (isHtml(str) || str.length > 80) {
      const label = key.split(".").pop()?.replace(/([A-Z])/g, " $1").trim() ?? key
      if (!seen.has(label)) {
        seen.add(label)
        tabs.push({ key, label })
      }
    }
  }

  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? "")
  const [detailsOpen, setDetailsOpen] = useState(true)

  const activeField = tabs.find(t => t.key === activeTab)
  const activeValue = activeField ? resolveValue(fields[activeField.key]) : ""

  return (
    <div className={styles.panel}>
      <button
        className={styles.header}
        onClick={() => setDetailsOpen(d => !d)}
      >
        <h2>
          {workItemId && <span className={styles.wiId}>#{workItemId}</span>}
          {resolveValue(fields["System.Title"]) || "Work Item"}
        </h2>
        {detailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {detailsOpen && visibleMeta.length > 0 && (
        <div className={styles.metaGrid}>
          {visibleMeta.map(f => (
            <div key={f.key} className={styles.metaItem}>
              <span className={styles.metaLabel}>{f.label}</span>
              <span className={styles.metaValue}>{resolveValue(fields[f.key])}</span>
            </div>
          ))}
        </div>
      )}

      {tabs.length > 0 && (
        <>
          <div className={styles.tabBar}>
            {tabs.map(t => (
              <button
                key={t.key}
                className={clsx(styles.tab, activeTab === t.key && styles.tabActive)}
                onClick={() => setActiveTab(t.key)}
              >
                {t.shortLabel ?? t.label}
              </button>
            ))}
          </div>

          <div className={styles.tabContent}>
            {activeValue && isHtml(activeValue) ? (
              <RichHtmlContent html={activeValue} />
            ) : activeValue ? (
              <RenderedMarkdown text={activeValue} />
            ) : null}
          </div>
        </>
      )}

      {tabs.length === 0 && visibleMeta.length === 0 && (
        <p className={styles.empty}>No work item details available.</p>
      )}
    </div>
  )
}

function RenderedMarkdown({ text }: { text: string }) {
  const html = useMemo(() => {
    marked.setOptions({ breaks: true, gfm: true })
    return marked.parse(text) as string
  }, [text])

  return (
    <div
      className={styles.richContent}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Renders sanitized HTML and resolves ADO attachment images with PAT auth */
function RichHtmlContent({ html }: { html: string }) {
  const [resolvedHtml, setResolvedHtml] = useState(() => sanitizeHtml(html))
  const cache = useRef(new Map<string, string>())

  useEffect(() => {
    let cancelled = false
    const sanitized = sanitizeHtml(html)

    // Find all ADO attachment URLs in the HTML string
    const urlRegex = /src="([^"]*\/_apis\/wit\/attachments\/[^"]*)"/g
    const urls = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = urlRegex.exec(sanitized))) urls.add(m[1])

    if (urls.size === 0) {
      setResolvedHtml(sanitized)
      return
    }

    // Show sanitized HTML immediately (images will be broken briefly)
    setResolvedHtml(sanitized)

    ;(async () => {
      let result = sanitized
      for (const url of urls) {
        if (cancelled) return
        if (cache.current.has(url)) {
          result = result.replaceAll(url, cache.current.get(url)!)
          continue
        }
        try {
          const dataUrl = await downloadAttachment(url)
          cache.current.set(url, dataUrl)
          result = result.replaceAll(url, dataUrl)
        } catch {
          // leave as-is (will show broken image)
        }
      }
      if (!cancelled) setResolvedHtml(result)
    })()

    return () => { cancelled = true }
  }, [html])

  return (
    <div
      className={styles.richContent}
      dangerouslySetInnerHTML={{ __html: resolvedHtml }}
    />
  )
}

/** Basic HTML sanitizer — strips dangerous tags/attributes while keeping structure */
function sanitizeHtml(html: string): string {
  const allowed = new Set([
    "p", "br", "b", "i", "em", "strong", "u", "s", "strike",
    "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
    "div", "span", "h1", "h2", "h3", "h4", "h5", "h6",
    "a", "img", "pre", "code", "blockquote", "hr",
    "steps", "step", "parameterizedstring", "compref",
  ])
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  function clean(node: Node): void {
    const children = Array.from(node.childNodes)
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element
        const tag = el.tagName.toLowerCase()
        if (!allowed.has(tag)) {
          // Replace disallowed element with its children
          while (el.firstChild) {
            node.insertBefore(el.firstChild, el)
          }
          node.removeChild(el)
        } else {
          // Remove event handler and dangerous attributes
          const attrs = Array.from(el.attributes)
          for (const attr of attrs) {
            const name = attr.name.toLowerCase()
            if (name.startsWith("on") || name === "style" || name === "srcdoc") {
              el.removeAttribute(attr.name)
            }
            if (name === "href" || name === "src") {
              const val = attr.value.trim().toLowerCase()
              if (val.startsWith("javascript:")) {
                el.removeAttribute(attr.name)
              }
              // Allow data: on img src (resolved ADO attachments), block elsewhere
              if (val.startsWith("data:") && !(tag === "img" && name === "src")) {
                el.removeAttribute(attr.name)
              }
            }
          }
          clean(el)
        }
      }
    }
  }

  clean(doc.body)
  return doc.body.innerHTML
}
