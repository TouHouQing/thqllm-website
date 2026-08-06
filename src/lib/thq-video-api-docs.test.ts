import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projects } from '../data/projects';
import { createProjectDocRoutePath } from './project-doc-routes';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const docsRoot = path.join(repoRoot, 'site/docs/thq-video-api');
const videoApi = projects.find((project) => project.id === 'thq-video-api');

if (!videoApi?.docs) {
  throw new Error('Missing THQ Video API documentation registry');
}

const videoApiDocs = videoApi.docs;
const registeredFiles = videoApiDocs.sections.flatMap((section) =>
  section.items.map((item) => `${item.slug}.mdx`),
);
const registeredRoutes = videoApiDocs.sections.flatMap((section) =>
  section.items.map((item) => createProjectDocRoutePath(videoApiDocs.basePath, item.slug)),
);

async function collectMdxFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        return collectMdxFiles(path.join(directory, entry.name), relativePath);
      }

      return entry.isFile() && entry.name.endsWith('.mdx') ? [relativePath] : [];
    }),
  );

  return files.flat().toSorted();
}

async function readVideoDocs() {
  const files = await collectMdxFiles(docsRoot);
  return Promise.all(
    files.map(async (relativePath) => ({
      relativePath,
      content: await readFile(path.join(docsRoot, relativePath), 'utf8'),
    })),
  );
}

describe('THQ Video API documentation contract', () => {
  it('publishes exactly the registered overview and Firefly Video v2 tutorial', async () => {
    expect(registeredFiles).toEqual(['index.mdx', 'firefly-video-v2.mdx']);
    expect(registeredRoutes).toEqual([
      '/docs/thq-video-api/',
      '/docs/thq-video-api/firefly-video-v2',
    ]);
    expect(await collectMdxFiles(docsRoot)).toEqual([...registeredFiles].toSorted());
  });

  it('rewrites the source guide to the THQ video service without legacy branding', async () => {
    const docs = await readVideoDocs();
    const combinedContent = docs.map(({ content }) => content).join('\n');

    expect(combinedContent).toContain('https://new.thqllm.com');
    expect(combinedContent).toContain('THQ Video API');
    expect(combinedContent).toContain('YOUR_THQ_VIDEO_API_KEY');
    expect(combinedContent).not.toMatch(/ycyapi\.cn/i);
    expect(combinedContent).not.toMatch(/YCYAPI|Adobe2API|192\.6\.121\.6/i);
  });

  it('keeps the Firefly Video v2 tutorial as a complete multipart task workflow', async () => {
    const content = await readFile(path.join(docsRoot, 'firefly-video-v2.mdx'), 'utf8');

    for (const requiredText of [
      'firefly-video-v2',
      'firefly-video-v2-fast',
      '满血 SD2',
      'SD2-fast',
      '/v1/models',
      '/v1/videos',
      '/v1/videos/{task_id}',
      'multipart/form-data',
      'first_frame',
      'last_frame',
      'generate_audio',
      'download_url',
      'status',
      'completed',
      'failed',
      'generation_failed',
      '不适用于 THQ Video API 的内容',
      '远程素材 URL',
      'JSON Base64',
      '跳过 TLS',
    ]) {
      expect(content, `Firefly guide is missing ${requiredText}`).toContain(requiredText);
    }
  });

  it('publishes the current per-second pricing for the Firefly Video v2 model group', async () => {
    const firefly = await readFile(path.join(docsRoot, 'firefly-video-v2.mdx'), 'utf8');

    expect(firefly).toContain('| `firefly-video-v2-fast` | 0.2 / 秒 |');
    expect(firefly).toContain('| `firefly-video-v2` | 0.3 / 秒 |');
    expect(firefly).not.toContain('0.15 / 秒');
    expect(firefly).not.toContain('0.17 / 秒');
  });

  it('does not publish references to missing local documents', async () => {
    for (const relativePath of registeredFiles) {
      await expect(access(path.join(docsRoot, relativePath))).resolves.toBeUndefined();
    }
  });
});
