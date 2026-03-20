import styles from "./NotesControl.module.scss"

interface Props {
  value: string
  onChange: (value: string) => void
}

export default function NotesControl({ value, onChange }: Props) {
  return (
    <section className={styles.root}>
      <h3 className={styles.label}>Notes</h3>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="General notes, context, or observations..."
        rows={4}
      />
    </section>
  )
}
