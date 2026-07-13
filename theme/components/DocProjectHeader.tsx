import { useLocation } from '@rspress/core/runtime';
import { ArrowUpRight } from 'lucide-react';
import { getProjectByPathname } from '../../src/lib/projects';
import styles from './DocsChrome.module.css';

export function DocProjectHeader() {
  const { pathname } = useLocation();
  const project = getProjectByPathname(pathname);

  if (!project) {
    return null;
  }

  return (
    <header className={styles.projectHeader}>
      <p>
        {project.stageLabel} · {project.categoryLabel}
      </p>
      <strong>{project.name}</strong>
      <a href={project.externalUrl} target="_blank" rel="noreferrer noopener">
        <ArrowUpRight aria-hidden="true" size={15} />
        打开项目
      </a>
    </header>
  );
}
