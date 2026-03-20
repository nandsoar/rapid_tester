import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { nanoid } from "nanoid"
import { ArrowLeft, Download, Plus, Eye, Pencil } from "lucide-react"
import { loadDocument, saveDocument } from "../storage"
import type { TestDocument, HeaderData, MatrixSection, ScenarioData } from "../types"
import HeaderControl from "./HeaderControl"
import NotesControl from "./NotesControl"
import MatrixControl from "./MatrixControl"
import ScenarioControl from "./ScenarioControl"
import MarkdownPreview from "./MarkdownPreview"
import { generateMarkdown } from "../markdown"
import styles from "./Editor.module.scss"

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<TestDocument | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (!id) return
    const loaded = loadDocument(id)
    if (!loaded) {
      navigate("/")
      return
    }
    setDoc(loaded)
  }, [id, navigate])

  const persist = useCallback(
    (updated: TestDocument) => {
      setDoc(updated)
      saveDocument(updated)
    },
    []
  )

  function addMatrixSection() {
    if (!doc) return
    const section: MatrixSection = {
      id: nanoid(),
      title: "",
      parameters: [],
      scenarios: [],
    }
    persist({ ...doc, matrixSections: [...doc.matrixSections, section] })
  }

  function updateMatrixSection(sectionId: string, updated: MatrixSection) {
    if (!doc) return
    persist({
      ...doc,
      matrixSections: doc.matrixSections.map(s =>
        s.id === sectionId ? updated : s
      ),
    })
  }

  function deleteMatrixSection(sectionId: string) {
    if (!doc) return
    persist({
      ...doc,
      matrixSections: doc.matrixSections.filter(s => s.id !== sectionId),
    })
  }

  function handleDownload() {
    if (!doc) return
    const md = generateMarkdown(doc)
    const blob = new Blob([md], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${doc.name || "test-document"}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!doc) return null

  return (
    <div className={styles.root}>
      <header className={styles.toolbar}>
        <button className={styles.backBtn} onClick={() => navigate("/")}>
          <ArrowLeft size={18} />
          Back
        </button>

        <input
          className={styles.titleInput}
          value={doc.name}
          onChange={e => persist({ ...doc, name: e.target.value })}
          placeholder="Document name..."
        />

        <div className={styles.actions}>
          <button
            className={styles.toolbarBtn}
            onClick={() => setShowPreview(p => !p)}
          >
            {showPreview ? <Pencil size={16} /> : <Eye size={16} />}
            {showPreview ? "Edit" : "Preview"}
          </button>
          <button className={styles.toolbarBtn} onClick={handleDownload}>
            <Download size={16} />
            Download .md
          </button>
        </div>
      </header>

      {showPreview ? (
        <MarkdownPreview markdown={generateMarkdown(doc)} />
      ) : (
        <div className={styles.controls}>
          <HeaderControl
            data={doc.header}
            onChange={(header: HeaderData) => persist({ ...doc, header })}
          />

          <NotesControl
            value={doc.notes}
            onChange={(notes: string) => persist({ ...doc, notes })}
          />

          {doc.matrixSections.map((section, idx) => (
            <div key={section.id} className={styles.matrixGroup}>
              <MatrixControl
                index={idx}
                section={section}
                onChange={(updated: MatrixSection) => updateMatrixSection(section.id, updated)}
                onDelete={() => deleteMatrixSection(section.id)}
              />

              {section.scenarios.map(scenario => (
                <ScenarioControl
                  key={scenario.id}
                  scenario={scenario}
                  onChange={(updated: ScenarioData) =>
                    updateMatrixSection(section.id, {
                      ...section,
                      scenarios: section.scenarios.map(s =>
                        s.id === updated.id ? updated : s
                      ),
                    })
                  }
                  onDelete={() =>
                    updateMatrixSection(section.id, {
                      ...section,
                      scenarios: section.scenarios.filter(
                        s => s.id !== scenario.id
                      ),
                    })
                  }
                />
              ))}
            </div>
          ))}

          <button className={styles.addSection} onClick={addMatrixSection}>
            <Plus size={18} />
            Add Matrix Section
          </button>
        </div>
      )}
    </div>
  )
}
