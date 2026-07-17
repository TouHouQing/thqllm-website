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
  const tabsRef = useRef<HTMLDivElement>(null);
  const currentTabRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pathname || !current) {
      return;
    }

    const tabs = tabsRef.current;
    const currentTab = currentTabRef.current;

    if (!tabs || !currentTab) {
      return;
    }

    const alignCurrentTab = () => {
      const tabStart = currentTab.offsetLeft;
      const tabEnd = tabStart + currentTab.offsetWidth;
      const visibleStart = tabs.scrollLeft;
      const visibleEnd = visibleStart + tabs.clientWidth;

      if (tabStart >= visibleStart && tabEnd <= visibleEnd) {
        return;
      }

      const centeredLeft = tabStart + currentTab.offsetWidth / 2 - tabs.clientWidth / 2;
      const maxScrollLeft = Math.max(0, tabs.scrollWidth - tabs.clientWidth);
      const left = Math.min(Math.max(0, centeredLeft), maxScrollLeft);

      if (typeof tabs.scrollTo === 'function') {
        tabs.scrollTo({
          behavior: 'auto',
          left,
        });
      } else {
        tabs.scrollLeft = left;
      }
    };
    let frameId: number | undefined;
    const scheduleAlignment = () => {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        frameId = undefined;
        alignCurrentTab();
      });
    };

    alignCurrentTab();

    if (typeof ResizeObserver === 'function') {
      const resizeObserver = new ResizeObserver(scheduleAlignment);
      resizeObserver.observe(tabs);
      resizeObserver.observe(currentTab);

      return () => {
        resizeObserver.disconnect();
        if (frameId !== undefined) {
          cancelAnimationFrame(frameId);
        }
      };
    }

    window.addEventListener('resize', scheduleAlignment);
    return () => {
      window.removeEventListener('resize', scheduleAlignment);
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [pathname, current]);

  if (!current) {
    return null;
  }

  return (
    <nav className={styles.switcher} aria-label="切换项目文档">
      <div className={styles.switcherInner}>
        <span className={styles.switcherLabel}>PROJECT DOCS</span>
        <div ref={tabsRef} className={styles.switcherTabs}>
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
