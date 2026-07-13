import styles from './MdxComponents.module.css';

interface ParameterRow {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
}

interface ParameterTableProps {
  rows: readonly ParameterRow[];
  caption?: string;
}

export function ParameterTable({ rows, caption = '参数说明' }: ParameterTableProps) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable tables must be keyboard reachable.
    <section className={styles.tableScroll} aria-label={caption} tabIndex={0}>
      <table className={styles.parameterTable}>
        <caption className={styles.visuallyHidden}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">参数</th>
            <th scope="col">类型</th>
            <th scope="col">必填</th>
            <th scope="col">说明</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <th scope="row">
                <code>{row.name}</code>
              </th>
              <td>{row.type}</td>
              <td>{row.required ? '是' : '否'}</td>
              <td>{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
