import { projects } from '../../src/data/projects';
import { HeroTitleScreen } from '../components/HeroTitleScreen';
import styles from './HomeLayout.module.css';

export function HomeLayout() {
  return (
    <main className={styles.page}>
      <HeroTitleScreen projectCount={projects.length} />
    </main>
  );
}
