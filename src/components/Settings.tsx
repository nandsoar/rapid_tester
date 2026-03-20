import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Save, Eye, EyeOff, FolderOpen, Plus, Trash2, Loader2, AlertCircle, ChevronRight, ChevronDown } from "lucide-react"
import { loadAdoSettings, saveAdoSettings, fetchQueryTree } from "../ado"
import type { AdoSettings, SavedQuery, AdoQueryNode } from "../ado"
import styles from "./Settings.module.scss"

export default function Settings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<AdoSettings>(loadAdoSettings)
  const [showPat, setShowPat] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [queryTree, setQueryTree] = useState<AdoQueryNode[]>([])
  const [browserLoading, setBrowserLoading] = useState(false)
  const [browserError, setBrowserError] = useState("")

  function handleSave() {
    saveAdoSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function update(patch: Partial<AdoSettings>) {
    setSettings(prev => ({ ...prev, ...patch }))
    setSaved(false)
  }

  function addQuery(query: SavedQuery) {
    if (settings.savedQueries.some(q => q.id === query.id)) return
    update({ savedQueries: [...settings.savedQueries, query] })
  }

  function removeQuery(id: string) {
    update({ savedQueries: settings.savedQueries.filter(q => q.id !== id) })
  }

  async function handleBrowse() {
    setBrowserError("")
    setBrowserLoading(true)
    // Save current settings first so the API can use them
    saveAdoSettings(settings)
    try {
      const tree = await fetchQueryTree()
      setQueryTree(tree)
      setShowBrowser(true)
    } catch (err) {
      setBrowserError(err instanceof Error ? err.message : "Failed to load queries.")
    } finally {
      setBrowserLoading(false)
    }
  }

  return (
    <div className={styles.root}>
      <header className={styles.toolbar}>
        <button className={styles.backBtn} onClick={() => navigate("/")}>
          <ArrowLeft size={18} />
          Back
        </button>
        <h1>Settings</h1>
        <button className={styles.saveBtn} onClick={handleSave}>
          <Save size={16} />
          {saved ? "Saved!" : "Save"}
        </button>
      </header>

      <section className={styles.section}>
        <h2>Azure DevOps Connection</h2>
        <p className={styles.hint}>
          Configure your ADO organization to fetch work items directly.
          Your PAT is stored locally on this device only.
        </p>

        <label className={styles.field}>
          <span>Organization URL</span>
          <input
            type="text"
            value={settings.orgUrl}
            onChange={e => update({ orgUrl: e.target.value })}
            placeholder="https://dev.azure.com/your-org"
          />
        </label>

        <label className={styles.field}>
          <span>Project</span>
          <input
            type="text"
            value={settings.project}
            onChange={e => update({ project: e.target.value })}
            placeholder="e.g. NEXiA Fulfillment"
          />
          <span className={styles.fieldHint}>Required for query support</span>
        </label>

        <label className={styles.field}>
          <span>Personal Access Token</span>
          <div className={styles.patRow}>
            <input
              type={showPat ? "text" : "password"}
              value={settings.pat}
              onChange={e => update({ pat: e.target.value })}
              placeholder="Paste your PAT here..."
            />
            <button
              className={styles.togglePat}
              onClick={() => setShowPat(p => !p)}
              type="button"
            >
              {showPat ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <div className={styles.instructions}>
          <h3>How to create a PAT:</h3>
          <ol>
            <li>Go to Azure DevOps → Profile icon → Personal access tokens</li>
            <li>Click <strong>+ New Token</strong></li>
            <li>Name it anything (e.g. "Rapid Tester")</li>
            <li>Set scope: <strong>Work Items → Read</strong> (add Write for push later)</li>
            <li>Copy the token and paste it above</li>
          </ol>
        </div>
      </section>

      <section className={styles.section} style={{ marginTop: 16 }}>
        <h2>Saved Queries</h2>
        <p className={styles.hint}>
          Add your ADO queries to see work items on the home screen.
        </p>

        {settings.savedQueries.length > 0 && (
          <div className={styles.queryList}>
            {settings.savedQueries.map(q => (
              <div key={q.id} className={styles.queryRow}>
                <div className={styles.queryInfo}>
                  <span className={styles.queryName}>{q.name}</span>
                  <span className={styles.queryPath}>{q.path}</span>
                </div>
                <button
                  className={styles.removeBtn}
                  onClick={() => removeQuery(q.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.queryActions}>
          <button
            className={styles.browseBtn}
            onClick={handleBrowse}
            disabled={browserLoading || !settings.orgUrl || !settings.project || !settings.pat}
          >
            {browserLoading ? <Loader2 size={16} className={styles.spin} /> : <FolderOpen size={16} />}
            {browserLoading ? "Loading..." : "Browse from ADO"}
          </button>
        </div>

        {browserError && (
          <p className={styles.error}>
            <AlertCircle size={14} />
            {browserError}
          </p>
        )}

        {showBrowser && (
          <div className={styles.browserOverlay}>
            <div className={styles.browserDialog}>
              <div className={styles.browserHeader}>
                <h3>Select Queries</h3>
                <button onClick={() => setShowBrowser(false)} className={styles.closeBtn}>✕</button>
              </div>
              <div className={styles.browserTree}>
                {queryTree.map(node => (
                  <QueryTreeNode
                    key={node.id}
                    node={node}
                    onAdd={addQuery}
                    isAdded={id => settings.savedQueries.some(q => q.id === id)}
                  />
                ))}
                {queryTree.length === 0 && (
                  <p className={styles.emptyTree}>No queries found.</p>
                )}
              </div>
              <div className={styles.browserFooter}>
                <button className={styles.browseBtn} onClick={() => setShowBrowser(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function QueryTreeNode({
  node,
  onAdd,
  isAdded,
}: {
  node: AdoQueryNode
  onAdd: (q: SavedQuery) => void
  isAdded: (id: string) => boolean
}) {
  const [expanded, setExpanded] = useState(false)

  if (node.isFolder) {
    return (
      <div className={styles.treeFolder}>
        <button className={styles.treeFolderBtn} onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {node.name}
        </button>
        {expanded && node.children && (
          <div className={styles.treeChildren}>
            {node.children.map(child => (
              <QueryTreeNode key={child.id} node={child} onAdd={onAdd} isAdded={isAdded} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const added = isAdded(node.id)
  return (
    <div className={styles.treeQuery}>
      <span>{node.name}</span>
      <button
        className={added ? styles.addedBtn : styles.addBtn}
        onClick={() => onAdd({ id: node.id, name: node.name, path: node.path })}
        disabled={added}
      >
        {added ? "Added" : <><Plus size={14} /> Add</>}
      </button>
    </div>
  )
}
