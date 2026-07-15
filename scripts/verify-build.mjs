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
const canonicalSitemapUrl = 'https://thqllm.com/sitemap.xml';
const expectedHomepageReferences = {
  desktopHero: '/assets/hero/thqllm-title-desktop.webp',
  favicon: '/favicon.svg',
  mobileHero: '/assets/hero/thqllm-title-mobile.webp',
  mobileHeroMedia: '(max-width: 640px)',
  ogImage: 'https://thqllm.com/og-cover.png',
};
const svgNamespace = 'http://www.w3.org/2000/svg';
const svgNumberSource = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const svgNumberSeparator = String.raw`(?:\s+(?:,\s*)?|,\s*)`;
const svgViewBoxPattern = new RegExp(
  `^(${svgNumberSource})${svgNumberSeparator}(${svgNumberSource})${svgNumberSeparator}(${svgNumberSource})${svgNumberSeparator}(${svgNumberSource})$`,
);
const srcsetDensityPattern = /^(\d+(?:\.\d*)?|\.\d+)x$/;
const visibleAlphaThreshold = 16;
const minimumVisiblePixelRatio = 0.01;
const minimumColorDynamicRange = 16;
const minimumColorStandardDeviation = 2;
// Current assets are 100% visible with max channel ranges 252-255 and max stddev 65.66-77.89.
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

    const viewBoxMatch = (rootElement.getAttribute('viewBox') ?? '')
      .trim()
      .match(svgViewBoxPattern);
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

  for (const rawLine of robotsBytes.toString('utf8').split(/\r?\n/)) {
    if (!rawLine.trim()) {
      finishGroup();
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
    const hasRootDisallow = group.rules.some(
      ({ directive, value }) => directive === 'disallow' && value === '/',
    );
    const groupNumber = index + 1;

    if (hasRootDisallow) {
      throw new Error(`robots.txt wildcard group ${groupNumber} must not contain Disallow: /.`);
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
  if (!srcset.trim()) {
    return [];
  }

  return srcset.split(',').map((rawCandidate) => {
    const tokens = rawCandidate.trim().split(/\s+/);
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
      }
    } finally {
      if (!keepDom) {
        dom.window.close();
      }
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

      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.origin === siteUrl.origin
      ) {
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
} finally {
  homepageDom?.window.close();
}

const llmsFull = await readFile(path.join(buildDir, 'llms-full.txt'), 'utf8');
for (const url of [
  'https://graph.tohoqing.com/',
  'https://sub.thqllm.com/',
  'https://img.tohoqing.com/',
]) {
  assertIncludes(llmsFull, url, 'doc_build/llms-full.txt');
}

console.log(`Verified ${requiredOutputs.length} static outputs and site copy.`);
