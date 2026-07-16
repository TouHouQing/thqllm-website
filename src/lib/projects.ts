import type { ProjectDefinition } from '../data/project-schema';
import { projects } from '../data/projects';
import { createProjectDocRoutePath } from './project-doc-routes';

export interface SidebarItem {
  text: string;
  link: string;
}

export interface SidebarSection {
  text: string;
  items: SidebarItem[];
}

export type SidebarConfig = Record<string, SidebarSection[]>;

export function getFeaturedProjects(items: readonly ProjectDefinition[]): ProjectDefinition[] {
  return items.filter((project) => project.featured).sort((a, b) => a.order - b.order);
}

export function getProjectByPathname(pathname: string): ProjectDefinition | undefined {
  return projects.find((project) => {
    const docs = project.docs;

    return docs !== undefined && pathname.startsWith(docs.basePath);
  });
}

export function createSidebarConfig(items: readonly ProjectDefinition[]): SidebarConfig {
  return Object.fromEntries(
    items.flatMap((project) => {
      const docs = project.docs;

      if (!docs) {
        return [];
      }

      return [
        [
          docs.basePath,
          docs.sections.map((section) => ({
            text: section.text,
            items: section.items.map((item) => ({
              text: item.text,
              link: createProjectDocRoutePath(docs.basePath, item.slug),
            })),
          })),
        ],
      ];
    }),
  );
}
