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
}

export function loadAdoSettings(): AdoSettings {
  const raw = localStorage.getItem(SETTINGS_KEY)
  if (!raw) return { orgUrl: "", project: "", pat: "", savedQueries: [] }
  const parsed = JSON.parse(raw) as AdoSettings
  return { savedQueries: [], ...parsed }
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
  "System.AssignedTo": "testEngineer",
  "System.State": "_state",
  "Microsoft.VSTS.Build.FoundIn": "buildVersion",
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
