import { useMemo } from "react"
import { marked } from "marked"
import styles from "./MarkdownPreview.module.scss"

interface Props {
  markdown: string
}

export default function MarkdownPreview({ markdown }: Props) {
  const html = useMemo(() => {
    marked.setOptions({ breaks: true, gfm: true })
    return marked.parse(markdown) as string
  }, [markdown])

  return (
    <div className={styles.root}>
      <div
        className={styles.rendered}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
