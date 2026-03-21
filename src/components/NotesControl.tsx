import MarkdownInput from "./MarkdownInput"
import styles from "./NotesControl.module.scss"

interface Props {
  value: string
  onChange: (value: string) => void
}

export default function NotesControl({ value, onChange }: Props) {
  return (
    <section className={styles.root}>
      <h3 className={styles.label}>Notes</h3>
      <MarkdownInput
        value={value}
        onChange={onChange}
        placeholder="General notes, context, or observations..."
      />
    </section>
  )
}
