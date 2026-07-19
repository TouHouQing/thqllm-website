import type { ProjectDefinition } from '../data/project-schema';
import { projects } from '../data/projects';
import { createProjectDocRoutePath } from './project-doc-routes';

export const SITE_ORIGIN = 'https://thqllm.com';

const SITE_DESCRIPTION =
  'THQLLM 是 THQ 的 AI 项目官网，汇集 THQ API、FluctGraph、Toho Image Studio 与使用文档。';

const indexableRobots = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';

type StructuredDataEntity = Record<string, unknown>;

export interface SiteSeo {
  canonicalPath: string;
  canonicalUrl: string;
  robots: string;
  structuredData: {
    '@context': 'https://schema.org';
    '@graph': StructuredDataEntity[];
  };
}

function createCanonicalPaths(projectRegistry: readonly ProjectDefinition[]) {
  return new Set([
    '/',
    '/projects/',
    '/about/',
    ...projectRegistry.flatMap((project) =>
      project.docs
        ? project.docs.sections.flatMap((section) =>
            section.items.map((item) =>
              createProjectDocRoutePath(project.docs?.basePath ?? '/', item.slug),
            ),
          )
        : [],
    ),
  ]);
}

function normalizePathname(pathname: string) {
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const withoutIndex = withLeadingSlash.replace(/\/index(?:\.html)?$/, '/');
  const withoutHtmlExtension = withoutIndex.replace(/\.html$/, '');
  const normalizedSlashes = withoutHtmlExtension.replace(/\/{2,}/g, '/');

  return normalizedSlashes || '/';
}

export function normalizeCanonicalPath(
  pathname: string,
  projectRegistry: readonly ProjectDefinition[] = projects,
) {
  const canonicalPaths = createCanonicalPaths(projectRegistry);
  const normalizedPath = normalizePathname(pathname);

  if (canonicalPaths.has(normalizedPath)) {
    return normalizedPath;
  }

  const directoryPath = normalizedPath.endsWith('/') ? normalizedPath : `${normalizedPath}/`;
  if (canonicalPaths.has(directoryPath)) {
    return directoryPath;
  }

  return normalizedPath;
}

function createWebPage(canonicalUrl: string) {
  return {
    '@id': `${canonicalUrl}#webpage`,
    '@type': 'WebPage',
    isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
    inLanguage: 'zh-CN',
    url: canonicalUrl,
  };
}

function createProjectDirectoryData(projectRegistry: readonly ProjectDefinition[]) {
  const orderedProjects = [...projectRegistry].sort((left, right) => left.order - right.order);

  return {
    '@id': `${SITE_ORIGIN}/projects/#itemlist`,
    '@type': 'ItemList',
    itemListElement: orderedProjects.map((project, index) => ({
      '@type': 'ListItem',
      item: {
        '@type': 'WebApplication',
        applicationCategory:
          project.id === 'toho-image-studio' ? 'MultimediaApplication' : 'DeveloperApplication',
        description: project.description,
        name: project.name,
        operatingSystem: 'Web',
        url: project.externalUrl,
      },
      position: index + 1,
    })),
    name: 'THQLLM 项目目录',
  };
}

function createStructuredData(
  canonicalPath: string,
  canonicalUrl: string,
  projectRegistry: readonly ProjectDefinition[],
) {
  const graph: StructuredDataEntity[] = [createWebPage(canonicalUrl)];

  if (canonicalPath === '/') {
    graph.unshift(
      {
        '@id': `${SITE_ORIGIN}/#organization`,
        '@type': 'Organization',
        description: SITE_DESCRIPTION,
        name: 'THQLLM',
        sameAs: ['https://tohoqing.com/', 'https://github.com/TouHouQing'],
        url: `${SITE_ORIGIN}/`,
      },
      {
        '@id': `${SITE_ORIGIN}/#website`,
        '@type': 'WebSite',
        description: SITE_DESCRIPTION,
        inLanguage: 'zh-CN',
        name: 'THQLLM',
        publisher: { '@id': `${SITE_ORIGIN}/#organization` },
        url: `${SITE_ORIGIN}/`,
      },
    );
  }

  if (canonicalPath === '/projects/') {
    graph.push(createProjectDirectoryData(projectRegistry));
  }

  return {
    '@context': 'https://schema.org' as const,
    '@graph': graph,
  };
}

export function createSiteSeo(
  pathname: string,
  projectRegistry: readonly ProjectDefinition[] = projects,
): SiteSeo {
  const canonicalPath = normalizeCanonicalPath(pathname, projectRegistry);
  const isIndexable = createCanonicalPaths(projectRegistry).has(canonicalPath);
  const canonicalUrl = new URL(canonicalPath, `${SITE_ORIGIN}/`).href;

  return {
    canonicalPath,
    canonicalUrl,
    robots: isIndexable ? indexableRobots : 'noindex,nofollow',
    structuredData: createStructuredData(canonicalPath, canonicalUrl, projectRegistry),
  };
}

export function serializeStructuredData(structuredData: Record<string, unknown>) {
  return JSON.stringify(structuredData).replace(/</g, '\\u003c');
}
