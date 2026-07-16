import type { ProjectDefinition } from '../data/project-schema';
import { createProjectDocRoutePath } from './project-doc-routes';

export const PROJECT_BUILD_MANIFEST_SCHEMA_VERSION = 1 as const;
export const PROJECT_BUILD_SITE_ORIGIN = 'https://thqllm.com' as const;
export const PROJECT_BUILD_MANIFEST_FILENAME = 'project-registry.json' as const;

export interface ProjectBuildManifestRoute {
  routePath: string;
  htmlPath: string;
  markdownPath: string;
  llms: {
    txt: boolean;
    full: boolean;
  };
}

export interface ProjectBuildManifestProject {
  id: string;
  name: string;
  externalUrl: string;
  order: number;
  featured: boolean;
  documented: boolean;
}

export interface ProjectBuildManifest {
  schemaVersion: typeof PROJECT_BUILD_MANIFEST_SCHEMA_VERSION;
  siteOrigin: typeof PROJECT_BUILD_SITE_ORIGIN;
  routes: ProjectBuildManifestRoute[];
  projects: ProjectBuildManifestProject[];
}

const fixedRoutes: readonly ProjectBuildManifestRoute[] = [
  {
    routePath: '/',
    htmlPath: 'index.html',
    markdownPath: 'index.md',
    llms: { txt: false, full: true },
  },
  {
    routePath: '/projects/',
    htmlPath: 'projects/index.html',
    markdownPath: 'projects/index.md',
    llms: { txt: true, full: true },
  },
  {
    routePath: '/notes/',
    htmlPath: 'notes/index.html',
    markdownPath: 'notes/index.md',
    llms: { txt: true, full: true },
  },
  {
    routePath: '/about/',
    htmlPath: 'about/index.html',
    markdownPath: 'about/index.md',
    llms: { txt: true, full: true },
  },
];

function routeOutputPath(routePath: string, extension: 'html' | 'md'): string {
  const relativeRoutePath = routePath.slice(1);

  return routePath.endsWith('/')
    ? `${relativeRoutePath}index.${extension}`
    : `${relativeRoutePath}.${extension}`;
}

function normalizeExternalUrl(externalUrl: string): string {
  return new URL(externalUrl).href;
}

function createDocsRoutes(project: ProjectDefinition): ProjectBuildManifestRoute[] {
  const docs = project.docs;

  if (!docs) {
    return [];
  }

  return docs.sections.flatMap((section) =>
    section.items.map((item) => {
      const routePath = createProjectDocRoutePath(docs.basePath, item.slug);

      return {
        routePath,
        htmlPath: routeOutputPath(routePath, 'html'),
        markdownPath: routeOutputPath(routePath, 'md'),
        llms: { txt: true, full: true },
      };
    }),
  );
}

export function createProjectBuildManifest(
  projects: readonly ProjectDefinition[],
): ProjectBuildManifest {
  const orderedProjects = [...projects].sort((left, right) => left.order - right.order);

  return {
    schemaVersion: PROJECT_BUILD_MANIFEST_SCHEMA_VERSION,
    siteOrigin: PROJECT_BUILD_SITE_ORIGIN,
    routes: [
      ...fixedRoutes.map((route) => ({
        ...route,
        llms: { ...route.llms },
      })),
      ...orderedProjects.flatMap(createDocsRoutes),
    ],
    projects: orderedProjects.map((project) => ({
      id: project.id,
      name: project.name,
      externalUrl: normalizeExternalUrl(project.externalUrl),
      order: project.order,
      featured: project.featured,
      documented: project.docs !== undefined,
    })),
  };
}

export function serializeProjectBuildManifest(manifest: ProjectBuildManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
