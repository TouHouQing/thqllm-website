import { projects } from '../../src/data/projects';
import { HeroTitleScreen } from '../components/HeroTitleScreen';
import { AboutBand, ManualBand, NotesBand, SiteFooter } from '../components/HomeBands';
import { ProjectStageGrid } from '../components/ProjectStageGrid';
import styles from './HomeLayout.module.css';

export function HomeLayout() {
  return (
    <main className={styles.page}>
      <HeroTitleScreen projectCount={projects.length} />
      <ProjectStageGrid projects={projects} />
      <ManualBand projects={projects} />
      <NotesBand />
      <AboutBand />
      <SiteFooter />
    </main>
  );
}
