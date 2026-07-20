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

export function SeoIntroBand() {
  return (
    <section className={styles.seoIntro} aria-labelledby="seo-intro-title">
      <div className={styles.seoIntroHeading}>
        <p>THQLLM / AI API DIRECTORY</p>
        <h2 id="seo-intro-title">AI 大模型中转站与大模型 API 入口</h2>
      </div>
      <div className={styles.seoIntroCopy}>
        <p>
          THQLLM 面向开发者、AI 编程用户和团队整理 AI 大模型服务。这里可以找到 AI 大模型 API、AI
          大模型中转站、AI 中转站和企业级 AI 中转站相关项目， 并通过文档了解账号、API
          Key、模型和客户端配置。
        </p>
        <p>
          其中 THQ API 提供 Codex 中转站、GPT 中转站、Claude 中转站、 Gemini 和 Grok
          等模型的统一接入，也适合连接 AI 编程、Agent 和自动化应用。 关于 AI 代充、GPT 代充、Claude
          代充等账户服务，请以对应项目控制台展示的官方入口和规则为准。
        </p>
      </div>
    </section>
  );
}

export function AboutBand() {
  return (
    <section className={styles.about} aria-labelledby="about-title">
      <p>OMAKE / ABOUT</p>
      <h2 id="about-title">关于 THQLLM</h2>
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
