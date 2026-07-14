import { access, lstat, readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const buildDir = path.join(repoRoot, 'doc_build');
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

const projectsSection = homepageDom?.window.document.querySelector('section#projects');
if (!projectsSection) {
  throw new Error('doc_build/index.html is missing section#projects.');
}

const projectStages = [...projectsSection.querySelectorAll('[data-testid="project-stage"]')];
if (projectStages.length !== 3) {
  throw new Error(
    `section#projects must contain exactly 3 project-stage cards; found ${projectStages.length}.`,
  );
}

const expectedProjects = [
  ['FluctGraph', 'https://graph.tohoqing.com/'],
  ['THQ API', 'https://sub.thqllm.com/'],
  ['Toho Image Studio', 'https://img.tohoqing.com/'],
];

for (const [index, [projectName, projectUrl]] of expectedProjects.entries()) {
  const projectStage = projectStages[index];
  const projectText = projectStage.textContent ?? '';

  if (!projectText.includes(projectName)) {
    throw new Error(`Project stage ${index + 1} is missing expected project: ${projectName}`);
  }

  const links = [...projectStage.querySelectorAll('a[href]')].map((link) =>
    link.getAttribute('href'),
  );
  if (!links.includes(projectUrl)) {
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
