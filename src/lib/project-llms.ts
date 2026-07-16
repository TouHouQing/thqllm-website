import * as path from 'node:path';

import type { ProjectDefinition } from '../data/project-schema';

interface RemarkRoot {
  type: string;
  children: unknown[];
}

interface RemarkFile {
  path?: string;
}

export function createProjectExternalLinksRemarkPlugin(
  projects: readonly ProjectDefinition[],
  projectsSourcePath: string,
): (tree: RemarkRoot, file: RemarkFile) => void {
  const normalizedProjectsSourcePath = path.resolve(projectsSourcePath);
  const orderedProjects = [...projects].sort((left, right) => left.order - right.order);

  return (tree, file) => {
    if (!file.path || path.resolve(file.path) !== normalizedProjectsSourcePath) {
      return;
    }

    tree.children.push({
      type: 'list',
      ordered: false,
      spread: false,
      children: orderedProjects.map((project) => ({
        type: 'listItem',
        spread: false,
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                url: new URL(project.externalUrl).href,
                children: [{ type: 'text', value: project.name }],
              },
            ],
          },
        ],
      })),
    });
  };
}
