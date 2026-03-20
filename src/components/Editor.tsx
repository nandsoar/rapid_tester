import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { nanoid } from "nanoid"
import { ArrowLeft, Download, Plus, Eye, Pencil, Upload } from "lucide-react"
import { loadDocument, saveDocument } from "../storage"
import type { TestDocument, HeaderData, MatrixSection, ScenarioData } from "../types"
import HeaderControl from "./HeaderControl"
import NotesControl from "./NotesControl"
import MatrixControl from "./MatrixControl"
import ScenarioControl from "./ScenarioControl"
import MarkdownPreview from "./MarkdownPreview"
import WorkItemPanel from "./WorkItemDrawer"
import DiscussionPanel from "./DiscussionPanel"
import { generateMarkdown } from "../markdown"
import { marked } from "marked"
import { uploadAttachment, pushTestCases } from "../ado"
import PushDialog from "./PushDialog"
import styles from "./Editor.module.scss"

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<TestDocument | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [showPushDialog, setShowPushDialog] = useState(false)

  const hasWorkItem = !!(doc?.adoFields)

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

  async function handlePushToAdo(targetIteration: number | null) {
    if (!doc || !doc.adoWorkItemId) return
    setShowPushDialog(false)
    setPushing(true)
    setPushMsg(null)
    try {
      // Upload any images that don't have an ADO URL yet
      let updated = doc
      for (const section of updated.matrixSections) {
        for (const scenario of section.scenarios) {
          for (const img of scenario.images ?? []) {
            if (!img.adoUrl && img.data) {
              const adoUrl = await uploadAttachment(img.name, img.data)
              img.adoUrl = adoUrl
            }
          }
        }
      }
      persist(updated)

      const md = generateMarkdown(updated, undefined, "ado")
      const html = await marked(md, { gfm: true, breaks: true })
      await pushTestCases(doc.adoWorkItemId, html, targetIteration)
      setPushMsg({ type: "ok", text: "Pushed to ADO successfully" })
      setTimeout(() => setPushMsg(null), 4000)
    } catch (err) {
      setPushMsg({ type: "err", text: (err as Error).message })
    } finally {
      setPushing(false)
    }
  }

  if (!doc) return null

  return (
    <div className={hasWorkItem ? styles.rootWide : styles.root}>
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
          {hasWorkItem && doc.adoWorkItemId && (
            <button
              className={`${styles.toolbarBtn} ${styles.pushBtn}`}
              onClick={() => setShowPushDialog(true)}
              disabled={pushing}
            >
              <Upload size={16} />
              {pushing ? "Pushing..." : "Push to ADO"}
            </button>
          )}
          {pushMsg && (
            <span className={pushMsg.type === "ok" ? styles.pushOk : styles.pushErr}>
              {pushMsg.text}
            </span>
          )}
        </div>
      </header>

      {showPushDialog && doc.adoWorkItemId && (
        <PushDialog
          workItemId={doc.adoWorkItemId}
          onPush={handlePushToAdo}
          onClose={() => setShowPushDialog(false)}
        />
      )}

      <div className={styles.body}>
        {hasWorkItem && doc.adoWorkItemId && (
          <aside className={styles.sidebarLeft}>
            <DiscussionPanel workItemId={doc.adoWorkItemId} />
          </aside>
        )}

        <main className={styles.center}>
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

                  {section.scenarios.map((scenario, si) => (
                    <ScenarioControl
                      key={scenario.id}
                      index={si}
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
        </main>

        {hasWorkItem && (
          <aside className={styles.sidebarRight}>
            <WorkItemPanel
              fields={doc.adoFields!}
              workItemId={doc.adoWorkItemId}
            />
          </aside>
        )}
      </div>
    </div>
  )
}
