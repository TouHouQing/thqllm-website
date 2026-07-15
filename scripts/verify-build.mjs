import { access, lstat, readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const buildDir = path.join(repoRoot, 'doc_build');
const siteUrl = new URL('https://thqllm.com/');
const requiredOutputs = [
  'index.html',
  '404.html',
  'projects/index.html',
  'notes/index.html',
  'about/index.html',
  'docs/fluctgraph/index.html',
  'docs/thq-api/index.html',
  'docs/toho-image-studio/index.html',
  'sitemap.xml',
  'llms.txt',
  'llms-full.txt',
];
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
const requiredRobotsDirectives = [
  'User-agent: *',
  'Allow: /',
  'Sitemap: https://thqllm.com/sitemap.xml',
];
const expectedHomepageReferences = {
  desktopHero: '/assets/hero/thqllm-title-desktop.webp',
  favicon: '/favicon.svg',
  mobileHero: '/assets/hero/thqllm-title-mobile.webp',
  mobileHeroMedia: '(max-width: 640px)',
  ogImage: 'https://thqllm.com/og-cover.png',
};
const forbiddenTerms = ['智能结界', '结界'].map((text) => ({
  bytes: Buffer.from(text),
  text,
}));

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

function assertIncludes(content, expected, source) {
  if (!content.includes(expected)) {
    throw new Error(`${source} is missing required text: ${expected}`);
  }
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
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

async function verifyCriticalImage(imageBytes, expectedImage) {
  let metadata;

  try {
    metadata = await sharp(imageBytes, { failOn: 'warning' }).metadata();
  } catch (error) {
    throw new Error(
      `Critical image ${expectedImage.relativePath} has invalid image metadata: ${describeError(error)}`,
    );
  }

  if (metadata.format !== expectedImage.format) {
    throw new Error(
      `Critical image ${expectedImage.relativePath} must be ${expectedImage.formatLabel}; found ${metadata.format ?? 'unknown'}.`,
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
  let hasPixelVariation = false;

  for (let index = channels; index < data.length; index += 1) {
    if (data[index] !== data[index % channels]) {
      hasPixelVariation = true;
      break;
    }
  }

  let hasVisiblePixel = !metadata.hasAlpha;

  if (metadata.hasAlpha) {
    for (let index = channels - 1; index < data.length; index += channels) {
      if (data[index] !== 0) {
        hasVisiblePixel = true;
        break;
      }
    }
  }

  if (!hasPixelVariation || !hasVisiblePixel) {
    throw new Error(
      `Critical image ${expectedImage.relativePath} must not be a solid-color or blank image.`,
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

  const rootElement = svgDom.window.document.documentElement;

  if (rootElement.localName !== 'svg') {
    svgDom.window.close();
    throw new Error('Critical asset favicon.svg must have an svg root element.');
  }

  const viewBoxValues = (rootElement.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const hasValidViewBox =
    viewBoxValues.length === 4 &&
    viewBoxValues.every(Number.isFinite) &&
    viewBoxValues[2] > 0 &&
    viewBoxValues[3] > 0;

  svgDom.window.close();

  if (!hasValidViewBox) {
    throw new Error('Critical asset favicon.svg must have a valid viewBox.');
  }
}

function verifyRobots(robotsBytes) {
  const directives = new Set(
    robotsBytes
      .toString('utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );

  for (const directive of requiredRobotsDirectives) {
    if (!directives.has(directive)) {
      throw new Error(`robots.txt is missing required directive: ${directive}`);
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

  if (mobileSource.getAttribute('srcset') !== expectedHomepageReferences.mobileHero) {
    throw new Error(
      `doc_build/index.html is missing exact mobile hero source reference: ${expectedHomepageReferences.mobileHero}; found ${mobileSource.getAttribute('srcset') ?? 'missing'}.`,
    );
  }
}

for (const output of requiredOutputs) {
  const outputPath = path.join(buildDir, output);
  let outputStats;

  try {
    outputStats = await lstat(outputPath);
  } catch {
    throw new Error(`Missing required static output: ${output}`);
  }

  if (!outputStats.isFile()) {
    throw new Error(`Required static output is not a regular file: ${output}`);
  }

  await access(outputPath);
}

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
let homepageDom;

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
  const decodedText = dom.window.document.documentElement.textContent ?? '';
  const decodedForbiddenTerm = forbiddenTerms.find(({ text }) => decodedText.includes(text));

  if (decodedForbiddenTerm) {
    throw new Error(
      `Forbidden term "${decodedForbiddenTerm.text}" found in decoded text of ${relativePath}.`,
    );
  }

  if (htmlFile === homepagePath) {
    homepageDom = dom;
  } else {
    dom.window.close();
  }
}

const homepageDocument = homepageDom?.window.document;

if (!homepageDocument) {
  throw new Error('doc_build/index.html could not be parsed.');
}

verifyHomepageAssetReferences(homepageDocument);

const projectsSection = homepageDocument.querySelector('section#projects');
if (!projectsSection) {
  throw new Error('doc_build/index.html is missing section#projects.');
}

const projectStages = [...projectsSection.querySelectorAll('[data-testid="project-stage"]')];
const expectedProjects = [
  ['FluctGraph', 'https://graph.tohoqing.com/'],
  ['THQ API', 'https://sub.thqllm.com/'],
  ['Toho Image Studio', 'https://img.tohoqing.com/'],
];
const projectStagesByName = new Map();
const projectExternalUrls = new Set();

for (const [index, projectStage] of projectStages.entries()) {
  const projectName = projectStage.querySelector('h3')?.textContent?.trim() ?? '';

  if (!projectName) {
    throw new Error(`Project stage ${index + 1} must have a non-empty project name.`);
  }

  if (projectStagesByName.has(projectName)) {
    throw new Error(`Duplicate project stage name: ${projectName}`);
  }

  const externalLinks = [...projectStage.querySelectorAll('a[href]')].flatMap((link) => {
    const href = link.getAttribute('href');

    if (!href) {
      return [];
    }

    let url;

    try {
      url = new URL(href, siteUrl);
    } catch {
      return [];
    }

    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin === siteUrl.origin) {
      return [];
    }

    return [{ link, url }];
  });
  const externalLink = externalLinks[0];
  const relTokens = new Set(
    (externalLink?.link.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean),
  );
  const hasSafeExternalLink =
    externalLinks.length === 1 &&
    externalLink.url.protocol === 'https:' &&
    externalLink.link.getAttribute('target') === '_blank' &&
    relTokens.has('noreferrer') &&
    relTokens.has('noopener');

  if (!hasSafeExternalLink) {
    throw new Error(
      `Project stage for ${projectName} must include exactly one HTTPS external link.`,
    );
  }

  const projectUrl = externalLink.url.href;
  if (projectExternalUrls.has(projectUrl)) {
    throw new Error(`Duplicate project stage external link: ${projectUrl}`);
  }

  projectStagesByName.set(projectName, projectUrl);
  projectExternalUrls.add(projectUrl);
}

for (const [projectName, projectUrl] of expectedProjects) {
  const verifiedProjectUrl = projectStagesByName.get(projectName);

  if (verifiedProjectUrl === undefined) {
    throw new Error(`section#projects is missing canonical project stage: ${projectName}`);
  }

  if (verifiedProjectUrl !== projectUrl) {
    throw new Error(`Project stage for ${projectName} is missing external link: ${projectUrl}`);
  }
}
homepageDom.window.close();

const llmsFull = await readFile(path.join(buildDir, 'llms-full.txt'), 'utf8');
for (const url of [
  'https://graph.tohoqing.com/',
  'https://sub.thqllm.com/',
  'https://img.tohoqing.com/',
]) {
  assertIncludes(llmsFull, url, 'doc_build/llms-full.txt');
}

console.log(`Verified ${requiredOutputs.length} static outputs and site copy.`);
