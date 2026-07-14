import { Link } from '@rspress/core/theme-original';
import { OPEN_SEARCH_EVENT } from '../components/SiteSearch';
import styles from './NotFoundLayout.module.css';

const recoveryLinks = [
  { href: '/', label: '返回首页' },
  { href: '/projects/', label: '查看项目' },
] as const;

export function NotFoundLayout() {
  const openSearch = () => {
    window.dispatchEvent(
      new CustomEvent(OPEN_SEARCH_EVENT, {
        detail: {
          source: 'not-found-layout',
        },
      }),
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <p className={styles.status}>404 · ROUTE LOST</p>
        <h1 className={styles.title}>CONTINUE?</h1>
        <p className={styles.description}>没有找到这个页面。请选择下一步。</p>

        <nav className={styles.actions} aria-label="错误页恢复操作">
          {recoveryLinks.map((link) => (
            <Link key={link.href} className={styles.link} href={link.href}>
              {link.label}
            </Link>
          ))}
          <button className={styles.link} type="button" onClick={openSearch}>
            搜索文档
          </button>
        </nav>
      </div>
    </main>
  );
}
