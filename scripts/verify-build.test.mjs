import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptSource = path.join(import.meta.dirname, 'verify-build.mjs');
const publicAssetsRoot = path.join(repoRoot, 'site/public');
const verifierTimeoutMs = 20_000;
const expectedHomepageReferences = {
  desktopHero: '/assets/hero/thqllm-title-desktop.webp',
  favicon: '/favicon.svg',
  mobileHero: '/assets/hero/thqllm-title-mobile.webp',
  mobileHeroMedia: '(max-width: 640px)',
  ogImage: 'https://thqllm.com/og-cover.png',
};
const criticalFiles = [
  'og-cover.png',
  'assets/hero/thqllm-title-desktop.webp',
  'assets/hero/thqllm-title-mobile.webp',
  'favicon.svg',
  'robots.txt',
];
const syntheticProjects = [
  {
    id: 'alpha',
    name: 'Alpha Project',
    url: 'https://alpha.example.com/',
    order: 1,
    featured: true,
    docsRoutes: ['/docs/alpha/'],
  },
  {
    id: 'beta',
    name: 'Beta Project',
    url: 'https://beta.example.com/',
    order: 2,
    featured: false,
    docsRoutes: ['/docs/beta/'],
  },
];
const defaultCards = cardsForProjects(syntheticProjects, true);
const defaultDirectoryCards = cardsForProjects(syntheticProjects, false);
const canonicalCards = defaultCards;
const fourthCard = {
  id: 'fourth',
  name: 'Fourth Project',
  url: 'https://fourth.example.com/',
  documented: false,
};
const siteOrigin = 'https://thqllm.com';
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
const defaultManifest = createSyntheticManifest(syntheticProjects);
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const crc32Table = Array.from({ length: 256 }, (_, value) => {
  let checksum = value;

  for (let bit = 0; bit < 8; bit += 1) {
    checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
  }

  return checksum >>> 0;
});

let fixtureRoot;

function createProjectCard({
  actionsAriaHidden = false,
  actionsHidden = false,
  actionsMarker = true,
  actionsStyle,
  docsHref,
  docsLinkOutsideActions = false,
  docsMarker = true,
  documented = false,
  extraActionsContainer = false,
  extraLinks = [],
  id,
  name,
  mainLinkAriaLabel = `进入 ${name}`,
  mainLinkAriaHidden = false,
  mainLinkClass,
  mainLinkHidden = false,
  mainLinkMarker = true,
  mainLinkOutsideActions = false,
  mainLinkStyle,
  mainLinkTabIndex,
  mainLinkText = '进入项目',
  url,
}) {
  const renderedExtraLinks = extraLinks.map((link) => {
    const linkConfig = typeof link === 'string' ? { href: link } : link;
    const attributes = [
      linkConfig.marker ? `data-project-external-link="${id}"` : '',
      linkConfig.hidden ? 'hidden' : '',
      linkConfig.ariaHidden ? 'aria-hidden="true"' : '',
      linkConfig.ariaLabel ? `aria-label="${linkConfig.ariaLabel}"` : '',
      linkConfig.className ? `class="${linkConfig.className}"` : '',
      linkConfig.style ? `style="${linkConfig.style}"` : '',
      linkConfig.tabIndex === undefined ? '' : `tabindex="${linkConfig.tabIndex}"`,
      linkConfig.target ? `target="${linkConfig.target}"` : '',
      linkConfig.rel ? `rel="${linkConfig.rel}"` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const anchor = `<a href="${linkConfig.href}"${attributes ? ` ${attributes}` : ''}>${linkConfig.text ?? '附加链接'}</a>`;
    const ancestorAttributes = [
      linkConfig.ancestorHidden ? 'hidden' : '',
      linkConfig.ancestorAriaHidden ? 'aria-hidden="true"' : '',
      linkConfig.ancestorStyle ? `style="${linkConfig.ancestorStyle}"` : '',
    ]
      .filter(Boolean)
      .join(' ');

    return {
      html: ancestorAttributes ? `<span ${ancestorAttributes}>${anchor}</span>` : anchor,
      outsideActions: linkConfig.outsideActions === true,
    };
  });
  const mainLinkAttributes = [
    mainLinkMarker ? `data-project-external-link="${id}"` : '',
    mainLinkHidden ? 'hidden' : '',
    mainLinkAriaHidden ? 'aria-hidden="true"' : '',
    mainLinkClass ? `class="${mainLinkClass}"` : '',
    mainLinkStyle ? `style="${mainLinkStyle}"` : '',
    mainLinkTabIndex === undefined ? '' : `tabindex="${mainLinkTabIndex}"`,
  ]
    .filter(Boolean)
    .join(' ');
  const mainLink = `<a href="${url}"${mainLinkAttributes ? ` ${mainLinkAttributes}` : ''} target="_blank" rel="noreferrer noopener" aria-label="${mainLinkAriaLabel}">${mainLinkText}</a>`;
  const docsLink = documented
    ? `<a href="${docsHref ?? `/docs/${id}/`}"${docsMarker ? ` data-project-docs-link="${id}"` : ''} aria-label="阅读 ${name} 文档">使用文档</a>`
    : '';
  const actionsAttributes = [
    actionsMarker ? 'data-project-actions' : '',
    actionsHidden ? 'hidden' : '',
    actionsAriaHidden ? 'aria-hidden="true"' : '',
    actionsStyle ? `style="${actionsStyle}"` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const insideExtraLinks = renderedExtraLinks
    .filter((link) => !link.outsideActions)
    .map((link) => link.html)
    .join('');
  const outsideExtraLinks = renderedExtraLinks
    .filter((link) => link.outsideActions)
    .map((link) => link.html)
    .join('');
  const actions = `<div${actionsAttributes ? ` ${actionsAttributes}` : ''}>${mainLinkOutsideActions ? '' : mainLink}${insideExtraLinks}${documented && !docsLinkOutsideActions ? docsLink : ''}</div>`;

  return `
    <article data-testid="project-stage">
      <h3>${name}</h3>
      ${mainLinkOutsideActions ? mainLink : ''}
      ${actions}
      ${extraActionsContainer ? '<div data-project-actions></div>' : ''}
      ${outsideExtraLinks}
      ${documented && docsLinkOutsideActions ? docsLink : ''}
    </article>
  `;
}

function outputPathForRoute(routePath, extension) {
  const relativeRoutePath = routePath.slice(1);

  return routePath.endsWith('/')
    ? `${relativeRoutePath}index.${extension}`
    : `${relativeRoutePath}.${extension}`;
}

function createSyntheticManifest(projects) {
  return {
    schemaVersion: 1,
    siteOrigin,
    routes: [
      ...fixedManifestRoutes,
      ...projects.flatMap((project) =>
        (project.docsRoutes ?? []).map((routePath) => ({
          routePath,
          htmlPath: outputPathForRoute(routePath, 'html'),
          markdownPath: outputPathForRoute(routePath, 'md'),
          llms: { txt: true, full: true },
        })),
      ),
    ],
    projects: projects
      .toSorted((left, right) => left.order - right.order)
      .map((project) => ({
        id: project.id,
        name: project.name,
        externalUrl: new URL(project.url).href,
        order: project.order,
        featured: project.featured,
        documented: (project.docsRoutes ?? []).length > 0,
      })),
  };
}

function routeUrl(routePath) {
  return new URL(routePath, `${siteOrigin}/`).href;
}

function markdownUrl(markdownPath) {
  return `/${markdownPath}`;
}

function createSyntheticSitemap(manifest) {
  const urls = manifest.routes
    .map((route) => `<url><loc>${routeUrl(route.routePath)}</loc></url>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function createSyntheticLlmsTxt(manifest) {
  const links = manifest.routes
    .filter((route) => route.llms.txt)
    .map((route) => `- [${route.routePath}](${markdownUrl(route.markdownPath)})`)
    .join('\n');

  return `# Synthetic fixture\n\n## Routes\n\n${links}\n`;
}

function createSyntheticLlmsFullTxt(manifest) {
  const externalUrls = manifest.projects
    .map((project) => `- [${project.name}](${project.externalUrl})`)
    .join('\n');

  return `${manifest.routes
    .filter((route) => route.llms.full)
    .map(
      (route) =>
        `---\nurl: ${markdownUrl(route.markdownPath)}\n---\n\n${externalUrls}\n\nFixture content.\n`,
    )
    .join('\n')}\n`;
}

function transformLlmsFullBlock(content, markdownRoute, transform) {
  const frontmatter = `---\nurl: ${markdownRoute}\n---`;
  const blockStart = content.indexOf(frontmatter);

  if (blockStart === -1) {
    throw new Error(`Expected llms-full fixture block: ${markdownRoute}`);
  }

  const blockEndCandidate = content.indexOf('\n---\nurl:', blockStart + frontmatter.length);
  const blockEnd = blockEndCandidate === -1 ? content.length : blockEndCandidate;
  const block = content.slice(blockStart, blockEnd);

  return `${content.slice(0, blockStart)}${transform(block)}${content.slice(blockEnd)}`;
}

async function writeSyntheticManifestFixture(manifest, directoryCards = defaultDirectoryCards) {
  await writeFixtureFile(
    'doc_build/project-registry.json',
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  for (const route of manifest.routes) {
    await writeFixtureFile(
      `doc_build/${route.htmlPath}`,
      route.routePath === '/projects/'
        ? `<html><body><section id="projects">${directoryCards.map(createProjectCard).join('')}</section></body></html>`
        : '<html><body>Verified output</body></html>',
    );
    await writeFixtureFile(`doc_build/${route.markdownPath}`, '# Synthetic fixture\n');
  }

  await writeFixtureFile('doc_build/sitemap.xml', createSyntheticSitemap(manifest));
  await writeFixtureFile('doc_build/llms.txt', createSyntheticLlmsTxt(manifest));
  await writeFixtureFile('doc_build/llms-full.txt', createSyntheticLlmsFullTxt(manifest));
}

function cardsForProjects(projects, featuredOnly) {
  return projects
    .filter((project) => !featuredOnly || project.featured)
    .toSorted((left, right) => left.order - right.order)
    .map(({ docsRoutes = [], id, name, url }) => ({
      id,
      name,
      url,
      documented: docsRoutes.length > 0,
    }));
}

async function configureSyntheticFixture(projects) {
  const manifest = createSyntheticManifest(projects);
  const homepageCards = cardsForProjects(projects, true);
  const directoryCards = cardsForProjects(projects, false);

  await writeSyntheticManifestFixture(manifest, directoryCards);

  return { directoryCards, homepageCards, manifest };
}

async function writeProjectDirectory(cards) {
  await writeFixtureFile(
    'doc_build/projects/index.html',
    `<html><body><section id="projects">${cards.map(createProjectCard).join('')}</section></body></html>`,
  );
}

function createHomepage(cards, referenceOverrides = {}) {
  const structure = {
    bodyAttributes: '',
    bodyDecoys: '',
    desktopHeroSizes: null,
    desktopHeroSrcset: null,
    extraProjectSections: [],
    extraHeadFavicons: [],
    extraHeadOgImages: [],
    extraHeroImages: [],
    extraHeroSources: [],
    heroPictureCount: 1,
    heroSectionCount: 1,
    heroSectionExtras: '',
    htmlAttributes: '',
    mobileHeroType: null,
    projectsSectionAncestorAttributes: '',
    projectsSectionAttributes: '',
    rogueProjectCards: [],
    sourceAfterImage: false,
    ...expectedHomepageReferences,
    ...referenceOverrides,
  };
  const ogImages = [structure.ogImage, ...structure.extraHeadOgImages]
    .filter((reference) => reference !== null)
    .map((reference) => `<meta property="og:image" content="${reference}">`)
    .join('');
  const favicons = [structure.favicon, ...structure.extraHeadFavicons]
    .filter((reference) => reference !== null)
    .map((reference) => `<link rel="icon" href="${reference}" type="image/svg+xml">`)
    .join('');
  const mobileSources = [
    ...(structure.mobileHero === null
      ? []
      : [
          {
            media: structure.mobileHeroMedia,
            srcset: structure.mobileHero,
            type: structure.mobileHeroType,
          },
        ]),
    ...structure.extraHeroSources,
  ]
    .map(
      ({ media, srcset, type }) =>
        `<source media="${media}" srcset="${srcset}"${type === null || type === undefined ? '' : ` type="${type}"`}>`,
    )
    .join('');
  const desktopHeroAttributes = [
    structure.desktopHeroSrcset === null ? '' : ` srcset="${structure.desktopHeroSrcset}"`,
    structure.desktopHeroSizes === null ? '' : ` sizes="${structure.desktopHeroSizes}"`,
  ].join('');
  const desktopImages = [
    ...(structure.desktopHero === null
      ? []
      : [`<img src="${structure.desktopHero}"${desktopHeroAttributes} alt="">`]),
    ...structure.extraHeroImages.map((reference) => `<img src="${reference}" alt="">`),
  ].join('');
  const pictureChildren = structure.sourceAfterImage
    ? `${desktopImages}${mobileSources}`
    : `${mobileSources}${desktopImages}`;
  const heroPicture = `<picture>${pictureChildren}</picture>`;
  const heroPictures = Array.from({ length: structure.heroPictureCount }, () => heroPicture).join(
    '',
  );
  const heroSection = `<section data-danmaku-root>${heroPictures}${structure.heroSectionExtras}</section>`;
  const heroSections = Array.from({ length: structure.heroSectionCount }, () => heroSection).join(
    '',
  );
  const projectsSection = `<section id="projects"${structure.projectsSectionAttributes ? ` ${structure.projectsSectionAttributes}` : ''}>${cards.map(createProjectCard).join('')}</section>`;
  const wrappedProjectsSection = structure.projectsSectionAncestorAttributes
    ? `<div ${structure.projectsSectionAncestorAttributes}>${projectsSection}</div>`
    : projectsSection;
  const extraProjectSections = structure.extraProjectSections.join('');
  const rogueProjectCards = structure.rogueProjectCards.map(createProjectCard).join('');

  return `
    <html${structure.htmlAttributes ? ` ${structure.htmlAttributes}` : ''}>
      <head>
        ${ogImages}
        ${favicons}
      </head>
      <body${structure.bodyAttributes ? ` ${structure.bodyAttributes}` : ''}>
        ${heroSections}
        ${structure.bodyDecoys}
        ${wrappedProjectsSection}
        ${extraProjectSections}
        ${rogueProjectCards}
      </body>
    </html>
  `;
}

function createCanonicalBodyDecoys() {
  return `
    <div hidden>
      <meta property="og:image" content="${expectedHomepageReferences.ogImage}">
      <link rel="icon" href="${expectedHomepageReferences.favicon}" type="image/svg+xml">
      <img src="${expectedHomepageReferences.desktopHero}" alt="">
      <source
        media="${expectedHomepageReferences.mobileHeroMedia}"
        srcset="${expectedHomepageReferences.mobileHero}"
      >
    </div>
  `;
}

async function writeFixtureFile(relativePath, content) {
  const outputPath = path.join(fixtureRoot, relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content);
}

async function copyPublicAsset(relativePath) {
  const outputPath = path.join(fixtureRoot, 'doc_build', relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await copyFile(path.join(publicAssetsRoot, relativePath), outputPath);
}

async function removeFixtureBuildFile(relativePath) {
  await rm(path.join(fixtureRoot, 'doc_build', relativePath), {
    force: true,
    recursive: true,
  });
}

async function writeGeneratedImage(relativePath, { format, height, width }) {
  const outputPath = path.join(fixtureRoot, 'doc_build', relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const image = sharp({
    create: {
      background: { b: 32, g: 32, r: 32 },
      channels: 3,
      height,
      width,
    },
  });

  await (format === 'png' ? image.png() : image.webp()).toFile(outputPath);
}

async function writeAnimatedWebp(relativePath) {
  const outputPath = path.join(fixtureRoot, 'doc_build', relativePath);
  const firstFrame = await readFile(outputPath);
  const secondFrame = await sharp(firstFrame).negate({ alpha: false }).webp().toBuffer();

  await sharp([firstFrame, secondFrame], { join: { animated: true } })
    .webp({ delay: [100, 100], loop: 0 })
    .toFile(outputPath);
}

function calculateCrc32(bytes) {
  let checksum = 0xffffffff;

  for (const byte of bytes) {
    checksum = crc32Table[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }

  return (checksum ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);

  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(calculateCrc32(Buffer.concat([typeBytes, data])), data.length + 8);

  return chunk;
}

function createPngChunkHeader(type, declaredLength) {
  const chunkHeader = Buffer.alloc(8);

  chunkHeader.writeUInt32BE(declaredLength, 0);
  Buffer.from(type, 'ascii').copy(chunkHeader, 4);

  return chunkHeader;
}

function parseFixturePngChunks(imageBytes) {
  if (!imageBytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error('Expected fixture source to have a PNG signature.');
  }

  const chunks = [];
  let offset = pngSignature.length;

  while (offset < imageBytes.length) {
    if (imageBytes.length - offset < 12) {
      throw new Error('Expected fixture source to contain complete PNG chunks.');
    }

    const length = imageBytes.readUInt32BE(offset);
    const end = offset + length + 12;

    if (end > imageBytes.length) {
      throw new Error('Expected fixture source PNG chunk to fit within the file.');
    }

    const type = imageBytes.toString('ascii', offset + 4, offset + 8);

    chunks.push({
      bytes: Buffer.from(imageBytes.subarray(offset, end)),
      data: Buffer.from(imageBytes.subarray(offset + 8, offset + 8 + length)),
      length,
      offset,
      type,
    });
    offset = end;

    if (type === 'IEND') {
      break;
    }
  }

  if (offset !== imageBytes.length) {
    throw new Error('Expected fixture source PNG to end with IEND.');
  }

  return chunks;
}

function encodePngChunks(chunks, trailingBytes = Buffer.alloc(0)) {
  return Buffer.concat([
    pngSignature,
    ...chunks.map((chunk) => chunk.bytes ?? chunk),
    trailingBytes,
  ]);
}

async function mutateFixturePng(relativePath, mutate) {
  const outputPath = path.join(fixtureRoot, 'doc_build', relativePath);
  const imageBytes = await readFile(outputPath);
  const chunks = parseFixturePngChunks(imageBytes);

  await writeFile(outputPath, mutate({ chunks, imageBytes }));
}

function createApngFrameControl(sequenceNumber, { height, width }) {
  const frameControl = Buffer.alloc(26);

  frameControl.writeUInt32BE(sequenceNumber, 0);
  frameControl.writeUInt32BE(width, 4);
  frameControl.writeUInt32BE(height, 8);
  frameControl.writeUInt16BE(1, 20);
  frameControl.writeUInt16BE(10, 22);

  return frameControl;
}

function createApngFramePixels({ height, inverted, width }) {
  const row = Buffer.alloc(width * 3 + 1);

  for (let x = 0; x < width; x += 1) {
    const value = x < width / 2 !== inverted ? 0 : 255;
    const offset = x * 3 + 1;

    row[offset] = value;
    row[offset + 1] = value;
    row[offset + 2] = value;
  }

  const pixels = Buffer.alloc(row.length * height);

  for (let y = 0; y < height; y += 1) {
    row.copy(pixels, y * row.length);
  }

  return deflateSync(pixels);
}

async function writeAnimatedPng(relativePath, { height, width }) {
  const outputPath = path.join(fixtureRoot, 'doc_build', relativePath);
  const header = Buffer.alloc(13);
  const animationControl = Buffer.alloc(8);
  const secondFrameSequence = Buffer.alloc(4);

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  animationControl.writeUInt32BE(2, 0);
  secondFrameSequence.writeUInt32BE(2, 0);

  const imageBytes = Buffer.concat([
    pngSignature,
    createPngChunk('IHDR', header),
    createPngChunk('acTL', animationControl),
    createPngChunk('fcTL', createApngFrameControl(0, { height, width })),
    createPngChunk('IDAT', createApngFramePixels({ height, inverted: false, width })),
    createPngChunk('fcTL', createApngFrameControl(1, { height, width })),
    createPngChunk(
      'fdAT',
      Buffer.concat([
        secondFrameSequence,
        createApngFramePixels({ height, inverted: true, width }),
      ]),
    ),
    createPngChunk('IEND'),
  ]);

  await writeFile(outputPath, imageBytes);
}

async function insertPngChunkAfterHeader(relativePath, type, data) {
  const outputPath = path.join(fixtureRoot, 'doc_build', relativePath);
  const imageBytes = await readFile(outputPath);
  const headerChunkEnd = pngSignature.length + 12 + imageBytes.readUInt32BE(pngSignature.length);

  await writeFile(
    outputPath,
    Buffer.concat([
      imageBytes.subarray(0, headerChunkEnd),
      createPngChunk(type, data),
      imageBytes.subarray(headerChunkEnd),
    ]),
  );
}

async function writeRawPng(relativePath, { channels, data, height, width }) {
  const outputPath = path.join(fixtureRoot, 'doc_build', relativePath);

  await sharp(data, {
    raw: {
      channels,
      height,
      width,
    },
  })
    .png()
    .toFile(outputPath);
}

async function writeNearlyTransparentPng(relativePath, { height, width }) {
  const data = Buffer.alloc(width * height * 4);
  data[3] = 1;
  await writeRawPng(relativePath, { channels: 4, data, height, width });
}

async function writeNearlySolidPng(relativePath, { height, width }) {
  const data = Buffer.alloc(width * height * 3, 32);
  data[0] = 33;
  await writeRawPng(relativePath, { channels: 3, data, height, width });
}

async function writeSparsePng(relativePath, { changedPixels, height, width }) {
  const data = Buffer.alloc(width * height * 3);
  data.fill(255, 0, changedPixels * 3);
  await writeRawPng(relativePath, { channels: 3, data, height, width });
}

async function writeAlphaOnlyPng(relativePath, { height, width }) {
  const pixelCount = width * height;
  const data = Buffer.alloc(pixelCount * 4);

  for (let pixelIndex = Math.floor(pixelCount / 2); pixelIndex < pixelCount; pixelIndex += 1) {
    data[pixelIndex * 4 + 3] = 255;
  }

  await writeRawPng(relativePath, { channels: 4, data, height, width });
}

async function writeTransparentRandomRgbPng(relativePath, { height, width }) {
  const pixelCount = width * height;
  const data = Buffer.alloc(pixelCount * 4);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    data[offset] = pixelIndex % 256;
    data[offset + 1] = (pixelIndex * 17) % 256;
    data[offset + 2] = (pixelIndex * 31) % 256;
  }

  await writeRawPng(relativePath, { channels: 4, data, height, width });
}

async function writeVariedPng(relativePath, { channels, height, width }) {
  const pixelCount = width * height;
  const data = Buffer.alloc(pixelCount * channels);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * channels;
    const value = pixelIndex < pixelCount / 2 ? 0 : 255;
    const colorChannels = channels === 2 || channels === 4 ? channels - 1 : channels;

    for (let channel = 0; channel < colorChannels; channel += 1) {
      data[offset + channel] = value;
    }

    if (colorChannels !== channels) {
      data[offset + channels - 1] = 255;
    }
  }

  await writeRawPng(relativePath, { channels, data, height, width });
}

async function truncateFixtureImagePreservingMetadata(relativePath) {
  const outputPath = path.join(fixtureRoot, 'doc_build', relativePath);
  const imageBytes = await readFile(outputPath);
  const truncatedLength = Math.floor(imageBytes.length * 0.9) & ~1;
  const truncatedBytes = Buffer.from(imageBytes.subarray(0, truncatedLength));

  if (
    truncatedBytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    truncatedBytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    truncatedBytes.writeUInt32LE(truncatedBytes.length - 8, 4);

    if (truncatedBytes.subarray(12, 16).toString('ascii') === 'VP8 ') {
      truncatedBytes.writeUInt32LE(truncatedBytes.length - 20, 16);
    }
  }

  await writeFile(outputPath, truncatedBytes);
}

async function runVerifier(cards = defaultCards, referenceOverrides = {}) {
  await writeFixtureFile('doc_build/index.html', createHomepage(cards, referenceOverrides));

  const result = spawnSync(process.execPath, [path.join(fixtureRoot, 'scripts/verify-build.mjs')], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    timeout: verifierTimeoutMs,
  });

  if (result.error) {
    throw new Error(`Verifier fixture process failed: ${result.error.message}`);
  }

  return result;
}

function expectMalformedPng(result, reason) {
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(`Critical image og-cover.png is malformed PNG: ${reason}`);
}

beforeEach(async () => {
  fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-verify-build-'));
  await mkdir(path.join(fixtureRoot, 'scripts'), { recursive: true });
  const nodeModulesLinkType = process.platform === 'win32' ? 'junction' : 'dir';

  try {
    await symlink(
      path.join(repoRoot, 'node_modules'),
      path.join(fixtureRoot, 'node_modules'),
      nodeModulesLinkType,
    );
  } catch (error) {
    throw new Error(
      `Could not create fixture node_modules ${nodeModulesLinkType}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await copyFile(scriptSource, path.join(fixtureRoot, 'scripts/verify-build.mjs'));

  for (const criticalFile of criticalFiles) {
    await copyPublicAsset(criticalFile);
  }

  await writeFixtureFile('doc_build/404.html', '<html><body>Verified output</body></html>');
  await writeSyntheticManifestFixture(defaultManifest);
});

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe('verify-build manifest-driven output validation', () => {
  it('accepts a complete single-project synthetic manifest', async () => {
    const { homepageCards } = await configureSyntheticFixture([
      {
        id: 'solo',
        name: 'Solo Project',
        url: 'https://solo.example.com/',
        order: 1,
        featured: true,
        docsRoutes: ['/docs/solo/', '/docs/solo/guide'],
      },
    ]);

    const result = await runVerifier(homepageCards);

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('accepts a fourth registered project and all of its generated routes', async () => {
    const projects = [
      ...syntheticProjects,
      {
        id: 'fourth',
        ...fourthCard,
        order: 3,
        featured: true,
        docsRoutes: ['/docs/fourth/', '/docs/fourth/setup'],
      },
    ];
    const { homepageCards } = await configureSyntheticFixture(projects);

    const result = await runVerifier(homepageCards);

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('accepts an undocumented project when llms-full contains its registry URL', async () => {
    const { homepageCards } = await configureSyntheticFixture([
      {
        id: 'undocumented',
        name: 'Undocumented Project',
        url: 'https://undocumented.example.com/',
        order: 1,
        featured: true,
        docsRoutes: [],
      },
    ]);

    const result = await runVerifier(homepageCards);

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('accepts the existing projects plus a fourth undocumented project', async () => {
    const baselineProjects = [
      ...syntheticProjects,
      {
        id: 'gamma',
        name: 'Gamma Project',
        url: 'https://gamma.example.com/',
        order: 3,
        featured: true,
        docsRoutes: ['/docs/gamma/'],
      },
    ];
    const baselineManifest = createSyntheticManifest(baselineProjects);
    const fourthProject = {
      id: 'fourth',
      ...fourthCard,
      order: 4,
      featured: true,
      docsRoutes: [],
    };
    const projects = [...baselineProjects, fourthProject];
    const { directoryCards, homepageCards, manifest } = await configureSyntheticFixture(projects);
    const llmsFull = await readFile(path.join(fixtureRoot, 'doc_build/llms-full.txt'), 'utf8');

    expect(manifest.projects).toHaveLength(4);
    expect(manifest.projects.at(-1)).toMatchObject({
      id: fourthProject.id,
      order: 4,
      documented: false,
    });
    expect(manifest.routes).toEqual(baselineManifest.routes);
    expect(manifest.routes.some((route) => route.routePath.startsWith('/docs/fourth'))).toBe(false);
    expect(homepageCards).toEqual(cardsForProjects(projects, true));
    expect(directoryCards).toEqual(cardsForProjects(projects, false));
    expect(llmsFull).toContain(`](${new URL(fourthProject.url).href})`);

    const result = await runVerifier(homepageCards);

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it.each([
    'htmlPath',
    'markdownPath',
  ])('rejects a missing docs route $field output', async (field) => {
    const { homepageCards, manifest } = await configureSyntheticFixture([
      {
        id: 'documented',
        name: 'Documented Project',
        url: 'https://documented.example.com/',
        order: 1,
        featured: true,
        docsRoutes: ['/docs/documented/', '/docs/documented/guide'],
      },
    ]);
    const docsRoute = manifest.routes.find((route) => route.routePath === '/docs/documented/guide');

    if (!docsRoute) {
      throw new Error('Expected the synthetic docs guide route');
    }

    await removeFixtureBuildFile(docsRoute[field]);

    const result = await runVerifier(homepageCards);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Missing required static output: ${docsRoute[field]}`);
  });

  it('rejects a missing 404 output in addition to manifest routes', async () => {
    await removeFixtureBuildFile('404.html');

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Missing required static output: 404.html');
  });

  it('rejects a missing project build manifest', async () => {
    await removeFixtureBuildFile('project-registry.json');

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Missing project build manifest: project-registry.json');
  });

  it('rejects a project build manifest that is not a regular file', async () => {
    await removeFixtureBuildFile('project-registry.json');
    await mkdir(path.join(fixtureRoot, 'doc_build/project-registry.json'));

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Project build manifest project-registry.json is not a regular file.',
    );
  });

  it('rejects an empty project build manifest', async () => {
    await writeFixtureFile('doc_build/project-registry.json', '');

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Project build manifest project-registry.json is empty.');
  });

  it('rejects invalid project build manifest JSON', async () => {
    await writeFixtureFile('doc_build/project-registry.json', '{"schemaVersion":');

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Project build manifest project-registry.json contains invalid JSON.',
    );
  });

  it.each([
    {
      label: 'schema version',
      manifest: { ...defaultManifest, schemaVersion: 2 },
      path: 'schemaVersion',
    },
    {
      label: 'shape',
      manifest: { ...defaultManifest, routes: 'ambiguous' },
      path: 'routes',
    },
    {
      label: 'site origin',
      manifest: { ...defaultManifest, siteOrigin: 'https://example.com' },
      path: 'siteOrigin',
    },
  ])('rejects an invalid manifest $label', async ({ manifest, path: manifestPath }) => {
    await writeFixtureFile(
      'doc_build/project-registry.json',
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Invalid project build manifest at ${manifestPath}`);
  });

  it.each([
    ' https://alpha.example.com/',
    'https://alpha.example.com/ ',
  ])('rejects surrounding whitespace in a manifest project external URL: %s', async (externalUrl) => {
    const manifest = structuredClone(defaultManifest);
    manifest.projects[0].externalUrl = externalUrl;
    await writeFixtureFile(
      'doc_build/project-registry.json',
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Invalid project build manifest at projects.0.externalUrl: Project external URLs must not include surrounding whitespace',
    );
  });

  it('rejects the trailing-dot site hostname in a manifest project external URL', async () => {
    const manifest = structuredClone(defaultManifest);
    manifest.projects[0].externalUrl = 'https://thqllm.com./';
    await writeFixtureFile(
      'doc_build/project-registry.json',
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Invalid project build manifest at projects.0.externalUrl: Project external URLs must not use the site hostname',
    );
  });

  it('rejects a docs route with ambiguous llms inclusion flags', async () => {
    const manifest = structuredClone(defaultManifest);
    const docsRoute = manifest.routes.find((route) => route.routePath.startsWith('/docs/'));

    if (!docsRoute) {
      throw new Error('Expected a synthetic docs route');
    }

    docsRoute.llms.txt = false;
    await writeFixtureFile(
      'doc_build/project-registry.json',
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Invalid project build manifest at routes.');
    expect(result.stderr).toContain('Docs routes must appear in both llms outputs');
  });

  it.each([
    'sitemap.xml',
    'llms.txt',
    'llms-full.txt',
  ])('rejects a whitespace-only generated text file: %s', async (relativePath) => {
    await writeFixtureFile(`doc_build/${relativePath}`, ' \n\t');

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Required static output is empty: ${relativePath}`);
  });

  it('rejects sitemap.xml when an expected route has no loc', async () => {
    const sitemapWithoutHomeLoc = createSyntheticSitemap({
      ...defaultManifest,
      routes: defaultManifest.routes.filter((route) => route.routePath !== '/'),
    });
    await writeFixtureFile(
      'doc_build/sitemap.xml',
      sitemapWithoutHomeLoc.replace('<urlset>', '<urlset><url></url>'),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`sitemap.xml is missing route URL: ${siteOrigin}/`);
  });

  it('rejects a sitemap with the wrong namespace', async () => {
    await writeFixtureFile(
      'doc_build/sitemap.xml',
      createSyntheticSitemap(defaultManifest).replace(
        'http://www.sitemaps.org/schemas/sitemap/0.9',
        'https://example.com/not-sitemap',
      ),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'sitemap.xml must use namespace http://www.sitemaps.org/schemas/sitemap/0.9.',
    );
  });

  it('rejects a non-url direct child under the sitemap urlset', async () => {
    await writeFixtureFile(
      'doc_build/sitemap.xml',
      createSyntheticSitemap(defaultManifest).replace('</urlset>', '<decoy></decoy></urlset>'),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('sitemap.xml urlset direct child 7 must be a url element.');
  });

  it('does not count a nested decoy loc for a sitemap url without loc', async () => {
    const homeUrl = routeUrl('/');
    await writeFixtureFile(
      'doc_build/sitemap.xml',
      createSyntheticSitemap(defaultManifest).replace(
        `<url><loc>${homeUrl}</loc></url>`,
        `<url></url><decoy><loc>${homeUrl}</loc></decoy>`,
      ),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'sitemap.xml url element 1 must contain exactly one direct non-empty loc.',
    );
  });

  it('rejects two direct loc elements in one sitemap url', async () => {
    const homeUrl = routeUrl('/');
    await writeFixtureFile(
      'doc_build/sitemap.xml',
      createSyntheticSitemap(defaultManifest).replace(
        `<url><loc>${homeUrl}</loc></url>`,
        `<url><loc>${homeUrl}</loc><loc>${homeUrl}</loc></url>`,
      ),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'sitemap.xml url element 1 must contain exactly one direct non-empty loc.',
    );
  });

  it('rejects a nested element beside a valid sitemap loc', async () => {
    const homeUrl = routeUrl('/');
    await writeFixtureFile(
      'doc_build/sitemap.xml',
      createSyntheticSitemap(defaultManifest).replace(
        `<url><loc>${homeUrl}</loc></url>`,
        `<url><loc>${homeUrl}</loc><lastmod><loc>2026-07-16</loc></lastmod></url>`,
      ),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'sitemap.xml url element 1 child 2 (lastmod) must not contain nested elements.',
    );
  });

  it('rejects a direct sitemap loc in a different namespace', async () => {
    const homeUrl = routeUrl('/');
    await writeFixtureFile(
      'doc_build/sitemap.xml',
      createSyntheticSitemap(defaultManifest).replace(
        `<url><loc>${homeUrl}</loc></url>`,
        `<url><loc>${homeUrl}</loc><loc xmlns="">${homeUrl}</loc></url>`,
      ),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'sitemap.xml url element 1 child 2 must use namespace http://www.sitemaps.org/schemas/sitemap/0.9.',
    );
  });

  it('rejects an unknown direct sitemap url child', async () => {
    const homeUrl = routeUrl('/');
    await writeFixtureFile(
      'doc_build/sitemap.xml',
      createSyntheticSitemap(defaultManifest).replace(
        `<url><loc>${homeUrl}</loc></url>`,
        `<url><loc>${homeUrl}</loc><decoy>ignored</decoy></url>`,
      ),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('sitemap.xml url element 1 child 2 is unsupported: decoy.');
  });

  it('rejects duplicate sitemap route URLs', async () => {
    await writeFixtureFile(
      'doc_build/sitemap.xml',
      createSyntheticSitemap(defaultManifest).replace(
        '</urlset>',
        `<url><loc>${siteOrigin}/</loc></url></urlset>`,
      ),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`sitemap.xml contains duplicate route URL: ${siteOrigin}/`);
  });

  it('rejects unexpected sitemap route URLs', async () => {
    await writeFixtureFile(
      'doc_build/sitemap.xml',
      createSyntheticSitemap(defaultManifest).replace(
        '</urlset>',
        '<url><loc>https://thqllm.com/unregistered/</loc></url></urlset>',
      ),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'sitemap.xml contains unexpected route URL: https://thqllm.com/unregistered/',
    );
  });

  it('rejects llms.txt when a marked Markdown route link is missing', async () => {
    const missingRoute = defaultManifest.routes.find((route) => route.llms.txt);

    if (!missingRoute) {
      throw new Error('Expected an llms.txt fixture route');
    }

    await writeFixtureFile(
      'doc_build/llms.txt',
      createSyntheticLlmsTxt({
        ...defaultManifest,
        routes: defaultManifest.routes.filter(
          (route) => route.routePath !== missingRoute.routePath,
        ),
      }),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms.txt is missing Markdown route: ${markdownUrl(missingRoute.markdownPath)}`,
    );
  });

  it.each([
    {
      label: 'fenced code',
      decoy: (route) => `\n\`\`\`md\n- [decoy](${route})\n\`\`\`\n`,
    },
    {
      label: 'inline code',
      decoy: (route) => `\n\`[decoy](${route})\`\n`,
    },
    {
      label: 'an HTML comment',
      decoy: (route) => `\n<!-- [decoy](${route}) -->\n`,
    },
  ])('ignores an llms.txt route link inside $label', async ({ decoy }) => {
    const missingRoute = defaultManifest.routes.find((route) => route.llms.txt);

    if (!missingRoute) {
      throw new Error('Expected an llms.txt fixture route');
    }

    const missingMarkdownRoute = markdownUrl(missingRoute.markdownPath);
    await writeFixtureFile(
      'doc_build/llms.txt',
      `${createSyntheticLlmsTxt({
        ...defaultManifest,
        routes: defaultManifest.routes.filter(
          (route) => route.routePath !== missingRoute.routePath,
        ),
      })}${decoy(missingMarkdownRoute)}`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`llms.txt is missing Markdown route: ${missingMarkdownRoute}`);
  });

  it('does not count an llms.txt reference link and definition inside fenced code', async () => {
    const missingRoute = defaultManifest.routes.find((route) => route.llms.txt);

    if (!missingRoute) {
      throw new Error('Expected an llms.txt fixture route');
    }

    const missingMarkdownRoute = markdownUrl(missingRoute.markdownPath);
    await writeFixtureFile(
      'doc_build/llms.txt',
      `${createSyntheticLlmsTxt({
        ...defaultManifest,
        routes: defaultManifest.routes.filter(
          (route) => route.routePath !== missingRoute.routePath,
        ),
      })}\n\`\`\`md\n- [decoy][missing route]\n\n[missing route]: ${missingMarkdownRoute}\n\`\`\`\n`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`llms.txt is missing Markdown route: ${missingMarkdownRoute}`);
  });

  it('accepts a CommonMark reference-style llms.txt route using the first definition', async () => {
    const referenceRoute = defaultManifest.routes.find((route) => route.llms.txt);

    if (!referenceRoute) {
      throw new Error('Expected an llms.txt fixture route');
    }

    const referenceMarkdownRoute = markdownUrl(referenceRoute.markdownPath);
    const directLink = `- [${referenceRoute.routePath}](${referenceMarkdownRoute})`;
    await writeFixtureFile(
      'doc_build/llms.txt',
      createSyntheticLlmsTxt(defaultManifest).replace(
        directLink,
        `- [${referenceRoute.routePath}][  RoUtE   LaBeL  ]\n\n[route label]: ${referenceMarkdownRoute}\n[ROUTE LABEL]: /unregistered.md`,
      ),
    );

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('rejects duplicate llms.txt Markdown route links', async () => {
    const duplicateRoute = defaultManifest.routes.find((route) => route.llms.txt);

    if (!duplicateRoute) {
      throw new Error('Expected an llms.txt fixture route');
    }

    await writeFixtureFile(
      'doc_build/llms.txt',
      `${createSyntheticLlmsTxt(defaultManifest)}\n- [duplicate](${markdownUrl(duplicateRoute.markdownPath)})\n`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms.txt contains duplicate Markdown route: ${markdownUrl(duplicateRoute.markdownPath)}`,
    );
  });

  it('rejects llms.txt when it invents the home entry that Rspress omits', async () => {
    await writeFixtureFile(
      'doc_build/llms.txt',
      `${createSyntheticLlmsTxt(defaultManifest)}\n- [home](/index.md)\n`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('llms.txt contains unexpected Markdown route: /index.md');
  });

  it('rejects llms-full.txt when a marked route frontmatter is missing', async () => {
    const missingRoute = defaultManifest.routes.find((route) => route.llms.full);

    if (!missingRoute) {
      throw new Error('Expected an llms-full.txt fixture route');
    }

    await writeFixtureFile(
      'doc_build/llms-full.txt',
      createSyntheticLlmsFullTxt({
        ...defaultManifest,
        routes: defaultManifest.routes.filter(
          (route) => route.routePath !== missingRoute.routePath,
        ),
      }),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt is missing frontmatter route: ${markdownUrl(missingRoute.markdownPath)}`,
    );
  });

  it('ignores llms-full.txt frontmatter text inside fenced code', async () => {
    const missingRoute = defaultManifest.routes.find((route) => route.llms.full);

    if (!missingRoute) {
      throw new Error('Expected an llms-full.txt fixture route');
    }

    const missingMarkdownRoute = markdownUrl(missingRoute.markdownPath);
    await writeFixtureFile(
      'doc_build/llms-full.txt',
      `${createSyntheticLlmsFullTxt({
        ...defaultManifest,
        routes: defaultManifest.routes.filter(
          (route) => route.routePath !== missingRoute.routePath,
        ),
      })}\n\`\`\`md\n---\nurl: ${missingMarkdownRoute}\n---\n\`\`\`\n`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt is missing frontmatter route: ${missingMarkdownRoute}`,
    );
  });

  it('rejects duplicate YAML url keys in llms-full.txt frontmatter', async () => {
    const route = defaultManifest.routes.find((candidate) => candidate.llms.full);

    if (!route) {
      throw new Error('Expected an llms-full.txt fixture route');
    }

    const markdownRoute = markdownUrl(route.markdownPath);
    await writeFixtureFile(
      'doc_build/llms-full.txt',
      createSyntheticLlmsFullTxt(defaultManifest).replace(
        `url: ${markdownRoute}`,
        `url: ${markdownRoute}\nurl: ${markdownRoute}`,
      ),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('llms-full.txt frontmatter block 1 contains invalid YAML');
  });

  it.each([
    '42',
    'true',
    '[/projects/index.md]',
  ])('rejects a non-string llms-full.txt frontmatter url: %s', async (urlValue) => {
    const firstRoute = defaultManifest.routes.find((route) => route.llms.full);

    if (!firstRoute) {
      throw new Error('Expected an llms-full.txt fixture route');
    }

    await writeFixtureFile(
      'doc_build/llms-full.txt',
      createSyntheticLlmsFullTxt(defaultManifest).replace(
        `url: ${markdownUrl(firstRoute.markdownPath)}`,
        `url: ${urlValue}`,
      ),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'llms-full.txt frontmatter block 1 must contain exactly one string url.',
    );
  });

  it('rejects duplicate llms-full.txt frontmatter routes', async () => {
    const duplicateRoute = defaultManifest.routes.find((route) => route.llms.full);

    if (!duplicateRoute) {
      throw new Error('Expected an llms-full.txt fixture route');
    }

    await writeFixtureFile(
      'doc_build/llms-full.txt',
      `${createSyntheticLlmsFullTxt(defaultManifest)}\n---\nurl: ${markdownUrl(duplicateRoute.markdownPath)}\n---\n`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt contains duplicate frontmatter route: ${markdownUrl(duplicateRoute.markdownPath)}`,
    );
  });

  it('rejects an unexpected llms-full.txt frontmatter route', async () => {
    const unexpectedRoute = '/unregistered.md';
    await writeFixtureFile(
      'doc_build/llms-full.txt',
      `${createSyntheticLlmsFullTxt(defaultManifest)}\n---\nurl: ${unexpectedRoute}\n---\n`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt contains unexpected frontmatter route: ${unexpectedRoute}`,
    );
  });

  it('rejects llms-full.txt when a registered external URL is missing', async () => {
    const missingUrl = defaultManifest.projects[0].externalUrl;
    await writeFixtureFile(
      'doc_build/llms-full.txt',
      createSyntheticLlmsFullTxt(defaultManifest).replaceAll(missingUrl, ''),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt projects block is missing registered project external URL: ${missingUrl}`,
    );
  });

  it('does not count a plain-text llms-full.txt project URL as a Markdown link', async () => {
    const missingProject = defaultManifest.projects[0];
    const projectLink = `- [${missingProject.name}](${missingProject.externalUrl})`;
    await writeFixtureFile(
      'doc_build/llms-full.txt',
      createSyntheticLlmsFullTxt(defaultManifest).replaceAll(
        projectLink,
        missingProject.externalUrl,
      ),
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt projects block is missing registered project external URL: ${missingProject.externalUrl}`,
    );
  });

  it('accepts a balanced-parentheses project Markdown link destination', async () => {
    const { homepageCards } = await configureSyntheticFixture([
      {
        id: 'parentheses',
        name: 'Parentheses Project',
        url: 'https://example.com/a(b)',
        order: 1,
        featured: true,
        docsRoutes: [],
      },
    ]);

    const result = await runVerifier(homepageCards);

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('accepts an angle-bracket project Markdown link destination', async () => {
    const project = defaultManifest.projects[0];
    const projectLink = `- [${project.name}](${project.externalUrl})`;
    await writeFixtureFile(
      'doc_build/llms-full.txt',
      createSyntheticLlmsFullTxt(defaultManifest).replaceAll(
        projectLink,
        `- [${project.name}](<${project.externalUrl}>)`,
      ),
    );

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('requires every registered project URL inside the projects llms-full block', async () => {
    const project = defaultManifest.projects[0];
    const projectLink = `- [${project.name}](${project.externalUrl})`;
    const content = transformLlmsFullBlock(
      createSyntheticLlmsFullTxt(defaultManifest),
      '/projects/index.md',
      (block) => block.replace(projectLink, ''),
    );
    await writeFixtureFile('doc_build/llms-full.txt', content);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt projects block is missing registered project external URL: ${project.externalUrl}`,
    );
  });

  it('rejects an unexpected external URL inside the projects llms-full block', async () => {
    const unexpectedUrl = 'https://unexpected.example.com/';
    const content = transformLlmsFullBlock(
      createSyntheticLlmsFullTxt(defaultManifest),
      '/projects/index.md',
      (block) => `${block}\n- [Unexpected](${unexpectedUrl})\n`,
    );
    await writeFixtureFile('doc_build/llms-full.txt', content);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt projects block contains unexpected external URL: ${unexpectedUrl}`,
    );
  });

  it('rejects a reference-style external URL inside the projects llms-full block', async () => {
    const unexpectedUrl = 'https://reference.example.com/project';
    const content = transformLlmsFullBlock(
      createSyntheticLlmsFullTxt(defaultManifest),
      '/projects/index.md',
      (block) =>
        `${block}\n- [Unexpected][  ExTrA   PrOjEcT  ]\n\n[extra project]: ${unexpectedUrl}\n`,
    );
    await writeFixtureFile('doc_build/llms-full.txt', content);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt projects block contains unexpected external URL: ${unexpectedUrl} at position 3.`,
    );
  });

  it('preserves duplicate reference-style project links', async () => {
    const duplicateProject = defaultManifest.projects[0];
    const content = transformLlmsFullBlock(
      createSyntheticLlmsFullTxt(defaultManifest),
      '/projects/index.md',
      (block) =>
        `${block}\n- [Duplicate][duplicate project]\n\n[duplicate project]: ${duplicateProject.externalUrl}\n`,
    );
    await writeFixtureFile('doc_build/llms-full.txt', content);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt projects block contains unexpected external URL: ${duplicateProject.externalUrl} at position 3.`,
    );
  });

  it('rejects a protocol-relative external URL inside the projects llms-full block', async () => {
    const protocolRelativeUrl = '//evil.example.com/path';
    const normalizedUrl = 'https://evil.example.com/path';
    const content = transformLlmsFullBlock(
      createSyntheticLlmsFullTxt(defaultManifest),
      '/projects/index.md',
      (block) => `${block}\n- [Unexpected](${protocolRelativeUrl})\n`,
    );
    await writeFixtureFile('doc_build/llms-full.txt', content);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt projects block contains unexpected external URL: ${normalizedUrl} at position 3.`,
    );
  });

  it('ignores project image references and unused definitions', async () => {
    const content = transformLlmsFullBlock(
      createSyntheticLlmsFullTxt(defaultManifest),
      '/projects/index.md',
      (block) =>
        `${block}\n![Decorative project][project image]\n\n[project image]: https://ignored.example.com/\n[unused]: https://unused.example.com/\n`,
    );
    await writeFixtureFile('doc_build/llms-full.txt', content);

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('rejects a duplicate external URL inside the projects llms-full block', async () => {
    const duplicateProject = defaultManifest.projects[0];
    const duplicateLink = `- [${duplicateProject.name}](${duplicateProject.externalUrl})`;
    const content = transformLlmsFullBlock(
      createSyntheticLlmsFullTxt(defaultManifest),
      '/projects/index.md',
      (block) => `${block}\n${duplicateLink}\n`,
    );
    await writeFixtureFile('doc_build/llms-full.txt', content);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt projects block contains unexpected external URL: ${duplicateProject.externalUrl} at position 3.`,
    );
  });

  it('rejects reversed project external URL order inside the projects llms-full block', async () => {
    const projectLinks = defaultManifest.projects.map(
      (project) => `- [${project.name}](${project.externalUrl})`,
    );
    const content = transformLlmsFullBlock(
      createSyntheticLlmsFullTxt(defaultManifest),
      '/projects/index.md',
      (block) => block.replace(projectLinks.join('\n'), [...projectLinks].reverse().join('\n')),
    );
    await writeFixtureFile('doc_build/llms-full.txt', content);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt projects block external URL order mismatch at position 1: found ${defaultManifest.projects[1].externalUrl}; expected ${defaultManifest.projects[0].externalUrl}.`,
    );
  });

  it.each([
    'http://evil.example.com/',
    'custom://evil.example.com/resource',
  ])('rejects an unsafe absolute link inside the projects llms-full block: %s', async (unsafeUrl) => {
    const content = transformLlmsFullBlock(
      createSyntheticLlmsFullTxt(defaultManifest),
      '/projects/index.md',
      (block) => `${block}\n- [Unsafe](${unsafeUrl})\n`,
    );
    await writeFixtureFile('doc_build/llms-full.txt', content);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt projects block contains unsafe external URL: ${unsafeUrl} at position 3.`,
    );
  });

  it('normalizes absolute HTTPS Markdown destinations before matching project URLs', async () => {
    const project = defaultManifest.projects[0];
    const projectLink = `- [${project.name}](${project.externalUrl})`;
    const projectUrl = new URL(project.externalUrl);
    const nonCanonicalUrl = `https://${projectUrl.hostname.toUpperCase()}:443${projectUrl.pathname}${projectUrl.search}${projectUrl.hash}`;
    await writeFixtureFile(
      'doc_build/llms-full.txt',
      createSyntheticLlmsFullTxt(defaultManifest).replaceAll(
        projectLink,
        `- [${project.name}](${nonCanonicalUrl})`,
      ),
    );

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('matches llms-full.txt project URLs by complete Markdown link destination', async () => {
    const projects = [
      {
        id: 'prefix',
        name: 'Prefix Project',
        url: 'https://prefix.example.com/a/',
        order: 1,
        featured: true,
        docsRoutes: [],
      },
      {
        id: 'prefix-child',
        name: 'Prefix Child Project',
        url: 'https://prefix.example.com/a/b',
        order: 2,
        featured: false,
        docsRoutes: [],
      },
    ];
    const { homepageCards, manifest } = await configureSyntheticFixture(projects);
    const shortProject = manifest.projects.find((project) => project.id === 'prefix');

    if (!shortProject) {
      throw new Error('Expected the short prefix project');
    }

    const shortProjectLink = `- [${shortProject.name}](${shortProject.externalUrl})`;
    await writeFixtureFile(
      'doc_build/llms-full.txt',
      createSyntheticLlmsFullTxt(manifest).replaceAll(shortProjectLink, ''),
    );

    const result = await runVerifier(homepageCards);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `llms-full.txt projects block is missing registered project external URL: ${shortProject.externalUrl}`,
    );
  });
});

describe('verify-build critical static asset validation', () => {
  it('accepts a complete build fixture and preserves the success output', async () => {
    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('project-registry.json');
  });

  it.each(criticalFiles)('rejects a missing critical file: %s', async (relativePath) => {
    await removeFixtureBuildFile(relativePath);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Missing critical asset: ${relativePath}`);
  });

  it('rejects a critical asset that is not a regular file', async () => {
    await removeFixtureBuildFile('favicon.svg');
    await mkdir(path.join(fixtureRoot, 'doc_build/favicon.svg'));

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical asset favicon.svg is not a regular file.');
  });

  it('rejects an empty critical asset', async () => {
    await writeFixtureFile('doc_build/robots.txt', '');

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical asset robots.txt is empty.');
  });

  it.each([
    'og-cover.png',
    'assets/hero/thqllm-title-desktop.webp',
    'assets/hero/thqllm-title-mobile.webp',
  ])('rejects a truncated image that still exposes metadata: %s', async (relativePath) => {
    await truncateFixtureImagePreservingMetadata(relativePath);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);

    if (relativePath.endsWith('.png')) {
      expect(result.stderr).toContain(`Critical image ${relativePath} is malformed PNG:`);
    } else {
      expect(result.stderr).toContain(`Critical image ${relativePath} cannot be fully decoded.`);
    }
  });

  it('rejects a valid animated PNG that Sharp otherwise treats as a static image', async () => {
    await writeAnimatedPng('og-cover.png', {
      height: 630,
      width: 1200,
    });

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Critical image og-cover.png must be static; animated PNG contains an acTL chunk.',
    );
  });

  it('reports PNG animation before validating dimensions', async () => {
    await writeAnimatedPng('og-cover.png', {
      height: 2,
      width: 2,
    });

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Critical image og-cover.png must be static; animated PNG contains an acTL chunk.',
    );
    expect(result.stderr).not.toContain('Critical image og-cover.png must be 1200x630');
  });

  it('does not mistake acTL bytes inside another PNG chunk for animation', async () => {
    await insertPngChunkAfterHeader('og-cover.png', 'tEXt', Buffer.from('Comment\0acTL marker'));

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('rejects an invalid PNG signature', async () => {
    await mutateFixturePng('og-cover.png', ({ imageBytes }) => {
      const invalidSignature = Buffer.from(imageBytes);
      invalidSignature[0] ^= 0xff;
      return invalidSignature;
    });

    const result = await runVerifier();

    expectMalformedPng(result, 'invalid PNG signature.');
  });

  it('rejects a PNG without an IEND chunk', async () => {
    await mutateFixturePng('og-cover.png', ({ chunks }) =>
      encodePngChunks(chunks.filter(({ type }) => type !== 'IEND')),
    );

    const result = await runVerifier();

    expectMalformedPng(result, 'missing IEND chunk.');
  });

  it('rejects a PNG chunk whose declared data length exceeds the file bounds', async () => {
    await mutateFixturePng('og-cover.png', ({ chunks, imageBytes }) =>
      encodePngChunks([
        chunks[0],
        createPngChunkHeader('tEXt', imageBytes.length),
        ...chunks.slice(1),
      ]),
    );

    const result = await runVerifier();

    expectMalformedPng(result, 'chunk tEXt at byte 33 exceeds file bounds.');
  });

  it('reports an out-of-bounds fake acTL chunk as malformed instead of animated', async () => {
    let malformedChunkOffset;

    await mutateFixturePng('og-cover.png', ({ chunks }) => {
      const iendIndex = chunks.findIndex(({ type }) => type === 'IEND');
      malformedChunkOffset = chunks[iendIndex].offset;

      return encodePngChunks([
        ...chunks.slice(0, iendIndex),
        createPngChunkHeader('acTL', 0xffffffff),
        ...chunks.slice(iendIndex),
      ]);
    });

    const result = await runVerifier();

    expectMalformedPng(result, `chunk acTL at byte ${malformedChunkOffset} exceeds file bounds.`);
    expect(result.stderr).not.toContain('animated PNG');
  });

  it('rejects an IEND chunk with non-zero length', async () => {
    await mutateFixturePng('og-cover.png', ({ chunks }) =>
      encodePngChunks(
        chunks.map((chunk) =>
          chunk.type === 'IEND' ? createPngChunk('IEND', Buffer.from([0])) : chunk,
        ),
      ),
    );

    const result = await runVerifier();

    expectMalformedPng(result, 'IEND chunk must have length 0; found 1.');
  });

  it('rejects a PNG chunk with a damaged CRC', async () => {
    const corruptedTextChunk = createPngChunk('tEXt', Buffer.from('Comment\0CRC'));
    corruptedTextChunk[corruptedTextChunk.length - 1] ^= 0x01;

    await mutateFixturePng('og-cover.png', ({ chunks }) =>
      encodePngChunks([chunks[0], corruptedTextChunk, ...chunks.slice(1)]),
    );

    const result = await runVerifier();

    expectMalformedPng(result, 'chunk tEXt at byte 33 has an invalid CRC.');
  });

  it('rejects trailing bytes after IEND', async () => {
    await mutateFixturePng('og-cover.png', ({ chunks }) =>
      encodePngChunks(chunks, Buffer.from('trailing')),
    );

    const result = await runVerifier();

    expectMalformedPng(result, 'IEND chunk must be the final bytes in the file.');
  });

  it('rejects a PNG whose first chunk is not IHDR', async () => {
    await mutateFixturePng('og-cover.png', ({ chunks }) =>
      encodePngChunks([createPngChunk('tEXt', Buffer.from('before IHDR')), ...chunks]),
    );

    const result = await runVerifier();

    expectMalformedPng(result, 'first chunk must be IHDR; found tEXt.');
  });

  it('rejects a PNG with duplicate IHDR chunks', async () => {
    await mutateFixturePng('og-cover.png', ({ chunks }) =>
      encodePngChunks([chunks[0], chunks[0], ...chunks.slice(1)]),
    );

    const result = await runVerifier();

    expectMalformedPng(result, 'must contain exactly one IHDR chunk.');
  });

  it('rejects an IHDR chunk whose length is not 13', async () => {
    await mutateFixturePng('og-cover.png', ({ chunks }) =>
      encodePngChunks([createPngChunk('IHDR', chunks[0].data.subarray(0, 12)), ...chunks.slice(1)]),
    );

    const result = await runVerifier();

    expectMalformedPng(result, 'IHDR chunk must have length 13; found 12.');
  });

  it('rejects a PNG without an IDAT chunk', async () => {
    await mutateFixturePng('og-cover.png', ({ chunks }) =>
      encodePngChunks(chunks.filter(({ type }) => type !== 'IDAT')),
    );

    const result = await runVerifier();

    expectMalformedPng(result, 'missing IDAT chunk.');
  });

  it('rejects a PNG chunk type containing non-letter bytes', async () => {
    await mutateFixturePng('og-cover.png', ({ chunks }) =>
      encodePngChunks([
        chunks[0],
        createPngChunk('tE1t', Buffer.from('invalid type')),
        ...chunks.slice(1),
      ]),
    );

    const result = await runVerifier();

    expectMalformedPng(
      result,
      'chunk type at byte 33 must contain four ASCII letters; found tE1t.',
    );
  });

  it('rejects a PNG chunk type with a lowercase reserved byte', async () => {
    await mutateFixturePng('og-cover.png', ({ chunks }) =>
      encodePngChunks([
        chunks[0],
        createPngChunk('texT', Buffer.from('invalid reserved bit')),
        ...chunks.slice(1),
      ]),
    );

    const result = await runVerifier();

    expectMalformedPng(result, 'chunk texT at byte 33 must use an uppercase reserved type byte.');
  });

  it('rejects a multi-frame WebP used as a static hero asset', async () => {
    const relativePath = 'assets/hero/thqllm-title-desktop.webp';
    await writeAnimatedWebp(relativePath);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `Critical image ${relativePath} must contain exactly one frame; found 2.`,
    );
  });

  it('rejects an OG cover encoded in the wrong format', async () => {
    await writeGeneratedImage('og-cover.png', {
      format: 'webp',
      height: 630,
      width: 1200,
    });

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical image og-cover.png must be PNG; found webp.');
  });

  it('rejects a hero image encoded in the wrong format', async () => {
    const relativePath = 'assets/hero/thqllm-title-desktop.webp';
    await writeGeneratedImage(relativePath, {
      format: 'png',
      height: 1080,
      width: 1920,
    });

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Critical image ${relativePath} must be WebP; found png.`);
  });

  it.each([
    ['og-cover.png', 'png', 1199, 630, '1200x630'],
    ['assets/hero/thqllm-title-desktop.webp', 'webp', 1919, 1080, '1920x1080'],
    ['assets/hero/thqllm-title-mobile.webp', 'webp', 1079, 1440, '1080x1440'],
  ])('rejects an image with the wrong dimensions: %s', async (relativePath, format, width, height, expectedDimensions) => {
    await writeGeneratedImage(relativePath, { format, height, width });

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `Critical image ${relativePath} must be ${expectedDimensions}; found ${width}x${height}.`,
    );
  });

  it.each([
    ['og-cover.png', 'png', 1200, 630],
    ['assets/hero/thqllm-title-desktop.webp', 'webp', 1920, 1080],
    ['assets/hero/thqllm-title-mobile.webp', 'webp', 1080, 1440],
  ])('rejects a correct-size solid-color image: %s', async (relativePath, format, width, height) => {
    await writeGeneratedImage(relativePath, { format, height, width });

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `Critical image ${relativePath} must not be a solid-color or blank image.`,
    );
  });

  it('rejects a nearly transparent RGBA image with only one alpha=1 pixel', async () => {
    await writeNearlyTransparentPng('og-cover.png', {
      height: 630,
      width: 1200,
    });

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical image og-cover.png has insufficient visible pixels:');
  });

  it('rejects an RGB image whose only variation is one channel changing from 32 to 33', async () => {
    await writeNearlySolidPng('og-cover.png', {
      height: 630,
      width: 1200,
    });

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Critical image og-cover.png has insufficient visible color variation:',
    );
  });

  it('rejects an opaque sparse PNG with only 100 white pixels', async () => {
    await writeSparsePng('og-cover.png', {
      changedPixels: 100,
      height: 630,
      width: 1200,
    });

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Critical image og-cover.png has insufficient meaningful pixel ratio:',
    );
    expect(result.stderr).toContain('0.0132% is below 1.00%');
  });

  it('accepts an alpha-only PNG with enough opacity variation', async () => {
    await writeAlphaOnlyPng('og-cover.png', {
      height: 630,
      width: 1200,
    });

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('rejects fully transparent random RGB data', async () => {
    await writeTransparentRandomRgbPng('og-cover.png', {
      height: 630,
      width: 1200,
    });

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical image og-cover.png has insufficient visible pixels:');
  });

  it.each([1, 2, 4])('accepts a varied PNG with %s raw channels', async (channels) => {
    await writeVariedPng('og-cover.png', {
      channels,
      height: 630,
      width: 1200,
    });

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('rejects malformed SVG XML', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path></svg',
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical asset favicon.svg is not valid SVG XML.');
  });

  it('rejects an SVG root without the SVG namespace', async () => {
    await writeFixtureFile('doc_build/favicon.svg', '<svg viewBox="0 0 64 64"></svg>');

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Critical asset favicon.svg must use namespace http://www.w3.org/2000/svg; found none.',
    );
  });

  it('reports favicon rendering failures with asset context', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100000 100000"><rect width="100000" height="100000" fill="#111"/></svg>',
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical asset favicon.svg cannot be rendered and decoded.');
    expect(result.stderr).toContain('Input image exceeds pixel limit');
  });

  it('rejects an empty SVG with valid structure', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"></svg>',
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical asset favicon.svg has insufficient visible pixels:');
  });

  it('rejects a fully transparent SVG drawing', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#fff" fill-opacity="0"/></svg>',
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical asset favicon.svg has insufficient visible pixels:');
  });

  it('rejects a solid-color SVG drawing', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#111"/></svg>',
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Critical asset favicon.svg must not be a solid-color or blank image.',
    );
  });

  it('rejects a nearly empty SVG drawing', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#000"/><rect width="1" height="1" fill="#fff"/></svg>',
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Critical asset favicon.svg has insufficient meaningful pixel ratio:',
    );
    expect(result.stderr).toContain('is below 1.00%');
  });

  it('rejects hexadecimal viewBox tokens', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0x40 0x40"></svg>',
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical asset favicon.svg must have a valid viewBox.');
  });

  it('accepts decimal and scientific-notation viewBox tokens with mixed ASCII separators', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="\t-1e1,\r\n-.5 6.4e1,\t6.4E+1\n"><rect x="-10" y="-.5" width="64" height="64" fill="#111"/><circle cx="22" cy="31.5" r="12" fill="#fff"/></svg>',
    );

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('rejects a non-breaking space as a viewBox separator', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0\u00a00 64 64"></svg>',
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical asset favicon.svg must have a valid viewBox.');
  });

  it('rejects a double comma in viewBox', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0,,0 64 64"></svg>',
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical asset favicon.svg must have a valid viewBox.');
  });

  it('rejects an SVG without a valid viewBox', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 64"></svg>',
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical asset favicon.svg must have a valid viewBox.');
  });

  it('rejects robots.txt without the canonical sitemap directive', async () => {
    await writeFixtureFile('doc_build/robots.txt', 'User-agent: *\nAllow: /\n');

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'robots.txt is missing required directive: Sitemap: https://thqllm.com/sitemap.xml',
    );
  });

  it('rejects Allow from another bot as a decoy for a wildcard Disallow group', async () => {
    await writeFixtureFile(
      'doc_build/robots.txt',
      `User-agent: *
Disallow: /

User-agent: ReviewerBot
Allow: /

Sitemap: https://thqllm.com/sitemap.xml
`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'robots.txt wildcard group 1 must not contain non-empty Disallow: /.',
    );
  });

  it('rejects a wildcard group without Allow even when another bot allows root', async () => {
    await writeFixtureFile(
      'doc_build/robots.txt',
      `User-agent: *
Disallow:

User-agent: ReviewerBot
Allow: /

Sitemap: https://thqllm.com/sitemap.xml
`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('robots.txt wildcard group 1 must include Allow: /.');
  });

  it('requires every wildcard group to be safe', async () => {
    await writeFixtureFile(
      'doc_build/robots.txt',
      `User-agent: *
Allow: /

User-agent: *
Allow: /
Disallow: /

Sitemap: https://thqllm.com/sitemap.xml
`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'robots.txt wildcard group 2 must not contain non-empty Disallow: /.',
    );
  });

  it.each([
    '/*',
    '/private',
  ])('rejects a wildcard group with non-empty Disallow: %s', async (disallowPath) => {
    await writeFixtureFile(
      'doc_build/robots.txt',
      `User-agent: *
Allow: /
Disallow: ${disallowPath}

Sitemap: https://thqllm.com/sitemap.xml
`,
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `robots.txt wildcard group 1 must not contain non-empty Disallow: ${disallowPath}.`,
    );
  });

  it('keeps a robots group together across blank lines', async () => {
    await writeFixtureFile(
      'doc_build/robots.txt',
      `User-agent: *

User-agent: ReviewerBot

Allow: /
Disallow:

Sitemap: https://thqllm.com/sitemap.xml
`,
    );

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('parses CR-only robots.txt line endings', async () => {
    await writeFixtureFile(
      'doc_build/robots.txt',
      'User-agent: *\rAllow: /\rDisallow:\rSitemap: https://thqllm.com/sitemap.xml\r',
    );

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('accepts comments and consecutive user agents in one safe wildcard group', async () => {
    await writeFixtureFile(
      'doc_build/robots.txt',
      `# shared crawler policy
User-agent: * # wildcard
User-agent: ReviewerBot
Allow: / # public root
Disallow: # an empty rule permits the whole site

Sitemap: https://thqllm.com/sitemap.xml # canonical
`,
    );

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('ignores comment-only lines inside a robots group', async () => {
    await writeFixtureFile(
      'doc_build/robots.txt',
      `User-agent: *
# keep consecutive agents in the same group
User-agent: ReviewerBot
# keep rules attached to both agents
Allow: /
Disallow:

Sitemap: https://thqllm.com/sitemap.xml
`,
    );

    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});

describe('verify-build homepage critical asset references', () => {
  it('rejects canonical body decoys when the real head and hero references are wrong', async () => {
    const result = await runVerifier(canonicalCards, {
      bodyDecoys: createCanonicalBodyDecoys(),
      desktopHero: '/assets/hero/wrong-desktop.webp',
      favicon: '/wrong-favicon.svg',
      mobileHero: '/assets/hero/wrong-mobile.webp',
      ogImage: 'https://thqllm.com/wrong-cover.png',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html is missing exact OG image reference: https://thqllm.com/og-cover.png',
    );
  });

  it('rejects duplicate head OG image metas when the real value is wrong and the extra is canonical', async () => {
    const result = await runVerifier(canonicalCards, {
      extraHeadOgImages: [expectedHomepageReferences.ogImage],
      ogImage: 'https://thqllm.com/wrong-cover.png',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html must contain exactly one head OG image meta; found 2.',
    );
  });

  it.each([
    ['missing', null],
    ['wrong', 'https://thqllm.com/wrong-cover.png'],
  ])('rejects a %s OG image reference', async (_case, ogImage) => {
    const result = await runVerifier(canonicalCards, { ogImage });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html is missing exact OG image reference: https://thqllm.com/og-cover.png',
    );
  });

  it.each([
    ['missing', null],
    ['wrong', '/assets/hero/wrong-desktop.webp'],
  ])('rejects a %s desktop hero reference', async (_case, desktopHero) => {
    const result = await runVerifier(canonicalCards, { desktopHero });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html is missing exact desktop hero image reference: /assets/hero/thqllm-title-desktop.webp',
    );
  });

  it.each([
    ['missing', null],
    ['wrong', '/assets/hero/wrong-mobile.webp'],
  ])('rejects a %s mobile hero reference', async (_case, mobileHero) => {
    const result = await runVerifier(canonicalCards, { mobileHero });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html is missing exact mobile hero source reference: /assets/hero/thqllm-title-mobile.webp',
    );
  });

  it('rejects a missing head favicon link', async () => {
    const result = await runVerifier(canonicalCards, { favicon: null });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html is missing exact favicon reference: /favicon.svg',
    );
  });

  it('rejects a wrong favicon reference', async () => {
    const result = await runVerifier(canonicalCards, { favicon: '/wrong-favicon.svg' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html is missing exact favicon reference: /favicon.svg',
    );
  });

  it('rejects duplicate head icon links when the real value is wrong and the extra is canonical', async () => {
    const result = await runVerifier(canonicalCards, {
      extraHeadFavicons: [expectedHomepageReferences.favicon],
      favicon: '/wrong-favicon.svg',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html must contain exactly one head icon link; found 2.',
    );
  });

  it('rejects a missing hero section even when canonical hero decoys exist in the body', async () => {
    const result = await runVerifier(canonicalCards, {
      bodyDecoys: createCanonicalBodyDecoys(),
      heroSectionCount: 0,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html must contain exactly one section[data-danmaku-root]; found 0.',
    );
  });

  it('rejects duplicate hero sections', async () => {
    const result = await runVerifier(canonicalCards, { heroSectionCount: 2 });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html must contain exactly one section[data-danmaku-root]; found 2.',
    );
  });

  it('rejects a missing direct hero picture even when canonical references are nested elsewhere', async () => {
    const result = await runVerifier(canonicalCards, {
      heroPictureCount: 0,
      heroSectionExtras: createCanonicalBodyDecoys(),
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html hero section must contain exactly one direct picture; found 0.',
    );
  });

  it('rejects duplicate direct hero pictures', async () => {
    const result = await runVerifier(canonicalCards, { heroPictureCount: 2 });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html hero section must contain exactly one direct picture; found 2.',
    );
  });

  it('rejects a wrong desktop image plus a canonical extra image in the hero picture', async () => {
    const result = await runVerifier(canonicalCards, {
      desktopHero: '/assets/hero/wrong-desktop.webp',
      extraHeroImages: [expectedHomepageReferences.desktopHero],
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html hero picture must contain exactly one direct desktop img; found 2.',
    );
  });

  it('rejects a wrong mobile source plus a canonical extra source in the hero picture', async () => {
    const result = await runVerifier(canonicalCards, {
      extraHeroSources: [
        {
          media: expectedHomepageReferences.mobileHeroMedia,
          srcset: expectedHomepageReferences.mobileHero,
        },
      ],
      mobileHero: '/assets/hero/wrong-mobile.webp',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html hero picture must contain exactly one direct mobile source; found 2.',
    );
  });

  it('rejects a canonical mobile source with the wrong media query', async () => {
    const result = await runVerifier(canonicalCards, {
      mobileHeroMedia: '(min-width: 1px)',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html mobile hero source must use media (max-width: 640px); found (min-width: 1px).',
    );
  });

  it('accepts image/webp on the mobile hero source', async () => {
    const result = await runVerifier(canonicalCards, {
      mobileHeroType: 'image/webp',
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('rejects an unsupported mobile hero source type', async () => {
    const result = await runVerifier(canonicalCards, {
      mobileHeroType: 'image/png',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html mobile hero source type must be absent or image/webp; found image/png.',
    );
  });

  it('rejects a mobile source placed after the desktop fallback image', async () => {
    const result = await runVerifier(canonicalCards, {
      sourceAfterImage: true,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html mobile hero source must appear before the desktop fallback img.',
    );
  });

  it('rejects a desktop fallback image with a non-empty srcset', async () => {
    const result = await runVerifier(canonicalCards, {
      desktopHeroSrcset: '/assets/hero/wrong-desktop.webp 2x',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html desktop hero img must not define a non-empty srcset.',
    );
  });

  it('rejects a desktop fallback image with non-empty sizes', async () => {
    const result = await runVerifier(canonicalCards, {
      desktopHeroSizes: '100vw',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html desktop hero img must not define non-empty sizes.',
    );
  });

  it.each([
    '1x',
    '1.0x',
    '1e0x',
  ])('accepts the canonical mobile srcset with a %s density descriptor', async (descriptor) => {
    const result = await runVerifier(canonicalCards, {
      mobileHero: `${expectedHomepageReferences.mobileHero} ${descriptor}`,
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it.each([
    '1.x',
    '1w',
  ])('rejects invalid mobile srcset descriptor syntax: %s', async (descriptor) => {
    const result = await runVerifier(canonicalCards, {
      mobileHero: `${expectedHomepageReferences.mobileHero} ${descriptor}`,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `doc_build/index.html mobile hero source srcset has invalid candidate syntax: ${expectedHomepageReferences.mobileHero} ${descriptor}.`,
    );
  });

  it('rejects a valid mobile density descriptor other than 1x', async () => {
    const result = await runVerifier(canonicalCards, {
      mobileHero: `${expectedHomepageReferences.mobileHero} 2x`,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html mobile hero source descriptor must be absent or 1x; found 2x.',
    );
  });

  it('rejects a mobile srcset with multiple candidates', async () => {
    const result = await runVerifier(canonicalCards, {
      mobileHero: `${expectedHomepageReferences.mobileHero} 1x, /assets/hero/wrong-mobile.webp 2x`,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html mobile hero source srcset must contain exactly one candidate; found 2.',
    );
  });
});

describe('verify-build homepage project validation', () => {
  it('rejects a hidden canonical project section beside a visible malicious duplicate', async () => {
    const maliciousCard = createProjectCard({
      ...defaultCards[0],
      url: 'javascript:alert(1)',
    });
    const result = await runVerifier(defaultCards, {
      extraProjectSections: [`<section id="projects">${maliciousCard}</section>`],
      projectsSectionAttributes: 'hidden',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html must contain exactly one section#projects; found 2.',
    );
  });

  it('rejects two normal project sections', async () => {
    const duplicateCards = defaultCards.map(createProjectCard).join('');
    const result = await runVerifier(defaultCards, {
      extraProjectSections: [`<section id="projects">${duplicateCards}</section>`],
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html must contain exactly one section#projects; found 2.',
    );
  });

  it.each([
    ['hidden', 'hidden'],
    ['aria-hidden', 'aria-hidden="true"'],
    ['inline style', 'style="opacity: 0"'],
  ])('rejects a unique project section with %s', async (_label, projectsSectionAttributes) => {
    const result = await runVerifier(defaultCards, { projectsSectionAttributes });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html section#projects and its ancestors must be visible without inline style.',
    );
  });

  it.each([
    ['wrapper inline style', { projectsSectionAncestorAttributes: 'style="opacity: 0"' }],
    ['body inline style', { bodyAttributes: 'style="clip-path: inset(100%)"' }],
    ['html aria-hidden', { htmlAttributes: 'aria-hidden="true"' }],
  ])('rejects a project section with a hidden or styled %s ancestor', async (_label, override) => {
    const result = await runVerifier(defaultCards, override);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html section#projects and its ancestors must be visible without inline style.',
    );
  });

  it('rejects a project card outside the unique project section', async () => {
    const result = await runVerifier(defaultCards, {
      rogueProjectCards: [
        {
          ...defaultCards[0],
          documented: false,
          id: 'rogue',
          name: 'Rogue Project',
          url: 'javascript:alert(1)',
        },
      ],
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html contains project card outside section#projects.',
    );
  });

  it('rejects a project card without a non-empty name', async () => {
    const result = await runVerifier([{ ...defaultCards[0], name: '   ' }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card 1 must have a non-empty project name.',
    );
  });

  it('rejects surrounding whitespace in a rendered project card name', async () => {
    const result = await runVerifier([{ ...defaultCards[0], name: ' Alpha Project ' }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card 1 name must not include surrounding whitespace.',
    );
  });

  it('rejects a project card without a safe HTTPS external link', async () => {
    const result = await runVerifier([{ ...defaultCards[0], url: 'http://alpha.example.com/' }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project must include exactly one safe HTTPS external link.',
    );
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'ftp://files.example.com/',
  ])('rejects an unsafe project card link protocol: %s', async (href) => {
    const result = await runVerifier([{ ...defaultCards[0], extraLinks: [href] }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `doc_build/index.html project card for Alpha Project contains unsafe link protocol: ${new URL(href, `${siteOrigin}/`).protocol}`,
    );
  });

  it('rejects a project card without the stable external-link marker', async () => {
    const result = await runVerifier([{ ...defaultCards[0], mainLinkMarker: false }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project must contain exactly one [data-project-external-link].',
    );
  });

  it('rejects duplicate stable external-link markers', async () => {
    const result = await runVerifier([
      {
        ...defaultCards[0],
        extraLinks: [{ href: '/docs/example/', marker: true }],
      },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project must contain exactly one [data-project-external-link].',
    );
  });

  it('rejects a stable external-link marker placed on an internal docs link', async () => {
    const result = await runVerifier([
      {
        ...defaultCards[0],
        mainLinkMarker: false,
        extraLinks: [
          {
            href: '/docs/example/',
            marker: true,
            rel: 'noreferrer noopener',
            target: '_blank',
          },
        ],
      },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project must include exactly one safe HTTPS external link.',
    );
  });

  it('does not let a hidden safe marker conceal a dangerous primary action', async () => {
    const project = defaultCards[0];
    const result = await runVerifier([
      {
        ...project,
        url: 'javascript:alert(1)',
        mainLinkMarker: false,
        extraLinks: [
          {
            href: project.url,
            hidden: true,
            marker: true,
            rel: 'noreferrer noopener',
            target: '_blank',
          },
        ],
      },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project contains unsafe link protocol: javascript:',
    );
  });

  it.each([
    ['hidden anchor', { hidden: true }],
    ['aria-hidden anchor', { ariaHidden: true }],
    ['hidden ancestor', { ancestorHidden: true }],
    ['aria-hidden ancestor', { ancestorAriaHidden: true }],
    ['display-none ancestor', { ancestorStyle: 'display: none' }],
    ['visibility-hidden ancestor', { ancestorStyle: 'visibility: hidden' }],
  ])('does not let a canonical marker concealed by a %s hide a visible wrong same-origin action', async (_label, hiddenConfig) => {
    const project = defaultCards[0];
    const result = await runVerifier([
      {
        ...project,
        url: '/projects/alpha/',
        mainLinkMarker: false,
        extraLinks: [
          {
            href: project.url,
            ...hiddenConfig,
            ariaLabel: `进入 ${project.name}`,
            marker: true,
            rel: 'noreferrer noopener',
            target: '_blank',
            text: '进入项目',
          },
        ],
      },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project marked external link must be visible.',
    );
  });

  it.each([
    ['text', { mainLinkText: '打开项目' }],
    ['aria-label', { mainLinkAriaLabel: '打开 Alpha Project' }],
  ])('rejects a marked external link with the wrong production %s', async (_label, override) => {
    const result = await runVerifier([{ ...defaultCards[0], ...override }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project marked external link must use the production main action.',
    );
  });

  it.each([
    ['inline style', { mainLinkStyle: 'opacity: 0' }],
    ['class', { mainLinkClass: 'visually-hidden' }],
    ['negative tab order -1', { mainLinkTabIndex: '-1' }],
    ['negative tab order -2', { mainLinkTabIndex: '-2' }],
  ])('rejects a marked external link with a forbidden %s', async (_label, override) => {
    const result = await runVerifier([{ ...defaultCards[0], ...override }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project marked external link must be visible.',
    );
  });

  it('rejects a marked external link outside the project actions container', async () => {
    const result = await runVerifier([{ ...defaultCards[0], mainLinkOutsideActions: true }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project anchors must be direct children of [data-project-actions].',
    );
  });

  it('rejects inline style on an ancestor between the external link and card', async () => {
    const result = await runVerifier([{ ...defaultCards[0], actionsStyle: 'opacity: 0' }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project marked external link must be visible.',
    );
  });

  it('rejects a hidden canonical link behind a visible wrong same-origin action', async () => {
    const project = defaultCards[0];
    const result = await runVerifier([
      {
        ...project,
        documented: false,
        url: '/docs/alpha/',
        mainLinkMarker: false,
        extraLinks: [
          {
            href: project.url,
            ariaLabel: `进入 ${project.name}`,
            className: 'visually-hidden',
            marker: true,
            rel: 'noreferrer noopener',
            target: '_blank',
            text: '进入项目',
          },
        ],
      },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project marked external link must be visible.',
    );
  });

  it('rejects a canonical external marker that is not the first project action', async () => {
    const project = defaultCards[0];
    const result = await runVerifier([
      {
        ...project,
        documented: false,
        url: '/docs/alpha/',
        mainLinkMarker: false,
        extraLinks: [
          {
            href: project.url,
            ariaLabel: `进入 ${project.name}`,
            marker: true,
            rel: 'noreferrer noopener',
            target: '_blank',
            text: '进入项目',
          },
        ],
      },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project marked external link must be the first direct anchor in [data-project-actions].',
    );
  });

  it('requires exactly one stable project actions container', async () => {
    const missingResult = await runVerifier([{ ...defaultCards[0], actionsMarker: false }]);

    expect(missingResult.status).not.toBe(0);
    expect(missingResult.stderr).toContain(
      'doc_build/index.html project card for Alpha Project must contain exactly one [data-project-actions].',
    );

    const duplicateResult = await runVerifier([
      { ...defaultCards[0], extraActionsContainer: true },
    ]);

    expect(duplicateResult.status).not.toBe(0);
    expect(duplicateResult.stderr).toContain(
      'doc_build/index.html project card for Alpha Project must contain exactly one [data-project-actions].',
    );
  });

  it('rejects an unsafe protocol-relative external link beside the project link', async () => {
    const result = await runVerifier([{ ...defaultCards[0], extraLinks: ['//evil.example.com/'] }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project must include exactly one safe HTTPS external link.',
    );
  });

  it('rejects an absolute docs href even when it has the canonical same-origin destination', async () => {
    const result = await runVerifier([
      { ...defaultCards[0], docsHref: 'https://thqllm.com/docs/alpha/' },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project docs link must target /docs/alpha/.',
    );
  });

  it('rejects an extra same-origin anchor in a project card', async () => {
    const result = await runVerifier([
      { ...defaultCards[0], extraLinks: ['/projects/alpha/details/'] },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project must contain exactly 2 allowed links; found 3.',
    );
  });

  it('rejects a documented project card with the wrong docs href', async () => {
    const result = await runVerifier([{ ...defaultCards[0], docsHref: '/docs/not-alpha/' }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project docs link must target /docs/alpha/.',
    );
  });

  it('rejects a documented project card without the stable docs marker', async () => {
    const result = await runVerifier([{ ...defaultCards[0], docsMarker: false }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project docs link must be the second direct anchor with [data-project-docs-link].',
    );
  });

  it('rejects a documented project link outside the project actions container', async () => {
    const result = await runVerifier([{ ...defaultCards[0], docsLinkOutsideActions: true }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project anchors must be direct children of [data-project-actions].',
    );
  });

  it('rejects a documented project card without its docs anchor', async () => {
    const result = await runVerifier([{ ...defaultCards[0], documented: false }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Alpha Project must contain exactly 2 allowed links; found 1.',
    );
  });

  it('rejects a docs anchor on an undocumented project card', async () => {
    const { homepageCards } = await configureSyntheticFixture([
      {
        id: 'undocumented',
        name: 'Undocumented Project',
        url: 'https://undocumented.example.com/',
        order: 1,
        featured: true,
        docsRoutes: [],
      },
    ]);
    const result = await runVerifier([
      {
        ...homepageCards[0],
        documented: true,
        docsHref: '/docs/undocumented/',
      },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html project card for Undocumented Project must contain exactly 1 allowed link; found 2.',
    );
  });

  it('rejects an unregistered extra homepage card', async () => {
    const result = await runVerifier([...defaultCards, fourthCard]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html section#projects has unexpected project card: Fourth Project',
    );
  });

  it('rejects a missing featured homepage card', async () => {
    const result = await runVerifier([]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html section#projects is missing project card: Alpha Project',
    );
  });

  it('rejects a homepage card order change', async () => {
    const projects = syntheticProjects.map((project) => ({ ...project, featured: true }));
    const { homepageCards } = await configureSyntheticFixture(projects);

    const result = await runVerifier([...homepageCards].reverse());

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html section#projects project card order does not match the manifest.',
    );
  });

  it('rejects duplicate project card names', async () => {
    const projects = syntheticProjects.map((project) => ({ ...project, featured: true }));
    const { homepageCards } = await configureSyntheticFixture(projects);
    const result = await runVerifier([
      homepageCards[0],
      { ...homepageCards[1], name: homepageCards[0].name },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html contains duplicate project card name: Alpha Project',
    );
  });

  it('rejects duplicate project card external links', async () => {
    const projects = syntheticProjects.map((project) => ({ ...project, featured: true }));
    const { homepageCards } = await configureSyntheticFixture(projects);
    const result = await runVerifier([
      homepageCards[0],
      { ...homepageCards[1], url: homepageCards[0].url },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html contains duplicate project card external URL: https://alpha.example.com/',
    );
  });
});

describe('verify-build full project directory validation', () => {
  it('rejects an unregistered extra directory card', async () => {
    await writeProjectDirectory([...defaultDirectoryCards, fourthCard]);

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/projects/index.html section#projects has unexpected project card: Fourth Project',
    );
  });

  it('rejects a missing directory card', async () => {
    await writeProjectDirectory(defaultDirectoryCards.slice(0, 1));

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/projects/index.html section#projects is missing project card: Beta Project',
    );
  });

  it('rejects a directory card order change', async () => {
    await writeProjectDirectory([...defaultDirectoryCards].reverse());

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/projects/index.html section#projects project card order does not match the manifest.',
    );
  });
});
