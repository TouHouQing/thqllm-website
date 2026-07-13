import styles from './MdxComponents.module.css';

interface ParameterRow {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
}

interface ParameterTableProps {
  rows: readonly ParameterRow[];
}

export function ParameterTable({ rows }: ParameterTableProps) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.parameterTable}>
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
    </div>
  );
}
