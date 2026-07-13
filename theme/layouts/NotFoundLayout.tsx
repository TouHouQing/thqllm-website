import { Link } from '@rspress/core/theme-original';
import styles from './NotFoundLayout.module.css';

const recoveryLinks = [
  { href: '/', label: '返回首页' },
  { href: '/projects/', label: '查看项目' },
  { href: '/docs/fluctgraph/', label: '搜索文档' },
] as const;

export function NotFoundLayout() {
  return (
    <main className={styles.page}>
      <div>
        <p className={styles.status}>404 · ROUTE LOST</p>
        <h1 className={styles.title}>CONTINUE?</h1>
        <p className={styles.description}>没有找到这个页面。请选择下一步。</p>

        <nav className={styles.actions} aria-label="错误页恢复操作">
          {recoveryLinks.map((link) => (
            <Link key={link.href} className={styles.link} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
