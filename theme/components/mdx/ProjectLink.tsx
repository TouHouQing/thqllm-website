import { ArrowUpRight } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import styles from './MdxComponents.module.css';

export function ProjectLink({ href, children }: PropsWithChildren<{ href: string }>) {
  return (
    <a className={styles.projectLink} href={href} target="_blank" rel="noreferrer noopener">
      {children}
      <ArrowUpRight aria-hidden="true" size={16} />
    </a>
  );
}
