import type { HomeLayoutProps as RspressHomeLayoutProps } from '@rspress/core/theme-original';
import type { ProjectDefinition } from '../../src/data/project-schema';
import { projects } from '../../src/data/projects';
import { HeroTitleScreen } from '../components/HeroTitleScreen';
import { AboutBand, ManualBand, SeoIntroBand, SiteFooter } from '../components/HomeBands';
import { ProjectStageGrid } from '../components/ProjectStageGrid';
import styles from './HomeLayout.module.css';

interface HomeLayoutProps extends RspressHomeLayoutProps {
  projectRegistry?: readonly ProjectDefinition[];
}

export function HomeLayout({ projectRegistry = projects }: HomeLayoutProps = {}) {
  const manualCount = projectRegistry.filter((project) => project.docs).length;

  return (
    <main className={styles.page}>
      <HeroTitleScreen manualCount={manualCount} projectCount={projectRegistry.length} />
      <ProjectStageGrid projects={projectRegistry} />
      <SeoIntroBand />
      <ManualBand projects={projectRegistry} />
      <AboutBand />
      <SiteFooter />
    </main>
  );
}
