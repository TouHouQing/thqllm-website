import { Link } from '@rspress/core/theme-original';
import type { FormEvent, KeyboardEvent } from 'react';
import { OPEN_SEARCH_EVENT } from '../components/SiteSearch';
import styles from './NotFoundLayout.module.css';

const recoveryLinks = [
  { href: '/', label: '返回首页' },
  { href: '/projects/', label: '查看项目' },
] as const;

export function NotFoundLayout() {
  const openSearch = (trigger: HTMLElement | null) => {
    trigger?.focus();

    const event = new CustomEvent(OPEN_SEARCH_EVENT, {
      detail: {
        source: 'not-found-layout',
      },
      bubbles: true,
    });

    if (trigger) {
      trigger.dispatchEvent(event);
      return;
    }

    window.dispatchEvent(event);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trigger = event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]');
    openSearch(trigger);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter') {
      event.stopPropagation();
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <p className={styles.status}>404 · ROUTE LOST</p>
        <h1 className={styles.title}>CONTINUE?</h1>
        <p className={styles.description}>没有找到这个页面。请选择下一步。</p>

        <nav className={styles.actions} aria-label="错误页恢复操作">
          {recoveryLinks.map((link) => (
            <Link
              key={link.href}
              className={link.href === '/' ? `${styles.link} ${styles.primaryLink}` : styles.link}
              href={link.href}
            >
              {link.label}
            </Link>
          ))}
          <search className={styles.searchForm} aria-label="错误页站点搜索">
            <form action="/docs/fluctgraph/" method="get" onSubmit={handleSearchSubmit}>
              <button className={styles.link} type="submit" onKeyDown={handleSearchKeyDown}>
                搜索文档
              </button>
            </form>
          </search>
        </nav>
      </div>
    </main>
  );
}
