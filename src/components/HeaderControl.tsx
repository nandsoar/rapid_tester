import type { HeaderData, TemplateConfig } from "../types"
import { DEFAULT_TEMPLATE } from "../types"
import styles from "./HeaderControl.module.scss"

interface Props {
  data: HeaderData
  onChange: (data: HeaderData) => void
  template?: TemplateConfig
}

export default function HeaderControl({ data, onChange, template = DEFAULT_TEMPLATE }: Props) {
  function update(key: string, value: string) {
    onChange({ ...data, [key]: value })
  }

  return (
    <section className={styles.root}>
      <h3 className={styles.label}>Header</h3>
      <div className={styles.fields}>
        {template.headerFields.map(field => (
          <div key={field.key} className={styles.field}>
            <label>{field.label}</label>
            <input
              type={field.type}
              value={data[field.key] || ""}
              onChange={e => update(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
