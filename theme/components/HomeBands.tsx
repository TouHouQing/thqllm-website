import { Link } from '@rspress/core/theme-original';
import { ArrowRight, BookOpen } from 'lucide-react';
import type { ProjectDefinition } from '../../src/data/project-schema';
import styles from './HomeBands.module.css';

export function ManualBand({ projects }: { projects: readonly ProjectDefinition[] }) {
  const orderedProjects = projects.toSorted((left, right) => left.order - right.order);

  return (
    <section className={styles.manual} aria-labelledby="manual-title">
      <div>
        <p>MANUAL / 使用文档</p>
        <h2 id="manual-title">使用文档</h2>
        <span>{orderedProjects.map((project) => project.name).join(' · ')}</span>
      </div>
      <ul>
        {orderedProjects.map((project) => (
          <li key={project.id}>
            {project.docs ? (
              <Link href={project.docs.basePath}>
                <BookOpen aria-hidden="true" size={16} />
                <span>{project.name}</span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            ) : (
              <span>{project.name} · 文档准备中</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AboutBand() {
  return (
    <section className={styles.about} aria-labelledby="about-title">
      <p>OMAKE / ABOUT</p>
      <h2 id="about-title">关于 THQLLM</h2>
      <span>把模型、代码与图像工具整理成清晰、可使用、可查阅的项目网络。</span>
      <Link href="/about/">了解更多</Link>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <strong>THQLLM</strong>
      <span>AI PROJECTS · TOOLS · EXPERIMENTS</span>
      <span>© 2026 THQLLM</span>
    </footer>
  );
}
