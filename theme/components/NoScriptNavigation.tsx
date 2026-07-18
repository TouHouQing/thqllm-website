import { projects } from '../../src/data/projects';
import styles from './NoScriptNavigation.module.css';

const primaryLinks = [
  { href: '/', label: '首页' },
  { href: '/projects/', label: '项目' },
  { href: '/docs/fluctgraph/', label: '文档' },
  { href: '/about/', label: '关于' },
] as const;

const projectDocLinks = projects
  .filter((project) => project.docs)
  .map((project) => ({
    href: project.docs?.basePath ?? '/projects/',
    label: `${project.name} 文档`,
  }));

const fallbackLinks = [...primaryLinks, ...projectDocLinks];

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderNoScriptMarkup() {
  const links = fallbackLinks
    .map(
      (link) =>
        `<a class="${styles.link}" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`,
    )
    .join('');

  return `<div class="${styles.shell}"><nav class="${styles.nav}" aria-label="无 JavaScript 导航">${links}</nav></div>`;
}

export function NoScriptNavigation() {
  return (
    <noscript
      className={styles.noscript}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: noscript fallback must be emitted as raw HTML so browsers render it when JavaScript is disabled.
      dangerouslySetInnerHTML={{ __html: renderNoScriptMarkup() }}
    />
  );
}
