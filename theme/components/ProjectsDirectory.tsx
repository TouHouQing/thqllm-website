import type { ProjectDefinition } from '../../src/data/project-schema';
import { projects } from '../../src/data/projects';
import { ProjectStageGrid } from './ProjectStageGrid';

export function ProjectsDirectory() {
  return <ProjectStageGrid projects={projects} featuredOnly={false} />;
}

interface ProjectDirectoryLinksProps {
  items?: readonly ProjectDefinition[];
}

export function ProjectDirectoryLinks({ items = projects }: ProjectDirectoryLinksProps) {
  const orderedItems = items.toSorted((a, b) => a.order - b.order);

  return (
    <ul>
      {orderedItems.map((project) => (
        <li key={project.id}>
          <a href={project.externalUrl} target="_blank" rel="noreferrer noopener">
            {project.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
