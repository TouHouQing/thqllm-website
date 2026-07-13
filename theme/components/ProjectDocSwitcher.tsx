import { useLocation, useNavigate } from '@rspress/core/runtime';
import { Link } from '@rspress/core/theme-original';
import { projects } from '../../src/data/projects';
import { getProjectByPathname } from '../../src/lib/projects';
import styles from './DocsChrome.module.css';

export function ProjectDocSwitcher() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = getProjectByPathname(pathname);

  if (!current) {
    return null;
  }

  return (
    <nav className={styles.switcher} aria-label="切换项目文档">
      <span>PROJECT</span>
      <strong>{current.name}</strong>
      <div className={styles.switcherLinks}>
        {projects
          .filter((project) => project.docs && project.id !== current.id)
          .map((project) => (
            <Link
              key={project.id}
              href={project.docs?.basePath ?? '/projects/'}
              aria-label={`${project.name} 文档`}
            >
              {project.name}
            </Link>
          ))}
      </div>
      <select
        className={styles.mobileSelect}
        aria-label="切换当前项目文档"
        value={current.id}
        onChange={(event) => {
          const target = projects.find((project) => project.id === event.target.value);

          if (target?.docs) {
            navigate(target.docs.basePath);
          }
        }}
      >
        {projects
          .filter((project) => project.docs)
          .map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
      </select>
    </nav>
  );
}
