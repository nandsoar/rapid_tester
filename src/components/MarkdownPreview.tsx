import styles from "./MarkdownPreview.module.scss"

interface Props {
  markdown: string
}

export default function MarkdownPreview({ markdown }: Props) {
  return (
    <div className={styles.root}>
      <pre className={styles.code}>{markdown}</pre>
    </div>
  )
}
