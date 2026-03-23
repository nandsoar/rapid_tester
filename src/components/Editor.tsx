import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { nanoid } from "nanoid"
import { ArrowLeft, Plus, Eye, Pencil, Upload, History, Check } from "lucide-react"
import { loadDocument, saveDocument } from "../storage"
import type { TestDocument, HeaderData, MatrixSection, ScenarioData } from "../types"
import HeaderControl from "./HeaderControl"
import NotesControl from "./NotesControl"
import MatrixControl from "./MatrixControl"
import ScenarioControl from "./ScenarioControl"
import { generateHtml } from "../markdown"
import WorkItemPanel from "./WorkItemDrawer"
import DiscussionPanel from "./DiscussionPanel"
import { uploadAttachment, pushTestCases, fetchTestCasesField, fetchWorkItem, downloadAttachment } from "../ado"
import type { TestIteration } from "../ado"
import { parseIterationHtml } from "../parseIteration"
import { loadImageDataBatch, loadImageData } from "../imageStore"
import styles from "./Editor.module.scss"

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<TestDocument | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [iterations, setIterations] = useState<TestIteration[]>([])
  const [activeIteration, setActiveIteration] = useState<string>("")
  const [iterLoading, setIterLoading] = useState(false)
  const [panelFields, setPanelFields] = useState<Record<string, unknown> | null>(null)
  const imageCache = useRef(new Map<string, string>())
  const iterDrafts = useRef(new Map<string, { header: HeaderData; notes: string; matrixSections: MatrixSection[] }>())
  const [dirtyIterations, setDirtyIterations] = useState<Set<string>>(new Set())
  const [localImageData, setLocalImageData] = useState(new Map<string, string>())

  const [previewHtml, setPreviewHtml] = useState("")

  function togglePreview() {
    setShowPreview(p => {
      if (!p) {
        window.dispatchEvent(new CustomEvent("cm-save"))
      } else {
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent("cm-restore"))
        })
      }
      return !p
    })
  }

  // Generate preview HTML after toggling into preview mode
  useEffect(() => {
    if (showPreview && doc) {
      const html = generateHtml(doc, undefined, "local", localImageData)
      setPreviewHtml(html)
    }
  }, [showPreview])

  function markDirty() {
    if (!activeIteration) return
    setDirtyIterations(prev => {
      if (prev.has(activeIteration)) return prev
      const next = new Set(prev)
      next.add(activeIteration)
      return next
    })
  }

  function clearDirty(iter: string) {
    setDirtyIterations(prev => {
      if (!prev.has(iter)) return prev
      const next = new Set(prev)
      next.delete(iter)
      return next
    })
  }

  function refreshIterations() {
    if (!doc?.adoWorkItemId) return
    setIterLoading(true)
    fetchTestCasesField(doc.adoWorkItemId)
      .then(({ iterations: iters }) => setIterations(iters))
      .catch(() => {})
      .finally(() => setIterLoading(false))
  }

  const hasWorkItem = !!(doc?.adoFields)

  useEffect(() => {
    if (!id) return
    const loaded = loadDocument(id)
    if (!loaded) {
      navigate("/")
      return
    }
    setDoc(loaded)
    if (loaded.adoFields) setPanelFields(loaded.adoFields)

    // Fetch fresh work item fields from ADO
    if (loaded.adoWorkItemId) {
      fetchWorkItem(loaded.adoWorkItemId)
        .then(wi => {
          setPanelFields(wi.fields)
          const updated = { ...loaded, adoFields: wi.fields }
          setDoc(updated)
          saveDocument(updated)
        })
        .catch(() => {})
    }

    // If the doc has images with adoUrl but no data (loaded from iteration), resolve them
    const hasUnresolved = loaded.matrixSections.some(s =>
      s.scenarios.some(sc => sc.images?.some(img => !img.data && img.adoUrl))
    )
    if (hasUnresolved) {
      resolveAdoImages(loaded)
    }
  }, [id, navigate])

  // Load image data from IndexedDB for preview/download
  useEffect(() => {
    if (!doc) return
    const ids: string[] = []
    for (const s of doc.matrixSections) {
      for (const sc of s.scenarios) {
        for (const img of sc.images ?? []) {
          if (!img.data && !localImageData.has(img.id)) ids.push(img.id)
        }
      }
    }
    if (ids.length === 0) return
    loadImageDataBatch(ids).then(loaded => {
      if (loaded.size > 0) {
        setLocalImageData(prev => {
          const next = new Map(prev)
          loaded.forEach((v, k) => next.set(k, v))
          return next
        })
      }
    })
  }, [doc?.matrixSections])

  // Fetch iterations when the editor opens a work item
  useEffect(() => {
    if (!doc?.adoWorkItemId) return
    let cancelled = false
    setIterLoading(true)
    fetchTestCasesField(doc.adoWorkItemId)
      .then(({ iterations: iters }) => {
        if (!cancelled) {
          setIterations(iters)
          // Highlight the latest iteration (auto-loaded on open)
          if (iters.length > 0 && !activeIteration) {
            const latest = iters.reduce((a, b) => b.number > a.number ? b : a)
            setActiveIteration(String(latest.number))
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIterLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.adoWorkItemId])

  // Warn before closing/refreshing with unsaved changes
  useEffect(() => {
    if (dirtyIterations.size === 0) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirtyIterations.size])

  // Ctrl/Cmd+E to toggle preview
  const toggleRef = useRef(togglePreview)
  toggleRef.current = togglePreview
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault()
        toggleRef.current()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  async function refreshWorkItemFields() {
    if (!doc?.adoWorkItemId) return
    try {
      const wi = await fetchWorkItem(doc.adoWorkItemId)
      setPanelFields(wi.fields)
      persist({ ...doc, adoFields: wi.fields })
    } catch { /* ignore */ }
  }

  const persist = useCallback(
    (updated: TestDocument) => {
      setDoc(updated)
      saveDocument(updated)
    },
    []
  )

  function loadIteration(value: string) {
    if (!doc) return
    if (value === activeIteration) return

    // Save current iteration's state before switching
    if (activeIteration) {
      iterDrafts.current.set(activeIteration, {
        header: doc.header,
        notes: doc.notes,
        matrixSections: doc.matrixSections,
      })
    }

    setActiveIteration(value)
    if (value === "") return

    // Restore from local draft cache if available
    const draft = iterDrafts.current.get(value)
    if (draft) {
      persist({ ...doc, ...draft })
      return
    }

    // Otherwise parse from ADO
    const iter = iterations.find(it => String(it.number) === value)
    if (!iter) return
    const parsed = parseIterationHtml(iter.content)

    // Apply cached image data immediately to avoid broken-image flash
    for (const section of parsed.matrixSections) {
      for (const scenario of section.scenarios) {
        if (!scenario.images) continue
        for (let j = 0; j < scenario.images.length; j++) {
          const img = scenario.images[j]
          if (!img.data && img.adoUrl && imageCache.current.has(img.adoUrl)) {
            scenario.images[j] = { ...img, data: imageCache.current.get(img.adoUrl)! }
          }
        }
      }
    }

    const updated = {
      ...doc,
      header: parsed.header,
      notes: parsed.notes,
      matrixSections: parsed.matrixSections,
    }
    persist(updated)

    // Download any remaining unresolved ADO attachment images in background
    resolveAdoImages(updated)
  }

  async function resolveAdoImages(target: TestDocument) {
    let changed = false
    const sections = [...target.matrixSections]
    for (const section of sections) {
      for (const scenario of section.scenarios) {
        if (!scenario.images) continue
        for (let j = 0; j < scenario.images.length; j++) {
          const img = scenario.images[j]
          if (!img.data && img.adoUrl) {
            try {
              const dataUrl = await downloadAttachment(img.adoUrl)
              imageCache.current.set(img.adoUrl, dataUrl)
              scenario.images[j] = { ...img, data: dataUrl }
              changed = true
            } catch { /* leave as ADO URL */ }
          }
        }
      }
    }
    if (changed) {
      persist({ ...target, matrixSections: sections })
    }
  }

  function addMatrixSection() {
    if (!doc) return
    const section: MatrixSection = {
      id: nanoid(),
      title: "",
      parameters: [],
      scenarios: [],
    }
    persist({ ...doc, matrixSections: [...doc.matrixSections, section] })
    markDirty()
  }

  function createBlankIteration() {
    if (!doc) return
    const nextNum = iterations.length > 0
      ? Math.max(...iterations.map(i => i.number)) + 1
      : 1

    // Save current iteration's state before switching
    if (activeIteration) {
      iterDrafts.current.set(activeIteration, {
        header: doc.header,
        notes: doc.notes,
        matrixSections: doc.matrixSections,
      })
    }

    setActiveIteration(String(nextNum))

    // Carry over the template structure with blank fields
    const blankSections = doc.matrixSections.map(section => ({
      ...section,
      id: nanoid(),
      scenarios: section.scenarios.map(sc => ({
        ...sc,
        id: nanoid(),
        status: "not-run" as const,
        description: "",
        expected: "",
        setup: "",
        steps: "",
        images: [],
      })),
    }))

    persist({
      ...doc,
      header: { ...doc.header },
      notes: doc.notes,
      matrixSections: blankSections,
    })
    setDirtyIterations(prev => {
      const next = new Set(prev)
      next.add(String(nextNum))
      return next
    })
  }

  function updateMatrixSection(sectionId: string, updated: MatrixSection) {
    if (!doc) return
    persist({
      ...doc,
      matrixSections: doc.matrixSections.map(s =>
        s.id === sectionId ? updated : s
      ),
    })
    markDirty()
  }

  function deleteMatrixSection(sectionId: string) {
    if (!doc) return
    persist({
      ...doc,
      matrixSections: doc.matrixSections.filter(s => s.id !== sectionId),
    })
    markDirty()
  }

  async function handlePushToAdo() {
    if (!doc || !doc.adoWorkItemId) return
    setPushing(true)
    setPushMsg(null)

    // Determine target: if activeIteration exists in fetched iterations, replace it; otherwise new
    const iterNum = activeIteration ? parseInt(activeIteration, 10) : null
    const isExisting = iterations.some(it => it.number === iterNum)
    const targetIteration = isExisting ? iterNum : null

    try {
      // Upload any images that don't have an ADO URL yet
      let updated = doc
      for (const section of updated.matrixSections) {
        for (const scenario of section.scenarios) {
          for (const img of scenario.images ?? []) {
            if (!img.adoUrl) {
              const data = img.data || localImageData.get(img.id) || await loadImageData(img.id)
              if (data) {
                const adoUrl = await uploadAttachment(img.name, data)
                img.adoUrl = adoUrl
              }
            }
          }
        }
      }
      persist(updated)

      const content = generateHtml(updated, undefined, "ado")
      await pushTestCases(doc.adoWorkItemId, content, targetIteration)
      setPushMsg({ type: "ok", text: "Pushed to ADO successfully" })
      setTimeout(() => setPushMsg(null), 4000)
      clearDirty(activeIteration)
      // Refresh iterations dropdown and work item panel
      refreshIterations()
      refreshWorkItemFields()
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
        <button className={styles.backBtn} onClick={() => {
          if (dirtyIterations.size > 0 && !window.confirm("You have unsaved changes. Leave anyway?")) return
          navigate("/")
        }}>
          <ArrowLeft size={18} />
          Back
        </button>

        <input
          className={styles.titleInput}
          value={doc.name}
          onChange={e => { persist({ ...doc, name: e.target.value }); markDirty() }}
          placeholder="Document name..."
        />

        <div className={styles.actions}>
          <button
            className={styles.toolbarBtn}
            onClick={() => togglePreview()}
          >
            {showPreview ? <Pencil size={16} /> : <Eye size={16} />}
            {showPreview ? "Edit" : "Preview"}
          </button>
          {hasWorkItem && doc.adoWorkItemId && (
            <button
              className={`${styles.toolbarBtn} ${styles.pushBtn}${pushMsg?.type === "ok" ? " " + styles.pushSuccess : ""}`}
              onClick={handlePushToAdo}
              disabled={pushing}
              title={pushMsg?.type === "err" ? pushMsg.text : undefined}
            >
              {pushing ? (
                <><Upload size={16} /> Pushing...</>
              ) : pushMsg?.type === "ok" ? (
                <><Check size={16} /> Pushed</>
              ) : pushMsg?.type === "err" ? (
                <><Upload size={16} /> Push (failed)</>
              ) : (
                <><Upload size={16} /> Push</>
              )}
            </button>
          )}
        </div>
      </header>

      <div className={styles.body}>
        {hasWorkItem && doc.adoWorkItemId && (
          <aside className={styles.sidebarLeft}>
            <DiscussionPanel workItemId={doc.adoWorkItemId} />
          </aside>
        )}

        {hasWorkItem && (
          <nav className={styles.iterRail}>
            <History size={14} className={styles.iterRailIcon} />
            {activeIteration && !iterations.some(it => String(it.number) === activeIteration) ? (
              <button
                className={`${styles.iterRailBtn} ${styles.iterRailBtnDraft}`}
                title={`Iteration ${activeIteration} — draft (not yet pushed)`}
              >
                {activeIteration}
              </button>
            ) : (
              <button
                className={styles.iterRailBtn}
                onClick={createBlankIteration}
                title="New iteration"
              >
                <Plus size={14} />
              </button>
            )}
            {iterLoading && <span className={styles.iterRailLoading}>…</span>}
            {iterations.map(it => (
              <button
                key={it.number}
                className={`${styles.iterRailBtn} ${activeIteration === String(it.number) ? styles.iterRailBtnActive : ""} ${dirtyIterations.has(String(it.number)) ? styles.iterRailBtnDirtyDot : ""}`}
                onClick={() => loadIteration(String(it.number))}
                title={`Iteration ${it.number} — ${it.timestamp}`}
              >
                {it.number}
              </button>
            ))}
          </nav>
        )}

        <main className={styles.center}>
          {showPreview && (
            <div className={styles.scrollPane}>
              <div
                className={styles.htmlPreview}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}
          <div className={styles.scrollPane} style={{ display: showPreview ? "none" : undefined }}>
            <div className={styles.controls}>
              <HeaderControl
                data={doc.header}
                onChange={(header: HeaderData) => { persist({ ...doc, header }); markDirty() }}
              />

              <NotesControl
                value={doc.notes}
                onChange={(notes: string) => { persist({ ...doc, notes }); markDirty() }}
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
          </div>
        </main>

        {hasWorkItem && (
          <aside className={styles.sidebarRight}>
            <WorkItemPanel
              fields={panelFields ?? doc.adoFields!}
              workItemId={doc.adoWorkItemId}
            />
          </aside>
        )}
      </div>
    </div>
  )
}
