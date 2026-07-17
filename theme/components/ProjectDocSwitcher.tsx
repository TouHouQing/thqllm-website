import { useLocation } from '@rspress/core/runtime';
import { Link } from '@rspress/core/theme-original';
import { useEffect, useRef } from 'react';
import { projects } from '../../src/data/projects';
import { getProjectByPathname } from '../../src/lib/projects';
import styles from './DocsChrome.module.css';

const documentedProjects = projects.filter((project) => project.docs);

export function ProjectDocSwitcher() {
  const { pathname } = useLocation();
  const current = getProjectByPathname(pathname);
  const currentTabRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pathname || !current) {
      return;
    }

    const currentTab = currentTabRef.current;

    if (typeof currentTab?.scrollIntoView === 'function') {
      currentTab.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [pathname, current]);

  if (!current) {
    return null;
  }

  return (
    <nav className={styles.switcher} aria-label="切换项目文档">
      <div className={styles.switcherInner}>
        <span className={styles.switcherLabel}>PROJECT DOCS</span>
        <div className={styles.switcherTabs}>
          {documentedProjects.map((project) =>
            project.id === current.id ? (
              <span
                key={project.id}
                ref={currentTabRef}
                className={`${styles.switcherTab} ${styles.switcherTabActive}`}
                aria-current="page"
              >
                {project.name}
              </span>
            ) : (
              <Link
                key={project.id}
                className={styles.switcherTab}
                href={project.docs?.basePath ?? '/projects/'}
                aria-label={`${project.name} 文档`}
              >
                {project.name}
              </Link>
            ),
          )}
        </div>
      </div>
    </nav>
  );
}
