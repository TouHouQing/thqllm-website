import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptSource = path.join(import.meta.dirname, 'verify-build.mjs');
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

function createProjectCard({ name, url }) {
  return `
    <article data-testid="project-stage">
      <h3>${name}</h3>
      <a href="${url}" target="_blank" rel="noreferrer noopener">进入项目</a>
      <a href="/docs/example/">使用文档</a>
    </article>
  `;
}

async function writeFixtureFile(relativePath, content) {
  const outputPath = path.join(fixtureRoot, relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content);
}

async function runVerifier(cards) {
  await writeFixtureFile(
    'doc_build/index.html',
    `<html><body><section id="projects">${cards.map(createProjectCard).join('')}</section></body></html>`,
  );

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
