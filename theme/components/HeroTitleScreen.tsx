import { Link } from '@rspress/core/theme-original';
import { ChevronDown } from 'lucide-react';
import styles from './HeroTitleScreen.module.css';

interface HeroTitleScreenProps {
  projectCount: number;
}

const menuItems = [
  { index: '01', label: '项目选择', detail: 'PROJECT SELECT', href: '/#projects' },
  { index: '02', label: '使用文档', detail: 'MANUAL', href: '/docs/fluctgraph/' },
  { index: '03', label: '开发札记', detail: 'EXTRA STAGE', href: '/notes/' },
  { index: '04', label: '关于 THQLLM', detail: 'OMAKE', href: '/about/' },
] as const;

export function HeroTitleScreen({ projectCount }: HeroTitleScreenProps) {
  return (
    <section className={styles.hero} aria-labelledby="thq-home-title">
      <picture className={styles.picture}>
        <source media="(max-width: 640px)" srcSet="/assets/hero/thqllm-title-mobile.webp" />
        <img
          src="/assets/hero/thqllm-title-desktop.webp"
          alt=""
          className={styles.background}
          fetchPriority="high"
        />
      </picture>

      <div className={styles.scrim} aria-hidden="true" />

      <div className={styles.content}>
        <div className={styles.lockup}>
          <span className={styles.seal} aria-hidden="true">
            THQ
          </span>
          <div>
            <h1 id="thq-home-title">THQLLM</h1>
            <p className={styles.english}>AI PROJECTS · TOOLS · EXPERIMENTS</p>
            <p className={styles.chinese}>模型中转 · AI 编程 · 图像生成</p>
          </div>
        </div>

        <nav className={styles.menu} aria-label="首页主菜单">
          {menuItems.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.menuItem}
              data-active={index === 0 ? 'true' : undefined}
            >
              <span>{item.index}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </Link>
          ))}
        </nav>
      </div>

      <dl className={styles.hud} aria-label="站点信息">
        <div>
          <dt>Project</dt>
          <dd>{String(projectCount).padStart(2, '0')} NODES</dd>
        </div>
        <div>
          <dt>Manual</dt>
          <dd>ONLINE</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>1.00</dd>
        </div>
      </dl>

      <a className={styles.scrollHint} href="#projects">
        <span>进入项目选择</span>
        <ChevronDown aria-hidden="true" size={16} />
      </a>
    </section>
  );
}
