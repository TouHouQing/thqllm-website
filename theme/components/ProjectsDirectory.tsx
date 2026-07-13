import { projects } from '../../src/data/projects';
import { ProjectStageGrid } from './ProjectStageGrid';

export function ProjectsDirectory() {
  return <ProjectStageGrid projects={projects} featuredOnly={false} />;
}
