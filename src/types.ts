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
}

export interface MatrixSection {
  id: string
  title: string
  parameters: MatrixParameter[]
  scenarios: ScenarioData[]
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
