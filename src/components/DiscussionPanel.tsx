import { useState, useEffect, useCallback } from "react"
import { RefreshCw, Send } from "lucide-react"
import { fetchWorkItemComments, postWorkItemComment, type AdoComment } from "../ado"
import styles from "./DiscussionPanel.module.scss"

interface Props {
  workItemId: number
}

export default function DiscussionPanel({ workItemId }: Props) {
  const [comments, setComments] = useState<AdoComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [newComment, setNewComment] = useState("")
  const [posting, setPosting] = useState(false)

  const loadComments = useCallback(() => {
    setLoading(true)
    setError("")

    fetchWorkItemComments(workItemId)
      .then(c => setComments(c))
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [workItemId])

  useEffect(() => { loadComments() }, [loadComments])

  async function handlePost() {
    const text = newComment.trim()
    if (!text || posting) return

    setPosting(true)
    try {
      const posted = await postWorkItemComment(workItemId, text)
      setComments(prev => [...prev, posted])
      setNewComment("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post comment")
    } finally {
      setPosting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handlePost()
    }
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2>Discussion</h2>
        <button
          className={styles.refreshBtn}
          onClick={loadComments}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? styles.spin : undefined} />
        </button>
      </div>

      <div className={styles.content}>
        {loading && comments.length === 0 && (
          <p className={styles.status}>Loading comments...</p>
        )}
        {error && <p className={styles.statusError}>{error}</p>}
        {!loading && !error && comments.length === 0 && (
          <p className={styles.status}>No comments yet.</p>
        )}

        {comments.map(c => (
          <div key={c.id} className={styles.comment}>
            <div className={styles.commentMeta}>
              <span className={styles.author}>{c.createdBy?.displayName ?? "Unknown"}</span>
              <span className={styles.date}>{formatDate(c.createdDate)}</span>
            </div>
            <div
              className={styles.commentBody}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.text) }}
            />
          </div>
        ))}
      </div>

      <div className={styles.composer}>
        <textarea
          className={styles.composerInput}
          ref={el => {
            if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px" }
          }}
          value={newComment}
          onChange={e => {
            setNewComment(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = e.target.scrollHeight + "px"
          }}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment... (Ctrl+Enter to send)"
          rows={1}
        />
        <button
          className={styles.sendBtn}
          onClick={handlePost}
          disabled={!newComment.trim() || posting}
        >
          <Send size={14} />
          {posting ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  )
}

function sanitizeHtml(html: string): string {
  const allowed = new Set([
    "p", "br", "b", "i", "em", "strong", "u", "s", "strike",
    "ul", "ol", "li", "div", "span", "a", "img", "pre", "code",
    "blockquote", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tr", "th", "td",
  ])
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  function clean(node: Node): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element
        const tag = el.tagName.toLowerCase()
        if (!allowed.has(tag)) {
          while (el.firstChild) node.insertBefore(el.firstChild, el)
          node.removeChild(el)
        } else {
          for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase()
            if (name.startsWith("on") || name === "style" || name === "srcdoc") {
              el.removeAttribute(attr.name)
            }
            if ((name === "href" || name === "src") &&
              (attr.value.trim().toLowerCase().startsWith("javascript:") ||
                attr.value.trim().toLowerCase().startsWith("data:"))) {
              el.removeAttribute(attr.name)
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
