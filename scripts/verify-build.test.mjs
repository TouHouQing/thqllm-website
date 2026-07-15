import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptSource = path.join(import.meta.dirname, 'verify-build.mjs');
const publicAssetsRoot = path.join(repoRoot, 'site/public');
const expectedHomepageReferences = {
  desktopHero: '/assets/hero/thqllm-title-desktop.webp',
  favicon: '/favicon.svg',
  mobileHero: '/assets/hero/thqllm-title-mobile.webp',
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
  const references = {
    ...expectedHomepageReferences,
    ...referenceOverrides,
  };
  const ogImage =
    references.ogImage === null ? '' : `<meta property="og:image" content="${references.ogImage}">`;
  const favicon =
    references.favicon === null
      ? ''
      : `<link rel="icon" href="${references.favicon}" type="image/svg+xml">`;
  const mobileHero =
    references.mobileHero === null
      ? ''
      : `<source media="(max-width: 640px)" srcset="${references.mobileHero}">`;
  const desktopHero =
    references.desktopHero === null ? '' : `<img src="${references.desktopHero}" alt="">`;

  return `
    <html>
      <head>
        ${ogImage}
        ${favicon}
      </head>
      <body>
        <picture>
          ${mobileHero}
          ${desktopHero}
        </picture>
        <section id="projects">${cards.map(createProjectCard).join('')}</section>
      </body>
    </html>
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

  return spawnSync(process.execPath, [path.join(fixtureRoot, 'scripts/verify-build.mjs')], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
}

beforeEach(async () => {
  fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-verify-build-'));
  await mkdir(path.join(fixtureRoot, 'scripts'), { recursive: true });
  await symlink(path.join(repoRoot, 'node_modules'), path.join(fixtureRoot, 'node_modules'), 'dir');
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

  it('rejects malformed SVG XML', async () => {
    await writeFixtureFile(
      'doc_build/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path></svg',
    );

    const result = await runVerifier();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Critical asset favicon.svg is not valid SVG XML.');
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
});

describe('verify-build homepage critical asset references', () => {
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

  it('rejects a wrong favicon reference', async () => {
    const result = await runVerifier(canonicalCards, { favicon: '/wrong-favicon.svg' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'doc_build/index.html is missing exact favicon reference: /favicon.svg',
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
