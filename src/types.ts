export type ScenarioStatus = "not-run" | "pass" | "fail" | "blocked" | "n-a"

export interface HeaderField {
  key: string
  label: string
  type: "text" | "date"
  placeholder?: string
}

export interface TemplateConfig {
  id: string
  name: string
  headerFields: HeaderField[]
  scenarioFields: {
    key: string
    label: string
    placeholder?: string
    rows?: number
  }[]
  markdownHeaderStyle: "blockquote" | "table"
}

export const DEFAULT_TEMPLATE: TemplateConfig = {
  id: "default",
  name: "Default",
  headerFields: [
    { key: "date", label: "Date", type: "date" },
    { key: "testEngineer", label: "Test Engineer", type: "text", placeholder: "Name..." },
    { key: "testEnvironment", label: "Test Database", type: "text", placeholder: "e.g. Staging, Production..." },
    { key: "buildVersion", label: "Build", type: "text", placeholder: "e.g. v1.2.3..." },
    { key: "computer", label: "Computer", type: "text", placeholder: "e.g. PC-01, MacBook..." },
  ],
  scenarioFields: [
    { key: "description", label: "Description", placeholder: "What is being tested...", rows: 2 },
    { key: "expected", label: "Expected Result", placeholder: "What should happen...", rows: 2 },
    { key: "setup", label: "Setup / Preconditions", placeholder: "Required state before testing...", rows: 2 },
    { key: "steps", label: "Steps", placeholder: "1. Do this\n2. Then that\n3. Verify...", rows: 3 },
  ],
  markdownHeaderStyle: "blockquote",
}

export interface HeaderData {
  [key: string]: string
}

export interface MatrixParameter {
  id: string
  name: string
  values: string[]
  appliesWhen?: { paramId: string; values: string[] }
}

export interface ScenarioImage {
  id: string
  data: string // base64 data URL for local/offline preview
  name: string
  adoUrl?: string // real ADO attachment URL, populated after upload
}

export interface ScenarioData {
  id: string
  matrixCombo: Record<string, string> // paramName -> selectedValue
  status: ScenarioStatus
  title: string
  description: string
  expected: string
  setup: string
  steps: string
  images?: ScenarioImage[]
  perfTrials?: (number | null)[]
  blockedReason?: string
}

export interface MatrixSection {
  id: string
  title: string
  description: string
  expected: string
  prerequisites: string
  steps: string
  isPerformance: boolean
  parameters: MatrixParameter[]
  scenarios: ScenarioData[]
  images?: ScenarioImage[]
}

export interface TestDocument {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  header: HeaderData
  notes: string
  matrixSections: MatrixSection[]
  adoFields?: Record<string, unknown>
  adoWorkItemId?: number
}

export interface PerfStats {
  avg: number | null
  p50: number | null
  p95: number | null
  p99: number | null
}

export function computePerfStats(trials: (number | null)[] | undefined): PerfStats {
  const nums = (trials ?? []).filter((v): v is number => v !== null && !isNaN(v)).sort((a, b) => a - b)
  if (nums.length === 0) return { avg: null, p50: null, p95: null, p99: null }
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  const percentile = (sorted: number[], p: number) => {
    const idx = (p / 100) * (sorted.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
  }
  return {
    avg,
    p50: percentile(nums, 50),
    p95: percentile(nums, 95),
    p99: percentile(nums, 99),
  }
}

export function formatStat(v: number | null): string {
  return v !== null ? v.toFixed(1) : "\u2014"
}

export function createDefaultHeader(template: TemplateConfig = DEFAULT_TEMPLATE): HeaderData {
  const header: HeaderData = {}
  for (const field of template.headerFields) {
    header[field.key] = field.type === "date" ? new Date().toISOString().split("T")[0] : ""
  }
  return header
}

export function createDefaultDocument(id: string, name: string): TestDocument {
  return {
    id,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    header: createDefaultHeader(),
    notes: "",
    matrixSections: [],
  }
}
