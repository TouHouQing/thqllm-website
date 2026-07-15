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
const canonicalCards = [
  {
    name: 'FluctGraph',
    url: 'https://graph.tohoqing.com/',
  },
  {
    name: 'THQ API',
    url: 'https://sub.thqllm.com/',
  },
  {
    name: 'Toho Image Studio',
    url: 'https://img.tohoqing.com/',
  },
];
const fourthCard = {
  name: 'Fourth Project',
  url: 'https://fourth.example.com/',
};
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const crc32Table = Array.from({ length: 256 }, (_, value) => {
  let checksum = value;

  for (let bit = 0; bit < 8; bit += 1) {
    checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
  }

  return checksum >>> 0;
});

let fixtureRoot;

function createProjectCard({ extraLinks = [], name, url }) {
  return `
    <article data-testid="project-stage">
      <h3>${name}</h3>
      <a href="${url}" target="_blank" rel="noreferrer noopener">进入项目</a>
      ${extraLinks.map((href) => `<a href="${href}">附加链接</a>`).join('')}
      <a href="/docs/example/">使用文档</a>
    </article>
  `;
}

function createHomepage(cards, referenceOverrides = {}) {
  const structure = {
    bodyDecoys: '',
    desktopHeroSizes: null,
    desktopHeroSrcset: null,
    extraHeadFavicons: [],
    extraHeadOgImages: [],
    extraHeroImages: [],
    extraHeroSources: [],
    heroPictureCount: 1,
    heroSectionCount: 1,
    heroSectionExtras: '',
    mobileHeroType: null,
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

  return `
    <html>
      <head>
        ${ogImages}
        ${favicons}
      </head>
      <body>
        ${heroSections}
        ${structure.bodyDecoys}
        <section id="projects">${cards.map(createProjectCard).join('')}</section>
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

async function runVerifier(cards = canonicalCards, referenceOverrides = {}) {
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

  for (const output of [
    '404.html',
    'projects/index.html',
    'notes/index.html',
    'about/index.html',
    'docs/fluctgraph/index.html',
    'docs/thq-api/index.html',
    'docs/toho-image-studio/index.html',
  ]) {
    await writeFixtureFile(`doc_build/${output}`, '<html><body>Verified output</body></html>');
  }

  await writeFixtureFile('doc_build/sitemap.xml', '<urlset></urlset>');
  await writeFixtureFile('doc_build/llms.txt', 'Verified output');
  await writeFixtureFile(
    'doc_build/llms-full.txt',
    canonicalCards.map((project) => project.url).join('\n'),
  );
});

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe('verify-build critical static asset validation', () => {
  it('accepts a complete build fixture and preserves the success output', async () => {
    const result = await runVerifier();

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('Verified 11 static outputs and site copy.');
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
    expect(result.stderr).toContain(`Critical image ${relativePath} cannot be fully decoded.`);
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
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="\t-1e1,\r\n-.5 6.4e1,\t6.4E+1\n"></svg>',
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
  it('accepts a synthetic fourth project card in any registry order', async () => {
    const result = await runVerifier([
      fourthCard,
      canonicalCards[2],
      canonicalCards[0],
      canonicalCards[1],
    ]);

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('rejects a project card without a non-empty name', async () => {
    const result = await runVerifier([...canonicalCards, { ...fourthCard, name: '   ' }]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Project stage 4 must have a non-empty project name.');
  });

  it('rejects a project card without a safe HTTPS external link', async () => {
    const result = await runVerifier([
      ...canonicalCards,
      { ...fourthCard, url: 'http://fourth.example.com/' },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Project stage for Fourth Project must include exactly one HTTPS external link.',
    );
  });

  it('rejects an unsafe protocol-relative external link beside the project link', async () => {
    const result = await runVerifier([
      ...canonicalCards,
      { ...fourthCard, extraLinks: ['//evil.example.com/'] },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Project stage for Fourth Project must include exactly one HTTPS external link.',
    );
  });

  it('ignores a same-origin absolute docs link when classifying external links', async () => {
    const result = await runVerifier([
      ...canonicalCards,
      { ...fourthCard, extraLinks: ['https://thqllm.com/docs/example/'] },
    ]);

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('rejects duplicate project card names', async () => {
    const result = await runVerifier([
      ...canonicalCards,
      { ...fourthCard, name: canonicalCards[0].name },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Duplicate project stage name: FluctGraph');
  });

  it('rejects duplicate project card external links', async () => {
    const result = await runVerifier([
      ...canonicalCards,
      { ...fourthCard, url: canonicalCards[0].url },
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Duplicate project stage external link: https://graph.tohoqing.com/',
    );
  });
});
