const SETTINGS_KEY = "rapid_tester_ado_settings"

export interface SavedQuery {
  id: string       // ADO query GUID
  name: string
  path: string     // folder path in ADO, e.g. "My Queries/Ready to Test"
}

export interface AdoSettings {
  orgUrl: string   // e.g. "https://dev.azure.com/iarx-services"
  project: string  // e.g. "NEXiA Fulfillment" — needed for queries
  pat: string
  savedQueries: SavedQuery[]
  useMarkdown: boolean
}

export function loadAdoSettings(): AdoSettings {
  const raw = localStorage.getItem(SETTINGS_KEY)
  if (!raw) return { orgUrl: "", project: "", pat: "", savedQueries: [], useMarkdown: false }
  const parsed = JSON.parse(raw) as AdoSettings
  return { savedQueries: [], useMarkdown: false, ...parsed }
}

export function saveAdoSettings(settings: AdoSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function isAdoConfigured(): boolean {
  const s = loadAdoSettings()
  return !!(s.orgUrl && s.pat)
}

function adoHeaders(pat: string): HeadersInit {
  return {
    "Authorization": `Basic ${btoa(`:${pat}`)}`,
    "Content-Type": "application/json",
  }
}

export interface AdoWorkItem {
  id: number
  fields: Record<string, unknown>
}

export interface AdoWorkItemSummary {
  id: number
  title: string
  type: string
  state: string
  assignedTo: string
}

/** Field mapping: ADO field path → header field key */
export const DEFAULT_FIELD_MAPPING: Record<string, string> = {
  "System.Title": "_documentName",
  "System.State": "_state",
  "Microsoft.VSTS.Build.FoundIn": "buildVersion",
  "Custom.TestedBy": "testEngineer",
}

/**
 * Upload a binary attachment to ADO. Returns the attachment URL.
 * The file data should be a base64 data URL (data:image/png;base64,...).
 */
export async function uploadAttachment(
  fileName: string,
  dataUrl: string,
): Promise<string> {
  const settings = loadAdoSettings()
  if (!settings.orgUrl || !settings.pat) {
    throw new Error("ADO settings not configured.")
  }

  // Convert data URL to binary
  const base64 = dataUrl.split(",")[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  const encodedName = encodeURIComponent(fileName)
  const url = `${settings.orgUrl}/_apis/wit/attachments?fileName=${encodedName}&api-version=7.1`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`:${settings.pat}`)}`,
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  })

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`)
  }

  const json = await res.json()
  return json.url as string
}

/**
 * Download an ADO attachment URL and return it as a base64 data URL.
 * ADO attachment URLs require authentication, so we fetch with the PAT.
 */
export async function downloadAttachment(url: string): Promise<string> {
  const settings = loadAdoSettings()
  if (!settings.pat) throw new Error("PAT not configured")

  const res = await fetch(url, {
    headers: { "Authorization": `Basic ${btoa(`:${settings.pat}`)}` },
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)

  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Discover the field reference name for a given display name on a work item.
 */
async function resolveFieldName(
  workItemId: number,
  displayName: string,
): Promise<string | null> {
  const settings = loadAdoSettings()
  const orgUrl = settings.orgUrl.replace(/\/+$/, "")

  // Fetch work item to get its type
  const wiUrl = `${orgUrl}/_apis/wit/workitems/${workItemId}?fields=System.WorkItemType,System.TeamProject&api-version=7.1`
  const wiRes = await fetch(wiUrl, { headers: adoHeaders(settings.pat) })
  if (!wiRes.ok) return null
  const wiJson = await wiRes.json()
  const wiType = wiJson.fields["System.WorkItemType"] as string
  const project = wiJson.fields["System.TeamProject"] as string

  // Fetch field definitions for this work item type
  const encType = encodeURIComponent(wiType)
  const encProj = encodeURIComponent(project)
  const fieldsUrl = `${orgUrl}/${encProj}/_apis/wit/workitemtypes/${encType}/fields?api-version=7.1`
  const fieldsRes = await fetch(fieldsUrl, { headers: adoHeaders(settings.pat) })
  if (!fieldsRes.ok) return null
  const fieldsJson = await fieldsRes.json()

  const target = displayName.toLowerCase()
  for (const field of fieldsJson.value ?? []) {
    if ((field.name as string)?.toLowerCase() === target) {
      return field.referenceName as string
    }
  }
  return null
}

/** Represents a parsed test iteration from the Test Cases field */
export interface TestIteration {
  number: number
  timestamp: string
  content: string
}

/** Parse iteration blocks from the Test Cases HTML field.
 *  Uses <div data-rt-iteration="N" data-rt-ts="..."> markers
 *  because ADO strips HTML comments from rich-text fields.
 *
 *  Strategy: find all opening markers, then slice the HTML between them
 *  to capture content regardless of nested divs. */
export function parseIterations(raw: string): { iterations: TestIteration[]; raw: string } {
  const iterations: TestIteration[] = []

  // Try Markdown markers first: <!-- rt-iteration N | timestamp -->
  const mdMarkerRegex = /<!-- rt-iteration (\d+) \| (.+?) -->/g
  const mdMarkers: { number: number; timestamp: string; startAfter: number; fullMatchStart: number }[] = []
  let mm
  while ((mm = mdMarkerRegex.exec(raw)) !== null) {
    mdMarkers.push({
      number: parseInt(mm[1], 10),
      timestamp: mm[2],
      startAfter: mm.index + mm[0].length,
      fullMatchStart: mm.index,
    })
  }

  if (mdMarkers.length > 0) {
    for (let i = 0; i < mdMarkers.length; i++) {
      const start = mdMarkers[i].startAfter
      const end = i + 1 < mdMarkers.length ? mdMarkers[i + 1].fullMatchStart : raw.length
      let content = raw.slice(start, end).trim()
      // Strip the Markdown iteration header so buildFieldValue doesn't duplicate it
      content = content.replace(/^##\s*Iteration\s+\d+\s*—\s*.+$/m, "").trim()
      iterations.push({
        number: mdMarkers[i].number,
        timestamp: mdMarkers[i].timestamp,
        content,
      })
    }
    return { iterations, raw }
  }

  // Fall back to HTML markers: <div data-rt-iteration="N" data-rt-ts="...">
  const htmlMarkerRegex = /<div[^>]*data-rt-iteration=["']?(\d+)["']?[^>]*data-rt-ts=["']?([^"'>]+)["']?[^>]*>/gi
  const htmlMarkers: { number: number; timestamp: string; startAfter: number; fullMatchStart: number }[] = []
  let m
  while ((m = htmlMarkerRegex.exec(raw)) !== null) {
    htmlMarkers.push({
      number: parseInt(m[1], 10),
      timestamp: m[2],
      startAfter: m.index + m[0].length,
      fullMatchStart: m.index,
    })
  }

  for (let i = 0; i < htmlMarkers.length; i++) {
    const start = htmlMarkers[i].startAfter
    const end = i + 1 < htmlMarkers.length ? htmlMarkers[i + 1].fullMatchStart : raw.length
    let content = raw.slice(start, end).trim()
    content = content.replace(/<\/div>\s*$/, "").trim()
    content = content.replace(/^<h2>Iteration\s+\d+\s*—\s*[^<]*<\/h2>\s*/i, "").trim()
    iterations.push({
      number: htmlMarkers[i].number,
      timestamp: htmlMarkers[i].timestamp,
      content,
    })
  }

  if (iterations.length > 0) {
    return { iterations, raw }
  }

  // Last resort: detect <h2>Iteration N — timestamp</h2> headers without markers
  const h2Regex = /<h2>\s*Iteration\s+(\d+)\s*—\s*(.+?)\s*<\/h2>/gi
  const h2Markers: { number: number; timestamp: string; startAfter: number; fullMatchStart: number }[] = []
  let h2m
  while ((h2m = h2Regex.exec(raw)) !== null) {
    h2Markers.push({
      number: parseInt(h2m[1], 10),
      timestamp: h2m[2].trim(),
      startAfter: h2m.index + h2m[0].length,
      fullMatchStart: h2m.index,
    })
  }

  for (let i = 0; i < h2Markers.length; i++) {
    const start = h2Markers[i].startAfter
    const end = i + 1 < h2Markers.length ? h2Markers[i + 1].fullMatchStart : raw.length
    const content = raw.slice(start, end).trim()
    iterations.push({
      number: h2Markers[i].number,
      timestamp: h2Markers[i].timestamp,
      content,
    })
  }

  return { iterations, raw }
}

/** Build the full field value with iterations */
function buildFieldValue(iterations: TestIteration[], markdown: boolean): string {
  if (markdown) {
    return iterations
      .map(it => {
        const marker = `<!-- rt-iteration ${it.number} | ${it.timestamp} -->`
        const header = `## Iteration ${it.number} — ${it.timestamp}`
        return `${marker}\n${header}\n\n${it.content}`
      })
      .join("\n\n---\n\n")
  }
  return iterations
    .map(it => {
      const header = `<h2>Iteration ${it.number} — ${it.timestamp}</h2>`
      return `<div data-rt-iteration="${it.number}" data-rt-ts="${it.timestamp}">\n${header}\n${it.content}\n</div>`
    })
    .join("\n\n")
}

/**
 * Fetch the current Test Cases field content and parsed iterations.
 */
export async function fetchTestCasesField(
  workItemId: number,
): Promise<{ fieldRef: string; raw: string; iterations: TestIteration[] }> {
  const settings = loadAdoSettings()
  if (!settings.orgUrl || !settings.pat) {
    throw new Error("ADO settings not configured.")
  }

  const orgUrl = settings.orgUrl.replace(/\/+$/, "")

  const fieldRef = await resolveFieldName(workItemId, "Test Cases")
  if (!fieldRef) {
    throw new Error("Could not find a \"Test Cases\" field on this work item type.")
  }

  const getUrl = `${orgUrl}/_apis/wit/workitems/${workItemId}?fields=${encodeURIComponent(fieldRef)}&api-version=7.1`
  const getRes = await fetch(getUrl, {
    headers: adoHeaders(settings.pat),
  })
  if (!getRes.ok) {
    throw new Error(`Failed to fetch work item: ${getRes.status} ${getRes.statusText}`)
  }
  const getJson = await getRes.json()
  const raw = (getJson.fields?.[fieldRef] as string) ?? ""
  const { iterations } = parseIterations(raw)

  return { fieldRef, raw, iterations }
}

/**
 * Push content to the Test Cases field as a new or replacement iteration.
 * @param targetIteration - null for new iteration, or the iteration number to replace
 */
export async function pushTestCases(
  workItemId: number,
  newContent: string,
  targetIteration: number | null,
): Promise<void> {
  const settings = loadAdoSettings()
  if (!settings.orgUrl || !settings.pat) {
    throw new Error("ADO settings not configured.")
  }

  const orgUrl = settings.orgUrl.replace(/\/+$/, "")
  const { fieldRef, raw, iterations } = await fetchTestCasesField(workItemId)

  const timestamp = new Date().toLocaleString(undefined, {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit",
  })

  let updatedIterations: TestIteration[]

  if (targetIteration === null) {
    // New iteration — prepend at top
    const nextNum = iterations.length > 0
      ? Math.max(...iterations.map(i => i.number)) + 1
      : 1
    const newIter: TestIteration = {
      number: nextNum,
      timestamp,
      content: newContent,
    }
    updatedIterations = [newIter, ...iterations]
  } else {
    // Replace existing iteration — keep original timestamp
    updatedIterations = iterations.map(it =>
      it.number === targetIteration
        ? { ...it, content: newContent }
        : it
    )
  }

  const useMarkdown = settings.useMarkdown

  // If there were no iterations previously and there's legacy content, preserve it
  let combined: string
  if (iterations.length === 0 && raw.trim()) {
    const newBlock = buildFieldValue(updatedIterations, useMarkdown)
    const separator = useMarkdown
      ? "\n\n---\n\n*— Legacy content —*\n\n---\n\n"
      : '\n\n<hr/><p style="color:#888;font-size:12px;">— Legacy content —</p><hr/>\n\n'
    combined = `${newBlock}${separator}${raw}`
  } else {
    combined = buildFieldValue(updatedIterations, useMarkdown)
  }

  // PATCH the work item
  const patchUrl = `${orgUrl}/_apis/wit/workitems/${workItemId}?api-version=7.1`
  const patchRes = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      "Authorization": `Basic ${btoa(`:${settings.pat}`)}`,
      "Content-Type": "application/json-patch+json",
    },
    body: JSON.stringify([
      {
        op: "replace",
        path: `/fields/${fieldRef}`,
        value: combined,
      },
    ]),
  })

  if (!patchRes.ok) {
    const body = await patchRes.text()
    throw new Error(`Push failed: ${patchRes.status} ${patchRes.statusText}\n${body}`)
  }
}

export async function fetchWorkItem(id: number): Promise<AdoWorkItem> {
  const settings = loadAdoSettings()
  if (!settings.orgUrl || !settings.pat) {
    throw new Error("ADO settings not configured. Go to Settings to add your org URL and PAT.")
  }

  const orgUrl = settings.orgUrl.replace(/\/+$/, "")
  const url = `${orgUrl}/_apis/wit/workitems/${id}?$expand=all&api-version=7.1`

  const response = await fetch(url, {
    headers: adoHeaders(settings.pat),
  })

  if (!response.ok) {
    if (response.status === 401) throw new Error("Authentication failed. Check your PAT.")
    if (response.status === 404) throw new Error(`Work item ${id} not found.`)
    throw new Error(`ADO API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<AdoWorkItem>
}

export interface AdoComment {
  id: number
  text: string
  createdBy: { displayName: string }
  createdDate: string
}

/** Fetch discussion comments for a work item */
export async function fetchWorkItemComments(id: number): Promise<AdoComment[]> {
  const settings = loadAdoSettings()
  if (!settings.orgUrl || !settings.pat) {
    throw new Error("ADO not configured. Set your org URL and PAT in Settings.")
  }

  const orgUrl = settings.orgUrl.replace(/\/+$/, "")

  // Try the Comments API first (newer, cleaner)
  const commentsUrl = `${orgUrl}/_apis/wit/workItems/${id}/comments?$top=200&api-version=7.1-preview.4`
  const response = await fetch(commentsUrl, {
    headers: adoHeaders(settings.pat),
  })

  if (response.ok) {
    const data = await response.json() as { comments: AdoComment[] }
    return data.comments ?? []
  }

  // Fallback: extract comments from the Updates (history) API
  const updatesUrl = `${orgUrl}/_apis/wit/workItems/${id}/updates?api-version=7.1`
  const updatesRes = await fetch(updatesUrl, {
    headers: adoHeaders(settings.pat),
  })

  if (!updatesRes.ok) {
    if (updatesRes.status === 401) throw new Error("Authentication failed. Check your PAT.")
    throw new Error(`Failed to load comments (${updatesRes.status})`)
  }

  interface HistoryUpdate {
    id: number
    fields?: {
      "System.History"?: { newValue?: string }
    }
    revisedBy: { displayName: string }
    revisedDate: string
  }

  const updatesData = await updatesRes.json() as { value: HistoryUpdate[] }
  const comments: AdoComment[] = []

  for (const update of updatesData.value) {
    const historyHtml = update.fields?.["System.History"]?.newValue
    if (historyHtml) {
      comments.push({
        id: update.id,
        text: historyHtml,
        createdBy: { displayName: update.revisedBy?.displayName ?? "Unknown" },
        createdDate: update.revisedDate,
      })
    }
  }

  return comments
}

/** Post a new comment to a work item */
export async function postWorkItemComment(id: number, text: string): Promise<AdoComment> {
  const settings = loadAdoSettings()
  if (!settings.orgUrl || !settings.pat) {
    throw new Error("ADO not configured.")
  }

  const orgUrl = settings.orgUrl.replace(/\/+$/, "")
  const url = `${orgUrl}/_apis/wit/workItems/${id}/comments?api-version=7.1-preview.4`

  const response = await fetch(url, {
    method: "POST",
    headers: adoHeaders(settings.pat),
    body: JSON.stringify({ text }),
  })

  if (!response.ok) {
    if (response.status === 401) throw new Error("Authentication failed. Check your PAT.")
    if (response.status === 403) throw new Error("Your PAT doesn't have write permissions for Work Items.")
    const body = await response.text()
    throw new Error(`Failed to post comment (${response.status}): ${body}`)
  }

  return response.json() as Promise<AdoComment>
}

/** Fetch multiple work items by IDs (max 200 per call) */
export async function fetchWorkItemsBatch(ids: number[]): Promise<AdoWorkItemSummary[]> {
  if (ids.length === 0) return []
  const settings = loadAdoSettings()
  const orgUrl = settings.orgUrl.replace(/\/+$/, "")

  const results: AdoWorkItemSummary[] = []
  // ADO limits to 200 IDs per request
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200)
    const fields = "System.Id,System.Title,System.WorkItemType,System.State,System.AssignedTo"
    const url = `${orgUrl}/_apis/wit/workitems?ids=${batch.join(",")}&fields=${fields}&api-version=7.1`

    const response = await fetch(url, {
      headers: adoHeaders(settings.pat),
    })

    if (!response.ok) {
      if (response.status === 401) throw new Error("Authentication failed. Check your PAT.")
      throw new Error(`ADO API error: ${response.status}`)
    }

    const data = await response.json() as { value: AdoWorkItem[] }
    for (const wi of data.value) {
      results.push({
        id: wi.id,
        title: resolveField(wi.fields, "System.Title"),
        type: resolveField(wi.fields, "System.WorkItemType"),
        state: resolveField(wi.fields, "System.State"),
        assignedTo: resolveField(wi.fields, "System.AssignedTo"),
      })
    }
  }
  return results
}

/** Run a saved query and return work item IDs */
export async function runSavedQuery(queryId: string): Promise<number[]> {
  const settings = loadAdoSettings()
  if (!settings.project) {
    throw new Error("Project is required for queries. Set it in Settings.")
  }
  const orgUrl = settings.orgUrl.replace(/\/+$/, "")
  const project = encodeURIComponent(settings.project)
  const url = `${orgUrl}/${project}/_apis/wit/wiql/${queryId}?api-version=7.1`

  const response = await fetch(url, {
    headers: adoHeaders(settings.pat),
  })

  if (!response.ok) {
    if (response.status === 401) throw new Error("Authentication failed. Check your PAT.")
    if (response.status === 404) throw new Error("Query not found. It may have been deleted in ADO.")
    throw new Error(`ADO API error: ${response.status}`)
  }

  const data = await response.json() as { workItems: { id: number }[] }
  return (data.workItems ?? []).map(wi => wi.id)
}

/** Fetch the full query tree from ADO for browsing */
export interface AdoQueryNode {
  id: string
  name: string
  path: string
  isFolder: boolean
  children?: AdoQueryNode[]
}

export async function fetchQueryTree(): Promise<AdoQueryNode[]> {
  const settings = loadAdoSettings()
  if (!settings.project) {
    throw new Error("Project is required to browse queries. Set it in Settings.")
  }
  const orgUrl = settings.orgUrl.replace(/\/+$/, "")
  const project = encodeURIComponent(settings.project)
  const url = `${orgUrl}/${project}/_apis/wit/queries?$depth=2&api-version=7.1`

  const response = await fetch(url, {
    headers: adoHeaders(settings.pat),
  })

  if (!response.ok) {
    if (response.status === 401) throw new Error("Authentication failed. Check your PAT.")
    const text = await response.text().catch(() => "")
    throw new Error(`ADO API error: ${response.status}. URL: ${url}${text ? ` — ${text.slice(0, 200)}` : ""}`)
  }

  const data = await response.json() as { value: RawQueryNode[] }
  return (data.value ?? []).map(mapQueryNode)
}

interface RawQueryNode {
  id: string
  name: string
  path: string
  isFolder?: boolean
  hasChildren?: boolean
  children?: RawQueryNode[]
}

function mapQueryNode(node: RawQueryNode): AdoQueryNode {
  return {
    id: node.id,
    name: node.name,
    path: node.path,
    isFolder: !!(node.isFolder || node.hasChildren),
    children: node.children?.map(mapQueryNode),
  }
}

/** Extract a nested field value from ADO fields (handles "System.AssignedTo" → displayName) */
function resolveField(fields: Record<string, unknown>, path: string): string {
  const val = fields[path]
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

export interface MappedWorkItem {
  documentName: string
  header: Record<string, string>
  unmapped: Record<string, string>
  rawFields: Record<string, unknown>
  workItemId: number
}

/** Map ADO work item fields to header fields using the field mapping */
export function mapWorkItemToHeader(
  workItem: AdoWorkItem,
  fieldMapping: Record<string, string> = DEFAULT_FIELD_MAPPING
): MappedWorkItem {
  const header: Record<string, string> = {}
  const unmapped: Record<string, string> = {}
  let documentName = ""

  for (const [adoField, headerKey] of Object.entries(fieldMapping)) {
    const value = resolveField(workItem.fields, adoField)
    if (headerKey === "_documentName") {
      documentName = value
    } else if (headerKey.startsWith("_")) {
      unmapped[headerKey] = value
    } else {
      header[headerKey] = value
    }
  }

  // Auto-fill date with today
  header["date"] = new Date().toISOString().split("T")[0]

  return {
    documentName: documentName || `Work Item ${workItem.id}`,
    header,
    unmapped,
    rawFields: workItem.fields,
    workItemId: workItem.id,
  }
}
