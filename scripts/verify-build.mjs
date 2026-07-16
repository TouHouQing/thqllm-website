import { access, lstat, readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import remarkFrontmatter from 'remark-frontmatter';
import remarkParse from 'remark-parse';
import sharp from 'sharp';
import { unified } from 'unified';
import { parseDocument } from 'yaml';
import { z } from 'zod';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const buildDir = path.join(repoRoot, 'doc_build');
const manifestFilename = 'project-registry.json';
const expectedManifestSchemaVersion = 1;
const expectedSiteOrigin = 'https://thqllm.com';
const sitemapNamespace = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const sitemapUrlChildNames = new Set(['loc', 'lastmod', 'changefreq', 'priority']);
const fixedRequiredOutputs = ['404.html', 'sitemap.xml', 'llms.txt', 'llms-full.txt'];
const criticalImages = [
  {
    format: 'png',
    formatLabel: 'PNG',
    height: 630,
    relativePath: 'og-cover.png',
    width: 1200,
  },
  {
    format: 'webp',
    formatLabel: 'WebP',
    height: 1080,
    relativePath: 'assets/hero/thqllm-title-desktop.webp',
    width: 1920,
  },
  {
    format: 'webp',
    formatLabel: 'WebP',
    height: 1440,
    relativePath: 'assets/hero/thqllm-title-mobile.webp',
    width: 1080,
  },
];
const criticalAssetPaths = [
  ...criticalImages.map(({ relativePath }) => relativePath),
  'favicon.svg',
  'robots.txt',
];
const canonicalSitemapUrl = `${expectedSiteOrigin}/sitemap.xml`;
const expectedHomepageReferences = {
  desktopHero: '/assets/hero/thqllm-title-desktop.webp',
  favicon: '/favicon.svg',
  mobileHero: '/assets/hero/thqllm-title-mobile.webp',
  mobileHeroMedia: '(max-width: 640px)',
  ogImage: 'https://thqllm.com/og-cover.png',
};
const svgNamespace = 'http://www.w3.org/2000/svg';
const svgNumberSource = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const svgNumberSeparator = String.raw`(?:[ \t\r\n]+(?:,[ \t\r\n]*)?|,[ \t\r\n]*)`;
const svgViewBoxPattern = new RegExp(
  `^[ \\t\\r\\n]*(${svgNumberSource})${svgNumberSeparator}(${svgNumberSource})${svgNumberSeparator}(${svgNumberSource})${svgNumberSeparator}(${svgNumberSource})[ \\t\\r\\n]*$`,
);
const srcsetDensityPattern = /^((?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)x$/;
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const pngCrc32Table = Array.from({ length: 256 }, (_, value) => {
  let checksum = value;

  for (let bit = 0; bit < 8; bit += 1) {
    checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
  }

  return checksum >>> 0;
});
const visibleAlphaThreshold = 16;
const minimumVisiblePixelRatio = 0.01;
const minimumColorDynamicRange = 16;
const minimumColorStandardDeviation = 2;
// Current assets are 100% visible with max channel ranges 252-255 and max stddev 65.66-77.89.
const forbiddenTerms = ['智能结界', '结界'].map((text) => ({
  bytes: Buffer.from(text),
  text,
}));
const fixedManifestRoutes = [
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
const fixedManifestRoutePaths = new Set(fixedManifestRoutes.map((route) => route.routePath));
const routePathSchema = z.string().regex(/^\/$|^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/, {
  message: 'Route paths must be canonical absolute site paths',
});
const outputPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !path.posix.isAbsolute(value) &&
      !value.includes('\\') &&
      path.posix.normalize(value) === value &&
      value !== '.' &&
      !value.startsWith('../'),
    {
      message: 'Output paths must be normalized relative POSIX paths',
    },
  );
const manifestRouteSchema = z
  .object({
    routePath: routePathSchema,
    htmlPath: outputPathSchema.regex(/\.html$/),
    markdownPath: outputPathSchema.regex(/\.md$/),
    llms: z
      .object({
        txt: z.boolean(),
        full: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((route, context) => {
    const expectedHtmlPath = outputPathForRoute(route.routePath, 'html');
    const expectedMarkdownPath = outputPathForRoute(route.routePath, 'md');

    if (route.htmlPath !== expectedHtmlPath) {
      context.addIssue({
        code: 'custom',
        message: `HTML output path must match route path: ${expectedHtmlPath}`,
        path: ['htmlPath'],
      });
    }

    if (route.markdownPath !== expectedMarkdownPath) {
      context.addIssue({
        code: 'custom',
        message: `Markdown output path must match route path: ${expectedMarkdownPath}`,
        path: ['markdownPath'],
      });
    }
  });
const manifestProjectSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0 && value === value.trim(), {
        message: 'Project names must be non-blank without surrounding whitespace',
      }),
    externalUrl: z
      .string()
      .refine((value) => value === value.trim(), {
        message: 'Project external URLs must not include surrounding whitespace',
      })
      .superRefine((value, context) => {
        if (value !== value.trim()) {
          return;
        }

        let parsedUrl;

        try {
          parsedUrl = new URL(value);
        } catch {
          context.addIssue({
            code: 'custom',
            message: 'Project external URLs must be valid absolute URLs',
          });
          return;
        }

        if (parsedUrl.hostname.toLowerCase().replace(/\.$/, '') === 'thqllm.com') {
          context.addIssue({
            code: 'custom',
            message: 'Project external URLs must not use the site hostname',
          });
        }

        if (
          parsedUrl.protocol !== 'https:' ||
          parsedUrl.username ||
          parsedUrl.password ||
          parsedUrl.href !== value
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Project external URLs must be normalized safe HTTPS URLs off the site origin',
          });
        }
      }),
    order: z.number().int().nonnegative(),
    featured: z.boolean(),
    documented: z.boolean(),
  })
  .strict();
const projectBuildManifestSchema = z
  .object({
    schemaVersion: z.literal(expectedManifestSchemaVersion),
    siteOrigin: z.literal(expectedSiteOrigin),
    routes: z.array(manifestRouteSchema).nonempty(),
    projects: z.array(manifestProjectSchema).nonempty(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const routePaths = new Set();
    const htmlPaths = new Set();
    const markdownPaths = new Set();

    manifest.routes.forEach((route, index) => {
      for (const [value, values, field] of [
        [route.routePath, routePaths, 'routePath'],
        [route.htmlPath, htmlPaths, 'htmlPath'],
        [route.markdownPath, markdownPaths, 'markdownPath'],
      ]) {
        if (values.has(value)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate manifest ${field}: ${value}`,
            path: ['routes', index, field],
          });
        }

        values.add(value);
      }

      if (!fixedManifestRoutePaths.has(route.routePath) && !route.routePath.startsWith('/docs/')) {
        context.addIssue({
          code: 'custom',
          message: `Unsupported manifest route path: ${route.routePath}`,
          path: ['routes', index, 'routePath'],
        });
      }

      if (route.routePath.startsWith('/docs/') && (!route.llms.txt || !route.llms.full)) {
        context.addIssue({
          code: 'custom',
          message: 'Docs routes must appear in both llms outputs',
          path: ['routes', index, 'llms'],
        });
      }
    });

    for (const expectedRoute of fixedManifestRoutes) {
      const routeIndex = manifest.routes.findIndex(
        (route) => route.routePath === expectedRoute.routePath,
      );
      const route = manifest.routes[routeIndex];

      if (!route) {
        context.addIssue({
          code: 'custom',
          message: `Missing fixed manifest route: ${expectedRoute.routePath}`,
          path: ['routes'],
        });
        continue;
      }

      if (
        route.htmlPath !== expectedRoute.htmlPath ||
        route.markdownPath !== expectedRoute.markdownPath ||
        route.llms.txt !== expectedRoute.llms.txt ||
        route.llms.full !== expectedRoute.llms.full
      ) {
        context.addIssue({
          code: 'custom',
          message: `Fixed manifest route is ambiguous: ${expectedRoute.routePath}`,
          path: ['routes', routeIndex],
        });
      }
    }

    const projectIds = new Set();
    const projectNames = new Set();
    const projectUrls = new Set();
    const projectOrders = new Set();

    manifest.projects.forEach((project, index) => {
      for (const [value, values, field] of [
        [project.id, projectIds, 'id'],
        [project.name, projectNames, 'name'],
        [project.externalUrl, projectUrls, 'externalUrl'],
        [project.order, projectOrders, 'order'],
      ]) {
        if (values.has(value)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate manifest project ${field}: ${value}`,
            path: ['projects', index, field],
          });
        }

        values.add(value);
      }

      if (index > 0 && manifest.projects[index - 1].order >= project.order) {
        context.addIssue({
          code: 'custom',
          message: 'Manifest projects must be strictly sorted by order',
          path: ['projects', index, 'order'],
        });
      }
    });

    const docsRoutesByProjectId = new Map();

    manifest.routes.forEach((route, routeIndex) => {
      if (!route.routePath.startsWith('/docs/')) {
        return;
      }

      const projectId = route.routePath.split('/')[2];
      const project = manifest.projects.find((candidate) => candidate.id === projectId);

      if (!project) {
        context.addIssue({
          code: 'custom',
          message: `Docs route has no registered project: ${route.routePath}`,
          path: ['routes', routeIndex, 'routePath'],
        });
        return;
      }

      if (!project.documented) {
        context.addIssue({
          code: 'custom',
          message: `Undocumented project has a docs route: ${route.routePath}`,
          path: ['routes', routeIndex, 'routePath'],
        });
      }

      const projectRoutes = docsRoutesByProjectId.get(projectId) ?? [];
      projectRoutes.push(route.routePath);
      docsRoutesByProjectId.set(projectId, projectRoutes);
    });

    manifest.projects.forEach((project, projectIndex) => {
      const docsRoutes = docsRoutesByProjectId.get(project.id) ?? [];
      const docsIndexPath = `/docs/${project.id}/`;

      if (project.documented && !docsRoutes.includes(docsIndexPath)) {
        context.addIssue({
          code: 'custom',
          message: `Documented project is missing its docs index route: ${docsIndexPath}`,
          path: ['projects', projectIndex, 'documented'],
        });
      }

      if (!project.documented && docsRoutes.length > 0) {
        context.addIssue({
          code: 'custom',
          message: `Undocumented project must not expose docs routes: ${project.id}`,
          path: ['projects', projectIndex, 'documented'],
        });
      }
    });
  });

async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectHtmlFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(entryPath);
    }
  }

  return files;
}

function outputPathForRoute(routePath, extension) {
  const relativeRoutePath = routePath.slice(1);

  return routePath.endsWith('/')
    ? `${relativeRoutePath}index.${extension}`
    : `${relativeRoutePath}.${extension}`;
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function readProjectBuildManifest() {
  const manifestPath = path.join(buildDir, manifestFilename);
  let manifestStats;

  try {
    manifestStats = await lstat(manifestPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Missing project build manifest: ${manifestFilename}`);
    }

    throw new Error(
      `Could not inspect project build manifest ${manifestFilename}: ${describeError(error)}`,
    );
  }

  if (!manifestStats.isFile()) {
    throw new Error(`Project build manifest ${manifestFilename} is not a regular file.`);
  }

  const manifestText = await readFile(manifestPath, 'utf8');

  if (!manifestText.trim()) {
    throw new Error(`Project build manifest ${manifestFilename} is empty.`);
  }

  let manifestJson;

  try {
    manifestJson = JSON.parse(manifestText);
  } catch {
    throw new Error(`Project build manifest ${manifestFilename} contains invalid JSON.`);
  }

  const result = projectBuildManifestSchema.safeParse(manifestJson);

  if (!result.success) {
    const issue = result.error.issues[0];
    const issuePath = issue.path.length > 0 ? issue.path.join('.') : '<root>';

    throw new Error(`Invalid project build manifest at ${issuePath}: ${issue.message}`);
  }

  return result.data;
}

async function verifyRequiredOutput(relativePath) {
  const outputPath = path.join(buildDir, relativePath);
  let outputStats;

  try {
    outputStats = await lstat(outputPath);
  } catch {
    throw new Error(`Missing required static output: ${relativePath}`);
  }

  if (!outputStats.isFile()) {
    throw new Error(`Required static output is not a regular file: ${relativePath}`);
  }

  await access(outputPath);
}

async function readRequiredTextOutput(relativePath) {
  const content = await readFile(path.join(buildDir, relativePath), 'utf8');

  if (!content.trim()) {
    throw new Error(`Required static output is empty: ${relativePath}`);
  }

  return content;
}

function verifyExactRouteCollection(
  actualRoutes,
  expectedRoutes,
  { duplicateDescription, missingDescription, unexpectedDescription },
) {
  const routeCounts = new Map();

  for (const route of actualRoutes) {
    const count = (routeCounts.get(route) ?? 0) + 1;
    routeCounts.set(route, count);

    if (count > 1) {
      throw new Error(`${duplicateDescription}: ${route}`);
    }
  }

  const expectedRouteSet = new Set(expectedRoutes);

  for (const route of expectedRoutes) {
    if (!routeCounts.has(route)) {
      throw new Error(`${missingDescription}: ${route}`);
    }
  }

  for (const route of routeCounts.keys()) {
    if (!expectedRouteSet.has(route)) {
      throw new Error(`${unexpectedDescription}: ${route}`);
    }
  }
}

function verifySitemap(content, manifest) {
  let sitemapDom;

  try {
    sitemapDom = new JSDOM(content, {
      contentType: 'text/xml',
    });
  } catch (error) {
    throw new Error(`sitemap.xml is not valid XML. ${describeError(error)}`);
  }

  try {
    const document = sitemapDom.window.document;
    const parserError = document.querySelector('parsererror');

    if (parserError) {
      throw new Error(`sitemap.xml is not valid XML. ${parserError.textContent?.trim() ?? ''}`);
    }

    const root = document.documentElement;

    if (root.localName !== 'urlset') {
      throw new Error('sitemap.xml must have a urlset root element.');
    }

    if (root.namespaceURI !== sitemapNamespace) {
      throw new Error(`sitemap.xml must use namespace ${sitemapNamespace}.`);
    }

    const actualRoutes = [];

    for (const [index, child] of [...root.children].entries()) {
      if (child.localName !== 'url' || child.namespaceURI !== sitemapNamespace) {
        throw new Error(`sitemap.xml urlset direct child ${index + 1} must be a url element.`);
      }

      const urlChildren = [...child.children];

      for (const [childIndex, element] of urlChildren.entries()) {
        if (element.namespaceURI !== sitemapNamespace) {
          throw new Error(
            `sitemap.xml url element ${index + 1} child ${childIndex + 1} must use namespace ${sitemapNamespace}.`,
          );
        }

        if (!sitemapUrlChildNames.has(element.localName)) {
          throw new Error(
            `sitemap.xml url element ${index + 1} child ${childIndex + 1} is unsupported: ${element.localName}.`,
          );
        }

        if (element.children.length > 0) {
          throw new Error(
            `sitemap.xml url element ${index + 1} child ${childIndex + 1} (${element.localName}) must not contain nested elements.`,
          );
        }
      }

      const locElements = urlChildren.filter((element) => element.localName === 'loc');
      const loc = locElements[0]?.textContent?.trim() ?? '';

      if (locElements.length !== 1 || !loc) {
        throw new Error(
          `sitemap.xml url element ${index + 1} must contain exactly one direct non-empty loc.`,
        );
      }

      actualRoutes.push(loc);
    }

    const expectedRoutes = manifest.routes.map(
      (route) => new URL(route.routePath, `${manifest.siteOrigin}/`).href,
    );

    verifyExactRouteCollection(actualRoutes, expectedRoutes, {
      duplicateDescription: 'sitemap.xml contains duplicate route URL',
      missingDescription: 'sitemap.xml is missing route URL',
      unexpectedDescription: 'sitemap.xml contains unexpected route URL',
    });
  } finally {
    sitemapDom.window.close();
  }
}

function normalizeMarkdownRoute(value, manifest, source) {
  let url;

  try {
    url = new URL(value, `${manifest.siteOrigin}/`);
  } catch {
    throw new Error(`${source} contains an invalid Markdown route URL: ${value}`);
  }

  if (
    url.origin !== manifest.siteOrigin ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith('.md')
  ) {
    return undefined;
  }

  return url.pathname;
}

const markdownParser = unified().use(remarkParse);
const llmsFullParser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, [{ type: 'yaml', marker: '-', anywhere: true }]);

function collectMarkdownLinkDestinations(nodes) {
  const destinations = [];

  function visit(node) {
    if (node.type === 'link' && typeof node.url === 'string') {
      destinations.push(node.url);
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  }

  for (const node of nodes) {
    visit(node);
  }

  return destinations;
}

function parseMarkdownLinks(content, manifest) {
  const routes = [];
  const tree = markdownParser.parse(content);

  for (const href of collectMarkdownLinkDestinations(tree.children)) {
    const route = normalizeMarkdownRoute(href, manifest, 'llms.txt');

    if (route !== undefined) {
      routes.push(route);
    }
  }

  return routes;
}

function parseAbsoluteExternalMarkdownLinks(nodes, manifest) {
  const urls = [];

  for (const href of collectMarkdownLinkDestinations(nodes)) {
    let url;

    try {
      url = new URL(href);
    } catch {
      continue;
    }

    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.origin === manifest.siteOrigin
    ) {
      continue;
    }

    urls.push({
      href: url.href,
      safe:
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        url.origin !== manifest.siteOrigin,
    });
  }

  return urls;
}

function verifyLlmsTxt(content, manifest) {
  const actualRoutes = parseMarkdownLinks(content, manifest);
  const expectedRoutes = manifest.routes
    .filter((route) => route.llms.txt)
    .map((route) => `/${route.markdownPath}`);

  verifyExactRouteCollection(actualRoutes, expectedRoutes, {
    duplicateDescription: 'llms.txt contains duplicate Markdown route',
    missingDescription: 'llms.txt is missing Markdown route',
    unexpectedDescription: 'llms.txt contains unexpected Markdown route',
  });
}

function parseLlmsFullBlocks(content, manifest) {
  const tree = llmsFullParser.parse(content);
  const blocks = [];
  let currentBlock;
  let blockIndex = 0;

  for (const node of tree.children) {
    if (node.type !== 'yaml') {
      currentBlock?.nodes.push(node);
      continue;
    }

    if (currentBlock) {
      blocks.push(currentBlock);
    }

    blockIndex += 1;
    const document = parseDocument(node.value, { uniqueKeys: true });

    if (document.errors.length > 0) {
      throw new Error(
        `llms-full.txt frontmatter block ${blockIndex} contains invalid YAML: ${document.errors[0].message}`,
      );
    }

    const frontmatter = document.toJS();
    const urlValue =
      frontmatter &&
      typeof frontmatter === 'object' &&
      !Array.isArray(frontmatter) &&
      Object.hasOwn(frontmatter, 'url')
        ? frontmatter.url
        : undefined;

    if (typeof urlValue !== 'string') {
      throw new Error(
        `llms-full.txt frontmatter block ${blockIndex} must contain exactly one string url.`,
      );
    }

    const route = normalizeMarkdownRoute(urlValue, manifest, 'llms-full.txt');

    if (route === undefined) {
      throw new Error(
        `llms-full.txt frontmatter block ${blockIndex} has an invalid route URL: ${urlValue}`,
      );
    }

    currentBlock = {
      nodes: [],
      route,
    };
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function verifyLlmsFullTxt(content, manifest) {
  const blocks = parseLlmsFullBlocks(content, manifest);
  const actualRoutes = blocks.map((block) => block.route);
  const expectedRoutes = manifest.routes
    .filter((route) => route.llms.full)
    .map((route) => `/${route.markdownPath}`);

  verifyExactRouteCollection(actualRoutes, expectedRoutes, {
    duplicateDescription: 'llms-full.txt contains duplicate frontmatter route',
    missingDescription: 'llms-full.txt is missing frontmatter route',
    unexpectedDescription: 'llms-full.txt contains unexpected frontmatter route',
  });

  const projectsBlock = blocks.find((block) => block.route === '/projects/index.md');
  const projectExternalUrls = parseAbsoluteExternalMarkdownLinks(
    projectsBlock?.nodes ?? [],
    manifest,
  );
  const expectedProjectExternalUrls = manifest.projects.map((project) => project.externalUrl);
  const comparisonLength = Math.max(projectExternalUrls.length, expectedProjectExternalUrls.length);

  for (const [index, expectedProjectUrl] of expectedProjectExternalUrls.entries()) {
    if (
      !projectExternalUrls.some(
        (projectUrl) => projectUrl.safe && projectUrl.href === expectedProjectUrl,
      )
    ) {
      throw new Error(
        `llms-full.txt projects block is missing registered project external URL: ${expectedProjectUrl} at position ${index + 1}.`,
      );
    }
  }

  for (let index = 0; index < comparisonLength; index += 1) {
    const projectUrl = projectExternalUrls[index];
    const expectedProjectUrl = expectedProjectExternalUrls[index];
    const position = index + 1;

    if (!projectUrl) {
      throw new Error(
        `llms-full.txt projects block is missing registered project external URL: ${expectedProjectUrl} at position ${position}.`,
      );
    }

    if (!projectUrl.safe) {
      throw new Error(
        `llms-full.txt projects block contains unsafe external URL: ${projectUrl.href} at position ${position}.`,
      );
    }

    if (!expectedProjectUrl) {
      throw new Error(
        `llms-full.txt projects block contains unexpected external URL: ${projectUrl.href} at position ${position}.`,
      );
    }

    if (projectUrl.href !== expectedProjectUrl) {
      throw new Error(
        `llms-full.txt projects block external URL order mismatch at position ${position}: found ${projectUrl.href}; expected ${expectedProjectUrl}.`,
      );
    }
  }
}

function isHiddenWithinProjectCard(element, projectCard) {
  let current = element;

  while (current) {
    const ariaHidden = current.getAttribute('aria-hidden')?.trim().toLowerCase() === 'true';
    const display = current.style.display.trim().toLowerCase();
    const visibility = current.style.visibility.trim().toLowerCase();

    if (
      current.hasAttribute('hidden') ||
      ariaHidden ||
      display === 'none' ||
      visibility === 'hidden'
    ) {
      return true;
    }

    if (current === projectCard) {
      break;
    }

    current = current.parentElement;
  }

  return false;
}

function readProjectCards(document, sourcePath, manifest) {
  const projectsSection = document.querySelector('section#projects');

  if (!projectsSection) {
    throw new Error(`${sourcePath} is missing section#projects.`);
  }

  const projectCards = [...projectsSection.querySelectorAll('[data-testid="project-stage"]')];
  const cards = [];
  const names = new Set();
  const externalUrls = new Set();

  for (const [index, projectCard] of projectCards.entries()) {
    const projectNameText = projectCard.querySelector('h3')?.textContent ?? '';
    const projectName = projectNameText.trim();

    if (!projectName) {
      throw new Error(
        `${sourcePath} project card ${index + 1} must have a non-empty project name.`,
      );
    }

    if (projectNameText !== projectName) {
      throw new Error(
        `${sourcePath} project card ${index + 1} name must not include surrounding whitespace.`,
      );
    }

    if (names.has(projectName)) {
      throw new Error(`${sourcePath} contains duplicate project card name: ${projectName}`);
    }

    const markedExternalLinks = [...projectCard.querySelectorAll('a[data-project-external-link]')];

    if (markedExternalLinks.length !== 1) {
      throw new Error(
        `${sourcePath} project card for ${projectName} must contain exactly one [data-project-external-link].`,
      );
    }

    const externalLink = markedExternalLinks[0];
    const externalHref = externalLink.getAttribute('href');
    let externalUrl;

    try {
      externalUrl = externalHref ? new URL(externalHref, `${manifest.siteOrigin}/`) : undefined;
    } catch {
      externalUrl = undefined;
    }

    const relTokens = new Set(
      (externalLink.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean),
    );
    const hasSafeExternalLink =
      externalUrl?.protocol === 'https:' &&
      !externalUrl.username &&
      !externalUrl.password &&
      externalUrl.origin !== manifest.siteOrigin &&
      externalLink.getAttribute('target') === '_blank' &&
      relTokens.has('noreferrer') &&
      relTokens.has('noopener');

    if (!hasSafeExternalLink) {
      throw new Error(
        `${sourcePath} project card for ${projectName} must include exactly one safe HTTPS external link.`,
      );
    }

    const links = [...projectCard.querySelectorAll('a')];
    const parsedLinks = [];

    for (const link of links) {
      const href = link.getAttribute('href');
      let url;

      try {
        url = href ? new URL(href, `${manifest.siteOrigin}/`) : undefined;
      } catch {
        url = undefined;
      }

      if (!url) {
        throw new Error(
          `${sourcePath} project card for ${projectName} contains an invalid link URL: ${href}`,
        );
      }

      if (url.protocol !== 'https:') {
        throw new Error(
          `${sourcePath} project card for ${projectName} contains unsafe link protocol: ${url.protocol}`,
        );
      }

      if (url.username || url.password) {
        throw new Error(`${sourcePath} project card for ${projectName} contains link credentials.`);
      }

      if (url.origin !== manifest.siteOrigin && link !== externalLink) {
        throw new Error(
          `${sourcePath} project card for ${projectName} must include exactly one safe HTTPS external link.`,
        );
      }

      parsedLinks.push({ link, url });
    }

    if (isHiddenWithinProjectCard(externalLink, projectCard)) {
      throw new Error(
        `${sourcePath} project card for ${projectName} marked external link must be visible.`,
      );
    }

    if (
      externalLink.textContent?.trim() !== '进入项目' ||
      externalLink.getAttribute('aria-label') !== `进入 ${projectName}`
    ) {
      throw new Error(
        `${sourcePath} project card for ${projectName} marked external link must use the production main action.`,
      );
    }

    const registeredProject = manifest.projects.find((project) => project.name === projectName);
    const expectedLinkCount = registeredProject?.documented ? 2 : 1;

    if (links.length !== expectedLinkCount) {
      const linkLabel = expectedLinkCount === 1 ? 'link' : 'links';

      throw new Error(
        `${sourcePath} project card for ${projectName} must contain exactly ${expectedLinkCount} allowed ${linkLabel}; found ${links.length}.`,
      );
    }

    if (registeredProject?.documented) {
      const docsLink = parsedLinks.find(({ link }) => link !== externalLink);
      const expectedDocsPath = `/docs/${registeredProject.id}/`;
      const expectedDocsUrl = new URL(expectedDocsPath, `${manifest.siteOrigin}/`).href;

      if (docsLink?.url.href !== expectedDocsUrl) {
        throw new Error(
          `${sourcePath} project card for ${projectName} docs link must target ${expectedDocsPath}.`,
        );
      }
    }

    const normalizedExternalUrl = externalUrl.href;

    if (externalUrls.has(normalizedExternalUrl)) {
      throw new Error(
        `${sourcePath} contains duplicate project card external URL: ${normalizedExternalUrl}`,
      );
    }

    names.add(projectName);
    externalUrls.add(normalizedExternalUrl);
    cards.push({ name: projectName, externalUrl: normalizedExternalUrl });
  }

  return cards;
}

function verifyProjectCards(document, expectedProjects, sourcePath, manifest) {
  const actualProjects = readProjectCards(document, sourcePath, manifest);
  const expectedNames = new Set(expectedProjects.map((project) => project.name));
  const actualNames = new Set(actualProjects.map((project) => project.name));

  for (const project of actualProjects) {
    if (!expectedNames.has(project.name)) {
      throw new Error(
        `${sourcePath} section#projects has unexpected project card: ${project.name}`,
      );
    }
  }

  for (const project of expectedProjects) {
    if (!actualNames.has(project.name)) {
      throw new Error(`${sourcePath} section#projects is missing project card: ${project.name}`);
    }
  }

  const actualOrder = actualProjects.map((project) => project.name);
  const expectedOrder = expectedProjects.map((project) => project.name);

  if (
    actualOrder.length !== expectedOrder.length ||
    actualOrder.some((name, index) => name !== expectedOrder[index])
  ) {
    throw new Error(
      `${sourcePath} section#projects project card order does not match the manifest.`,
    );
  }

  actualProjects.forEach((project, index) => {
    const expectedProject = expectedProjects[index];

    if (project.externalUrl !== expectedProject.externalUrl) {
      throw new Error(
        `${sourcePath} project card for ${project.name} has external URL ${project.externalUrl}; expected ${expectedProject.externalUrl}.`,
      );
    }
  });
}

async function readCriticalAsset(relativePath) {
  const assetPath = path.join(buildDir, relativePath);
  let assetStats;

  try {
    assetStats = await lstat(assetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Missing critical asset: ${relativePath}`);
    }

    throw new Error(`Could not inspect critical asset ${relativePath}: ${describeError(error)}`);
  }

  if (!assetStats.isFile()) {
    throw new Error(`Critical asset ${relativePath} is not a regular file.`);
  }

  if (assetStats.size === 0) {
    throw new Error(`Critical asset ${relativePath} is empty.`);
  }

  try {
    return await readFile(assetPath);
  } catch (error) {
    throw new Error(`Could not read critical asset ${relativePath}: ${describeError(error)}`);
  }
}

function createMalformedPngError(relativePath, reason) {
  return new Error(`Critical image ${relativePath} is malformed PNG: ${reason}`);
}

function calculatePngCrc32(bytes) {
  let checksum = 0xffffffff;

  for (const byte of bytes) {
    checksum = pngCrc32Table[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }

  return (checksum ^ 0xffffffff) >>> 0;
}

function parsePngStructure(imageBytes, relativePath) {
  if (
    imageBytes.length < pngSignature.length ||
    !imageBytes.subarray(0, pngSignature.length).equals(pngSignature)
  ) {
    throw createMalformedPngError(relativePath, 'invalid PNG signature.');
  }

  let offset = pngSignature.length;
  let chunkIndex = 0;
  let hasAnimationControl = false;
  let hasHeader = false;
  let hasImageData = false;
  let hasEnd = false;

  while (offset < imageBytes.length) {
    const chunkOffset = offset;

    if (imageBytes.length - offset < 12) {
      throw createMalformedPngError(
        relativePath,
        `incomplete chunk header or CRC at byte ${chunkOffset}.`,
      );
    }

    const dataLength = imageBytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + dataLength;
    const chunkEnd = dataEnd + 4;
    const typeBytes = imageBytes.subarray(typeStart, typeStart + 4);
    const chunkType = typeBytes.toString('latin1');

    if (chunkEnd > imageBytes.length) {
      throw createMalformedPngError(
        relativePath,
        `chunk ${chunkType} at byte ${chunkOffset} exceeds file bounds.`,
      );
    }

    const hasValidChunkType = [...typeBytes].every(
      (byte) => (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a),
    );

    if (!hasValidChunkType) {
      throw createMalformedPngError(
        relativePath,
        `chunk type at byte ${chunkOffset} must contain four ASCII letters; found ${chunkType}.`,
      );
    }

    if (typeBytes[2] >= 0x61 && typeBytes[2] <= 0x7a) {
      throw createMalformedPngError(
        relativePath,
        `chunk ${chunkType} at byte ${chunkOffset} must use an uppercase reserved type byte.`,
      );
    }

    const storedCrc = imageBytes.readUInt32BE(dataEnd);
    const calculatedCrc = calculatePngCrc32(imageBytes.subarray(typeStart, dataEnd));

    if (storedCrc !== calculatedCrc) {
      throw createMalformedPngError(
        relativePath,
        `chunk ${chunkType} at byte ${chunkOffset} has an invalid CRC.`,
      );
    }

    if (chunkIndex === 0 && chunkType !== 'IHDR') {
      throw createMalformedPngError(relativePath, `first chunk must be IHDR; found ${chunkType}.`);
    }

    if (chunkType === 'IHDR') {
      if (hasHeader) {
        throw createMalformedPngError(relativePath, 'must contain exactly one IHDR chunk.');
      }

      if (dataLength !== 13) {
        throw createMalformedPngError(
          relativePath,
          `IHDR chunk must have length 13; found ${dataLength}.`,
        );
      }

      hasHeader = true;
    }

    if (chunkType === 'IDAT') {
      hasImageData = true;
    }

    if (chunkType === 'acTL') {
      hasAnimationControl = true;
    }

    if (chunkType === 'IEND') {
      if (dataLength !== 0) {
        throw createMalformedPngError(
          relativePath,
          `IEND chunk must have length 0; found ${dataLength}.`,
        );
      }

      hasEnd = true;

      if (chunkEnd !== imageBytes.length) {
        throw createMalformedPngError(
          relativePath,
          'IEND chunk must be the final bytes in the file.',
        );
      }

      offset = chunkEnd;
      break;
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }

  if (!hasHeader) {
    throw createMalformedPngError(relativePath, 'missing IHDR chunk.');
  }

  if (!hasImageData) {
    throw createMalformedPngError(relativePath, 'missing IDAT chunk.');
  }

  if (!hasEnd) {
    throw createMalformedPngError(relativePath, 'missing IEND chunk.');
  }

  return { hasAnimationControl };
}

async function verifyCriticalImage(imageBytes, expectedImage) {
  const hasPngSignature =
    imageBytes.length >= pngSignature.length &&
    imageBytes.subarray(0, pngSignature.length).equals(pngSignature);
  const pngStructure =
    expectedImage.format === 'png' && hasPngSignature
      ? parsePngStructure(imageBytes, expectedImage.relativePath)
      : undefined;
  let metadata;

  try {
    metadata = await sharp(imageBytes, { failOn: 'warning' }).metadata();
  } catch (error) {
    if (expectedImage.format === 'png' && !hasPngSignature) {
      throw createMalformedPngError(expectedImage.relativePath, 'invalid PNG signature.');
    }

    throw new Error(
      `Critical image ${expectedImage.relativePath} has invalid image metadata: ${describeError(error)}`,
    );
  }

  if (metadata.format !== expectedImage.format) {
    throw new Error(
      `Critical image ${expectedImage.relativePath} must be ${expectedImage.formatLabel}; found ${metadata.format ?? 'unknown'}.`,
    );
  }

  if (expectedImage.format === 'png') {
    const verifiedPngStructure =
      pngStructure ?? parsePngStructure(imageBytes, expectedImage.relativePath);

    if (verifiedPngStructure.hasAnimationControl) {
      throw new Error(
        `Critical image ${expectedImage.relativePath} must be static; animated PNG contains an acTL chunk.`,
      );
    }
  }

  const pageCount = metadata.pages ?? 1;

  if (pageCount !== 1) {
    throw new Error(
      `Critical image ${expectedImage.relativePath} must contain exactly one frame; found ${pageCount}.`,
    );
  }

  if (metadata.width !== expectedImage.width || metadata.height !== expectedImage.height) {
    throw new Error(
      `Critical image ${expectedImage.relativePath} must be ${expectedImage.width}x${expectedImage.height}; found ${metadata.width ?? 'unknown'}x${metadata.height ?? 'unknown'}.`,
    );
  }

  let decodedImage;

  try {
    decodedImage = await sharp(imageBytes, { failOn: 'warning' })
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw new Error(
      `Critical image ${expectedImage.relativePath} cannot be fully decoded. ${describeError(error)}`,
    );
  }

  const { data, info } = decodedImage;
  const channels = info.channels;
  const alphaChannel = metadata.hasAlpha ? channels - 1 : -1;
  const colorChannels = alphaChannel === -1 ? channels : alphaChannel;
  const totalPixels = data.length / channels;
  const minima = Array(colorChannels).fill(255);
  const maxima = Array(colorChannels).fill(0);
  const means = Array(colorChannels).fill(0);
  const squaredDifferences = Array(colorChannels).fill(0);
  let visiblePixels = 0;

  for (let offset = 0; offset < data.length; offset += channels) {
    if (alphaChannel !== -1 && data[offset + alphaChannel] < visibleAlphaThreshold) {
      continue;
    }

    visiblePixels += 1;

    for (let channel = 0; channel < colorChannels; channel += 1) {
      const value = data[offset + channel];
      minima[channel] = Math.min(minima[channel], value);
      maxima[channel] = Math.max(maxima[channel], value);
      const delta = value - means[channel];
      means[channel] += delta / visiblePixels;
      squaredDifferences[channel] += delta * (value - means[channel]);
    }
  }

  const visiblePixelRatio = visiblePixels / totalPixels;

  if (visiblePixelRatio < minimumVisiblePixelRatio) {
    throw new Error(
      `Critical image ${expectedImage.relativePath} has insufficient visible pixels: ${(visiblePixelRatio * 100).toFixed(4)}% is below ${(minimumVisiblePixelRatio * 100).toFixed(2)}% at alpha >= ${visibleAlphaThreshold}.`,
    );
  }

  const channelRanges = maxima.map((maximum, index) => maximum - minima[index]);
  const channelStandardDeviations = squaredDifferences.map((sum) => Math.sqrt(sum / visiblePixels));
  const maximumRange = Math.max(...channelRanges);
  const maximumStandardDeviation = Math.max(...channelStandardDeviations);

  if (maximumRange === 0 && maximumStandardDeviation === 0) {
    throw new Error(
      `Critical image ${expectedImage.relativePath} must not be a solid-color or blank image.`,
    );
  }

  if (
    maximumRange < minimumColorDynamicRange ||
    maximumStandardDeviation < minimumColorStandardDeviation
  ) {
    throw new Error(
      `Critical image ${expectedImage.relativePath} has insufficient visible color variation: max range ${maximumRange.toFixed(2)} (minimum ${minimumColorDynamicRange}), max stddev ${maximumStandardDeviation.toFixed(4)} (minimum ${minimumColorStandardDeviation}).`,
    );
  }
}

function verifyFavicon(svgBytes) {
  let svgDom;

  try {
    svgDom = new JSDOM(svgBytes.toString('utf8'), {
      contentType: 'image/svg+xml',
    });
  } catch (error) {
    throw new Error(`Critical asset favicon.svg is not valid SVG XML. ${describeError(error)}`);
  }

  try {
    const rootElement = svgDom.window.document.documentElement;

    if (rootElement.localName !== 'svg') {
      throw new Error('Critical asset favicon.svg must have an svg root element.');
    }

    if (rootElement.namespaceURI !== svgNamespace) {
      throw new Error(
        `Critical asset favicon.svg must use namespace ${svgNamespace}; found ${rootElement.namespaceURI ?? 'none'}.`,
      );
    }

    const viewBoxMatch = (rootElement.getAttribute('viewBox') ?? '').match(svgViewBoxPattern);
    const viewBoxValues = viewBoxMatch?.slice(1).map(Number) ?? [];
    const hasValidViewBox =
      viewBoxValues.length === 4 &&
      viewBoxValues.every(Number.isFinite) &&
      viewBoxValues[2] > 0 &&
      viewBoxValues[3] > 0;

    if (!hasValidViewBox) {
      throw new Error('Critical asset favicon.svg must have a valid viewBox.');
    }
  } finally {
    svgDom.window.close();
  }
}

function parseRobots(robotsBytes) {
  const groups = [];
  const sitemaps = [];
  let currentGroup;

  const finishGroup = () => {
    if (currentGroup?.userAgents.length) {
      groups.push(currentGroup);
    }

    currentGroup = undefined;
  };

  for (const rawLine of robotsBytes.toString('utf8').split(/\r\n|\r|\n/)) {
    if (!rawLine.trim()) {
      continue;
    }

    const line = rawLine.split('#', 1)[0].trim();

    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const directive = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (directive === 'sitemap') {
      sitemaps.push(value);
      continue;
    }

    if (directive === 'user-agent') {
      if (!currentGroup || currentGroup.rules.length > 0) {
        finishGroup();
        currentGroup = {
          rules: [],
          userAgents: [],
        };
      }

      currentGroup.userAgents.push(value.toLowerCase());
      continue;
    }

    if (currentGroup?.userAgents.length) {
      currentGroup.rules.push({ directive, value });
    }
  }

  finishGroup();

  return { groups, sitemaps };
}

function verifyRobots(robotsBytes) {
  const { groups, sitemaps } = parseRobots(robotsBytes);

  if (!sitemaps.includes(canonicalSitemapUrl)) {
    throw new Error(`robots.txt is missing required directive: Sitemap: ${canonicalSitemapUrl}`);
  }

  const wildcardGroups = groups.filter(({ userAgents }) => userAgents.includes('*'));

  if (wildcardGroups.length === 0) {
    throw new Error('robots.txt is missing a User-agent: * group.');
  }

  for (const [index, group] of wildcardGroups.entries()) {
    const hasRootAllow = group.rules.some(
      ({ directive, value }) => directive === 'allow' && value === '/',
    );
    const nonEmptyDisallow = group.rules.find(
      ({ directive, value }) => directive === 'disallow' && value !== '',
    );
    const groupNumber = index + 1;

    if (nonEmptyDisallow) {
      throw new Error(
        `robots.txt wildcard group ${groupNumber} must not contain non-empty Disallow: ${nonEmptyDisallow.value}.`,
      );
    }

    if (!hasRootAllow) {
      throw new Error(`robots.txt wildcard group ${groupNumber} must include Allow: /.`);
    }
  }
}

function requireExactlyOne(elements, description) {
  if (elements.length !== 1) {
    throw new Error(`doc_build/index.html ${description}; found ${elements.length}.`);
  }

  return elements[0];
}

function directChildrenByTagName(element, tagName) {
  return [...element.children].filter((child) => child.localName === tagName);
}

function parseSrcsetCandidates(srcset) {
  const normalizedSrcset = srcset.replace(/^[ \t\n\f\r]+|[ \t\n\f\r]+$/g, '');

  if (!normalizedSrcset) {
    return [];
  }

  return normalizedSrcset.split(',').map((rawCandidate) => {
    const trimmedCandidate = rawCandidate.replace(/^[ \t\n\f\r]+|[ \t\n\f\r]+$/g, '');
    const tokens = trimmedCandidate.split(/[ \t\n\f\r]+/);
    const [url, descriptor] = tokens;

    if (!url || tokens.length > 2) {
      return {
        descriptor,
        isValid: false,
        rawCandidate,
        url,
      };
    }

    if (!descriptor) {
      return {
        density: 1,
        descriptor: undefined,
        isValid: true,
        rawCandidate,
        url,
      };
    }

    const densityMatch = descriptor.match(srcsetDensityPattern);
    const density = densityMatch ? Number(densityMatch[1]) : Number.NaN;

    return {
      density,
      descriptor,
      isValid: Number.isFinite(density) && density > 0,
      rawCandidate,
      url,
    };
  });
}

function verifyHomepageAssetReferences(document) {
  const headOgImages = [...document.head.querySelectorAll('meta[property="og:image"]')];

  if (headOgImages.length === 0) {
    throw new Error(
      `doc_build/index.html is missing exact OG image reference: ${expectedHomepageReferences.ogImage}`,
    );
  }

  const headOgImage = requireExactlyOne(
    headOgImages,
    'must contain exactly one head OG image meta',
  );

  if (headOgImage.getAttribute('content') !== expectedHomepageReferences.ogImage) {
    throw new Error(
      `doc_build/index.html is missing exact OG image reference: ${expectedHomepageReferences.ogImage}; found ${headOgImage.getAttribute('content') ?? 'missing'}.`,
    );
  }

  const headIcons = [...document.head.querySelectorAll('link[rel~="icon"]')];

  if (headIcons.length === 0) {
    throw new Error(
      `doc_build/index.html is missing exact favicon reference: ${expectedHomepageReferences.favicon}`,
    );
  }

  const headIcon = requireExactlyOne(headIcons, 'must contain exactly one head icon link');

  if (headIcon.getAttribute('href') !== expectedHomepageReferences.favicon) {
    throw new Error(
      `doc_build/index.html is missing exact favicon reference: ${expectedHomepageReferences.favicon}; found ${headIcon.getAttribute('href') ?? 'missing'}.`,
    );
  }

  const heroSection = requireExactlyOne(
    [...document.querySelectorAll('section[data-danmaku-root]')],
    'must contain exactly one section[data-danmaku-root]',
  );
  const heroPicture = requireExactlyOne(
    directChildrenByTagName(heroSection, 'picture'),
    'hero section must contain exactly one direct picture',
  );
  const desktopImages = directChildrenByTagName(heroPicture, 'img');

  if (desktopImages.length === 0) {
    throw new Error(
      `doc_build/index.html is missing exact desktop hero image reference: ${expectedHomepageReferences.desktopHero}`,
    );
  }

  const desktopImage = requireExactlyOne(
    desktopImages,
    'hero picture must contain exactly one direct desktop img',
  );

  if (desktopImage.getAttribute('src') !== expectedHomepageReferences.desktopHero) {
    throw new Error(
      `doc_build/index.html is missing exact desktop hero image reference: ${expectedHomepageReferences.desktopHero}; found ${desktopImage.getAttribute('src') ?? 'missing'}.`,
    );
  }

  if ((desktopImage.getAttribute('srcset') ?? '').trim()) {
    throw new Error('doc_build/index.html desktop hero img must not define a non-empty srcset.');
  }

  if ((desktopImage.getAttribute('sizes') ?? '').trim()) {
    throw new Error('doc_build/index.html desktop hero img must not define non-empty sizes.');
  }

  const mobileSources = directChildrenByTagName(heroPicture, 'source');

  if (mobileSources.length === 0) {
    throw new Error(
      `doc_build/index.html is missing exact mobile hero source reference: ${expectedHomepageReferences.mobileHero}`,
    );
  }

  const mobileSource = requireExactlyOne(
    mobileSources,
    'hero picture must contain exactly one direct mobile source',
  );
  const mobileMedia = mobileSource.getAttribute('media');

  if (mobileMedia !== expectedHomepageReferences.mobileHeroMedia) {
    throw new Error(
      `doc_build/index.html mobile hero source must use media ${expectedHomepageReferences.mobileHeroMedia}; found ${mobileMedia ?? 'missing'}.`,
    );
  }

  const mobileType = mobileSource.getAttribute('type');

  if (mobileType !== null && mobileType !== 'image/webp') {
    throw new Error(
      `doc_build/index.html mobile hero source type must be absent or image/webp; found ${mobileType}.`,
    );
  }

  const pictureChildren = [...heroPicture.children];

  if (pictureChildren.indexOf(mobileSource) > pictureChildren.indexOf(desktopImage)) {
    throw new Error(
      'doc_build/index.html mobile hero source must appear before the desktop fallback img.',
    );
  }

  const mobileCandidates = parseSrcsetCandidates(mobileSource.getAttribute('srcset') ?? '');

  if (mobileCandidates.length !== 1) {
    throw new Error(
      `doc_build/index.html mobile hero source srcset must contain exactly one candidate; found ${mobileCandidates.length}.`,
    );
  }

  const [mobileCandidate] = mobileCandidates;

  if (!mobileCandidate.isValid) {
    throw new Error(
      `doc_build/index.html mobile hero source srcset has invalid candidate syntax: ${mobileCandidate.rawCandidate.trim() || 'empty'}.`,
    );
  }

  if (mobileCandidate.density !== 1) {
    throw new Error(
      `doc_build/index.html mobile hero source descriptor must be absent or 1x; found ${mobileCandidate.descriptor}.`,
    );
  }

  if (mobileCandidate.url !== expectedHomepageReferences.mobileHero) {
    throw new Error(
      `doc_build/index.html is missing exact mobile hero source reference: ${expectedHomepageReferences.mobileHero}; found ${mobileCandidate.url ?? 'missing'}.`,
    );
  }
}

const manifest = await readProjectBuildManifest();
const requiredOutputs = [
  ...manifest.routes.flatMap((route) => [route.htmlPath, route.markdownPath]),
  ...fixedRequiredOutputs,
];

for (const output of requiredOutputs) {
  await verifyRequiredOutput(output);
}

const sitemap = await readRequiredTextOutput('sitemap.xml');
const llmsTxt = await readRequiredTextOutput('llms.txt');
const llmsFullTxt = await readRequiredTextOutput('llms-full.txt');

verifySitemap(sitemap, manifest);
verifyLlmsTxt(llmsTxt, manifest);
verifyLlmsFullTxt(llmsFullTxt, manifest);

const criticalAssets = new Map();

for (const relativePath of criticalAssetPaths) {
  criticalAssets.set(relativePath, await readCriticalAsset(relativePath));
}

for (const expectedImage of criticalImages) {
  await verifyCriticalImage(criticalAssets.get(expectedImage.relativePath), expectedImage);
}

verifyFavicon(criticalAssets.get('favicon.svg'));
verifyRobots(criticalAssets.get('robots.txt'));

const homepagePath = path.join(buildDir, 'index.html');
const projectsDirectoryPath = path.join(buildDir, 'projects/index.html');
let homepageDom;
let projectsDirectoryDom;

try {
  for (const htmlFile of await collectHtmlFiles(buildDir)) {
    const htmlBytes = await readFile(htmlFile);
    const relativePath = path.relative(repoRoot, htmlFile);
    const rawForbiddenTerm = forbiddenTerms.find(({ bytes }) => htmlBytes.includes(bytes));

    if (rawForbiddenTerm) {
      throw new Error(
        `Forbidden term "${rawForbiddenTerm.text}" found in ${relativePath} source HTML.`,
      );
    }

    const html = htmlBytes.toString('utf8');
    const dom = new JSDOM(html);
    let keepDom = false;

    try {
      const decodedText = dom.window.document.documentElement.textContent ?? '';
      const decodedForbiddenTerm = forbiddenTerms.find(({ text }) => decodedText.includes(text));

      if (decodedForbiddenTerm) {
        throw new Error(
          `Forbidden term "${decodedForbiddenTerm.text}" found in decoded text of ${relativePath}.`,
        );
      }

      if (htmlFile === homepagePath) {
        homepageDom = dom;
        keepDom = true;
      } else if (htmlFile === projectsDirectoryPath) {
        projectsDirectoryDom = dom;
        keepDom = true;
      }
    } finally {
      if (!keepDom) {
        dom.window.close();
      }
    }
  }

  const homepageDocument = homepageDom?.window.document;
  const projectsDirectoryDocument = projectsDirectoryDom?.window.document;

  if (!homepageDocument) {
    throw new Error('doc_build/index.html could not be parsed.');
  }

  if (!projectsDirectoryDocument) {
    throw new Error('doc_build/projects/index.html could not be parsed.');
  }

  verifyHomepageAssetReferences(homepageDocument);
  verifyProjectCards(
    homepageDocument,
    manifest.projects.filter((project) => project.featured),
    'doc_build/index.html',
    manifest,
  );
  verifyProjectCards(
    projectsDirectoryDocument,
    manifest.projects,
    'doc_build/projects/index.html',
    manifest,
  );
} finally {
  homepageDom?.window.close();
  projectsDirectoryDom?.window.close();
}

console.log(
  `Verified ${requiredOutputs.length} static outputs from ${manifestFilename} and site copy.`,
);
