import { useCallback, useRef, useEffect } from "react"
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { markdown } from "@codemirror/lang-markdown"
import { EditorView } from "@codemirror/view"

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onPaste?: (e: ClipboardEvent) => void
  onDrop?: (e: DragEvent) => void
  editorViewRef?: (view: EditorView | null) => void
}

const baseTheme = EditorView.theme({
  "&": {
    fontSize: "13px",
    fontFamily: "var(--font-sans)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    background: "var(--color-surface)",
    minHeight: "36px",
    maxHeight: "300px",
    overflow: "auto",
    transition: "border-color 0.15s",
  },
  "&.cm-focused": {
    outline: "none",
    borderColor: "var(--color-primary)",
  },
  ".cm-content": {
    padding: "8px 10px",
    fontFamily: "var(--font-sans)",
    fontSize: "13px",
    lineHeight: "1.5",
    caretColor: "var(--color-text)",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-selectionBackground": {
    backgroundColor: "#b4d5fe !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "#b4d5fe !important",
  },
  ".cm-placeholder": {
    color: "var(--color-text-secondary)",
    fontStyle: "normal",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
})

const extensions = [
  markdown(),
  baseTheme,
  EditorView.lineWrapping,
]

export default function MarkdownInput({
  value,
  onChange,
  placeholder,
  onPaste,
  onDrop,
  editorViewRef,
}: Props) {
  const ref = useRef<ReactCodeMirrorRef>(null)

  const handleChange = useCallback(
    (val: string) => {
      onChange(val)
    },
    [onChange],
  )

  // Expose EditorView and attach paste/drop handlers
  useEffect(() => {
    const view = ref.current?.view
    if (!view) return
    const dom = view.dom

    editorViewRef?.(view)

    const pasteHandler = (e: Event) => onPaste?.(e as ClipboardEvent)
    const dropHandler = (e: Event) => onDrop?.(e as DragEvent)

    if (onPaste) dom.addEventListener("paste", pasteHandler)
    if (onDrop) dom.addEventListener("drop", dropHandler)

    // Save cursor state before hiding (edit→preview)
    const saveState = () => {
      const sel = view.state.selection.main
      dom.dataset.cmAnchor = String(sel.anchor)
      dom.dataset.cmHead = String(sel.head)
      dom.dataset.cmFocused = view.hasFocus ? "1" : ""
    }
    // Restore cursor state after unhiding (preview→edit)
    const restoreState = () => {
      view.requestMeasure()
      const anchor = Number(dom.dataset.cmAnchor ?? 0)
      const head = Number(dom.dataset.cmHead ?? 0)
      const maxPos = view.state.doc.length
      view.dispatch({
        selection: { anchor: Math.min(anchor, maxPos), head: Math.min(head, maxPos) },
      })
      if (dom.dataset.cmFocused) view.focus()
    }
    window.addEventListener("cm-save", saveState)
    window.addEventListener("cm-restore", restoreState)

    return () => {
      if (onPaste) dom.removeEventListener("paste", pasteHandler)
      if (onDrop) dom.removeEventListener("drop", dropHandler)
      window.removeEventListener("cm-save", saveState)
      window.removeEventListener("cm-restore", restoreState)
      editorViewRef?.(null)
    }
  }, [onPaste, onDrop, editorViewRef])

  return (
    <CodeMirror
      ref={ref}
      value={value}
      onChange={handleChange}
      extensions={extensions}
      placeholder={placeholder}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        indentOnInput: true,
        bracketMatching: false,
        closeBrackets: false,
        autocompletion: false,
        searchKeymap: false,
      }}
    />
  )
}
