import { Link } from '@rspress/core/theme-original';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import type { ProjectDefinition } from '../../src/data/project-schema';
import { getFeaturedProjects } from '../../src/lib/projects';
import styles from './ProjectStageGrid.module.css';

interface ProjectStageGridProps {
  projects: readonly ProjectDefinition[];
  featuredOnly?: boolean;
}

export function ProjectStageGrid({ projects, featuredOnly = true }: ProjectStageGridProps) {
  const visibleProjects = featuredOnly
    ? getFeaturedProjects(projects)
    : projects.toSorted((a, b) => a.order - b.order);

  return (
    <section id="projects" className={styles.section} aria-labelledby="projects-title">
      <header className={styles.header}>
        <div>
          <p>STAGE SELECT / PROJECT NETWORK</p>
          <h2 id="projects-title">项目选择</h2>
        </div>
        <span>{String(visibleProjects.length).padStart(2, '0')} PROJECTS AVAILABLE</span>
      </header>

      <div className={styles.grid}>
        {visibleProjects.map((project) => (
          <article
            key={project.id}
            className={styles.card}
            data-accent={project.accent}
            data-testid="project-stage"
          >
            <p className={styles.stage}>
              {project.stageLabel} · {project.categoryLabel}
            </p>
            <h3>{project.name}</h3>
            <p className={styles.description}>{project.description}</p>
            <ul className={styles.tags} aria-label={`${project.name} 标签`}>
              {project.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
            <div className={styles.actions} data-project-actions>
              <a
                href={project.externalUrl}
                data-project-external-link={project.id}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`进入 ${project.name}`}
              >
                <ArrowUpRight aria-hidden="true" size={16} />
                进入项目
              </a>
              {project.docs ? (
                <Link
                  href={project.docs.basePath}
                  data-project-docs-link={project.id}
                  aria-label={`阅读 ${project.name} 文档`}
                >
                  <BookOpen aria-hidden="true" size={16} />
                  使用文档
                </Link>
              ) : (
                <span aria-disabled="true">文档准备中</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
