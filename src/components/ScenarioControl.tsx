import { useRef, useState, useEffect } from "react"
import { nanoid } from "nanoid"
import { ChevronDown, Trash2, ImagePlus, X, Image, Loader2 } from "lucide-react"
import type { EditorView } from "@codemirror/view"
import type { ScenarioData, ScenarioImage, ScenarioStatus } from "../types"
import { uploadAttachment, isAdoConfigured } from "../ado"
import { compressImage, saveImageData, loadImageDataBatch, deleteImageData } from "../imageStore"
import MarkdownInput from "./MarkdownInput"
import styles from "./ScenarioControl.module.scss"

interface Props {
  index: number
  scenario: ScenarioData
  onChange: (scenario: ScenarioData) => void
  onDelete: () => void
}

const STATUS_OPTIONS: { value: ScenarioStatus; label: string }[] = [
  { value: "not-run", label: "Not Run" },
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "blocked", label: "Blocked" },
  { value: "n-a", label: "N/A" },
]

export default function ScenarioControl({
  index,
  scenario,
  onChange,
  onDelete,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorViews = useRef<Record<string, EditorView | null>>({})
  const [pickerField, setPickerField] = useState<string | null>(null)
  const [uploading, setUploading] = useState<Set<string>>(new Set())
  const [imgDataCache, setImgDataCache] = useState<Map<string, string>>(new Map())

  // Load image data from IndexedDB for thumbnails
  useEffect(() => {
    const ids = (scenario.images ?? [])
      .filter(img => !img.data && !imgDataCache.has(img.id))
      .map(img => img.id)
    if (ids.length === 0) return
    loadImageDataBatch(ids).then(loaded => {
      if (loaded.size > 0) {
        setImgDataCache(prev => {
          const next = new Map(prev)
          loaded.forEach((v, k) => next.set(k, v))
          return next
        })
      }
    })
  }, [scenario.images])

  // Keep a ref to latest scenario/onChange so async callbacks don't use stale closures
  const scenarioRef = useRef(scenario)
  scenarioRef.current = scenario
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  function tryUploadToAdo(img: ScenarioImage, data: string) {
    if (!isAdoConfigured()) return
    setUploading(prev => new Set(prev).add(img.id))
    uploadAttachment(img.name, data)
      .then(adoUrl => {
        const latest = scenarioRef.current
        onChangeRef.current({
          ...latest,
          images: (latest.images ?? []).map(i =>
            i.id === img.id ? { ...i, adoUrl } : i
          ),
        })
      })
      .catch(() => { /* offline or failed — stays local-only */ })
      .finally(() => {
        setUploading(prev => {
          const next = new Set(prev)
          next.delete(img.id)
          return next
        })
      })
  }

  function insertImageRef(fieldKey: string, img: ScenarioImage) {
    const view = editorViews.current[fieldKey]
    const ref = `![${img.name}](img:${img.id})`
    if (view) {
      const pos = view.state.selection.main.head
      view.dispatch({
        changes: { from: pos, insert: ref },
        selection: { anchor: pos + ref.length },
      })
      view.focus()
    } else {
      const current = (scenario as unknown as Record<string, unknown>)[fieldKey] as string ?? ""
      update(fieldKey as keyof ScenarioData, current + (current ? "\n" : "") + ref)
    }
    setPickerField(null)
  }

  function update(field: keyof ScenarioData, value: string) {
    onChange({ ...scenario, [field]: value })
  }

  // Save image to repository only (no inline ref)
  function addImages(files: FileList) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("image/")) return
      const reader = new FileReader()
      reader.onload = async () => {
        const raw = reader.result as string
        const compressed = await compressImage(raw)
        const imgId = nanoid()
        await saveImageData(imgId, compressed)
        setImgDataCache(prev => new Map(prev).set(imgId, compressed))
        const img: ScenarioImage = {
          id: imgId,
          data: "", // data lives in IndexedDB
          name: file.name || `screenshot-${Date.now()}.png`,
        }
        onChange({ ...scenario, images: [...(scenario.images ?? []), img] })
        tryUploadToAdo(img, compressed)
      }
      reader.readAsDataURL(file)
    })
  }

  // Save image AND insert reference into a specific field
  function addImageAndInsert(file: File, fieldKey: string) {
    if (!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = async () => {
      const raw = reader.result as string
      const compressed = await compressImage(raw)
      const imgId = nanoid()
      const imgName = file.name || `screenshot-${Date.now()}.png`
      await saveImageData(imgId, compressed)
      setImgDataCache(prev => new Map(prev).set(imgId, compressed))
      const img: ScenarioImage = {
        id: imgId,
        data: "", // data lives in IndexedDB
        name: imgName,
      }
      const ref = `![${imgName}](img:${img.id})`
      const view = editorViews.current[fieldKey]
      const current = (scenario as unknown as Record<string, unknown>)[fieldKey] as string ?? ""
      let newVal: string
      if (view) {
        const pos = view.state.selection.main.head
        const docText = view.state.doc.toString()
        newVal = docText.slice(0, pos) + ref + docText.slice(pos)
      } else {
        newVal = current + (current ? "\n" : "") + ref
      }
      onChange({
        ...scenario,
        [fieldKey]: newVal,
        images: [...(scenario.images ?? []), img],
      })
      tryUploadToAdo(img, compressed)
      if (view) {
        requestAnimationFrame(() => {
          const pos = view.state.selection.main.head + ref.length
          view.dispatch({ selection: { anchor: pos } })
          view.focus()
        })
      }
    }
    reader.readAsDataURL(file)
  }

  function removeImage(imgId: string) {
    deleteImageData(imgId)
    onChange({
      ...scenario,
      images: (scenario.images ?? []).filter(i => i.id !== imgId),
    })
  }

  function handleFieldPaste(fieldKey: string) {
    return (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            addImageAndInsert(file, fieldKey)
            return
          }
        }
      }
    }
  }

  function handleFieldDrop(fieldKey: string) {
    return (e: DragEvent) => {
      const files = e.dataTransfer?.files
      if (!files) return
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          e.preventDefault()
          addImageAndInsert(file, fieldKey)
          return
        }
      }
    }
  }

  function handleRepoPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData.items
    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      const dt = new DataTransfer()
      imageFiles.forEach(f => dt.items.add(f))
      addImages(dt.files)
    }
  }

  function handleRepoDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files.length) {
      addImages(e.dataTransfer.files)
    }
  }

  const isNA = scenario.status === "n-a"

  return (
    <section className={`${styles.root} ${isNA ? styles.dimmed : ""}`}>
      <div className={styles.titleRow}>
        <span className={styles.scenarioLabel}>Scenario {index + 1}</span>
        <input
          className={styles.title}
          value={scenario.title}
          onChange={e => update("title", e.target.value)}
          placeholder="Title..."
        />
        <button className={styles.deleteBtn} onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className={styles.topRow}>
        <div className={`${styles.statusBadge} ${styles[scenario.status]}`}>
          <select
            value={scenario.status}
            onChange={e =>
              onChange({
                ...scenario,
                status: e.target.value as ScenarioStatus,
              })
            }
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} />
        </div>

        {Object.keys(scenario.matrixCombo).length > 0 && (
          <div className={styles.comboTags}>
            {Object.entries(scenario.matrixCombo).map(([param, val]) => (
              <span key={param} className={styles.tag}>
                <span className={styles.tagParam}>{param}:</span> {val}
              </span>
            ))}
          </div>
        )}
      </div>

      {!isNA && (
        <div className={styles.fields}>
          {[
            { key: "description", label: "Description", placeholder: "What is being tested...", rows: 2 },
            { key: "expected", label: "Expected Result", placeholder: "What should happen...", rows: 2 },
            { key: "setup", label: "Setup / Preconditions", placeholder: "Required state before testing...", rows: 2 },
            { key: "steps", label: "Steps", placeholder: "1. Do this\n2. Then that\n3. Verify...", rows: 3 },
          ].map(f => (
            <div key={f.key} className={styles.field}>
              <div className={styles.fieldHeader}>
                <label>{f.label}</label>
                {(scenario.images ?? []).length > 0 && (
                  <div className={styles.imgPickerWrap}>
                    <button
                      className={styles.imgPickerBtn}
                      onClick={() => setPickerField(pickerField === f.key ? null : f.key)}
                      title="Insert image reference"
                    >
                      <Image size={12} />
                    </button>
                    {pickerField === f.key && (
                      <div className={styles.imgPicker}>
                        {(scenario.images ?? []).map(img => (
                          <button
                            key={img.id}
                            className={styles.imgPickerItem}
                            onClick={() => insertImageRef(f.key, img)}
                            title={img.name}
                          >
                            <img src={img.data || imgDataCache.get(img.id) || img.adoUrl} alt={img.name} />
                            <span>{img.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <MarkdownInput
                value={(scenario as unknown as Record<string, unknown>)[f.key] as string ?? ""}
                onChange={val => update(f.key as keyof ScenarioData, val)}
                onPaste={handleFieldPaste(f.key)}
                onDrop={handleFieldDrop(f.key)}
                editorViewRef={view => { editorViews.current[f.key] = view }}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>
      )}

      <div
        className={styles.imagesSection}
        onPaste={handleRepoPaste}
        onDrop={handleRepoDrop}
        onDragOver={e => e.preventDefault()}
      >
        <div className={styles.imagesHeader}>
          <label>Attachments</label>
          <button
            className={styles.addImageBtn}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={14} />
            Add Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={e => {
              if (e.target.files) addImages(e.target.files)
              e.target.value = ""
            }}
          />
        </div>
        {(scenario.images ?? []).length > 0 && (
          <div className={styles.imageGrid}>
            {(scenario.images ?? []).map(img => (
              <div key={img.id} className={styles.imageThumb}>
                <img src={img.data || imgDataCache.get(img.id) || img.adoUrl} alt={img.name} />
                <button
                  className={styles.imageRemove}
                  onClick={() => removeImage(img.id)}
                >
                  <X size={12} />
                </button>
                {uploading.has(img.id) ? (
                  <span className={styles.imageStatus}><Loader2 size={10} className={styles.spin} /> Uploading</span>
                ) : img.adoUrl ? (
                  <span className={`${styles.imageStatus} ${styles.synced}`}>✓ Synced</span>
                ) : (
                  <span className={`${styles.imageStatus} ${styles.localOnly}`}>Local only</span>
                )}
                <span className={styles.imageName}>{img.name}</span>
              </div>
            ))}
          </div>
        )}
        {(scenario.images ?? []).length === 0 && (
          <div className={styles.dropHint}>Paste or drop images here</div>
        )}
      </div>
    </section>
  )
}
