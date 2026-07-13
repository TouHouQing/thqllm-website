import { access, readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';

const buildDir = path.resolve('doc_build');
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
  try {
    await access(path.join(buildDir, output));
  } catch {
    throw new Error(`Missing required static output: ${output}`);
  }
}

for (const htmlFile of await collectHtmlFiles(buildDir)) {
  const html = await readFile(htmlFile, 'utf8');
  const forbiddenTerm = ['智能结界', '结界'].find((term) => html.includes(term));

  if (forbiddenTerm) {
    throw new Error(
      `Forbidden term "${forbiddenTerm}" found in ${path.relative(process.cwd(), htmlFile)}.`,
    );
  }
}

const homepage = await readFile(path.join(buildDir, 'index.html'), 'utf8');
for (const projectName of ['FluctGraph', 'THQ API', 'Toho Image Studio']) {
  assertIncludes(homepage, projectName, 'doc_build/index.html');
}

const llmsFull = await readFile(path.join(buildDir, 'llms-full.txt'), 'utf8');
for (const url of [
  'https://graph.tohoqing.com/',
  'https://sub.thqllm.com/',
  'https://img.tohoqing.com/',
]) {
  assertIncludes(llmsFull, url, 'doc_build/llms-full.txt');
}

console.log('Verified 11 static outputs and site copy.');
