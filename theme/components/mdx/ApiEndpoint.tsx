import styles from './MdxComponents.module.css';

interface ApiEndpointProps {
  method: string;
  path: string;
}

export function ApiEndpoint({ method, path }: ApiEndpointProps) {
  return (
    <div className={styles.endpoint}>
      <strong>{method.toUpperCase()}</strong>
      <code>{path}</code>
    </div>
  );
}
