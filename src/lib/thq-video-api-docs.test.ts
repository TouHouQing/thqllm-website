import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
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
  it('publishes the combined creation and developer documentation', async () => {
    expect(registeredFiles).toEqual([
      'index.mdx',
      'quick-start.mdx',
      'text-images.mdx',
      'storyboard.mdx',
      'projects.mdx',
      'models.mdx',
      'video-api.mdx',
      'parameters.mdx',
      'media.mdx',
      'tasks.mdx',
      'examples.mdx',
      'ai-integration.mdx',
      'faq.mdx',
    ]);
    expect(await collectMdxFiles(docsRoot)).toEqual([...registeredFiles].toSorted());
    expect(registeredRoutes).not.toContain('/docs/thq-video-api/firefly-video-v2');
    expect(projects.some((project) => project.id === 'toho-image-studio')).toBe(false);
  });

  it('removes obsolete model IDs, fixed pricing tables and separate image branding', async () => {
    const combined = (await readVideoDocs()).map(({ content }) => content).join('\n');
    expect(combined).not.toMatch(
      /firefly-video-v2|leonardo-seedance|seedance-2\.0-0826|img\.thqllm\.com|Toho Image Studio/,
    );
    expect(combined).not.toMatch(/ycyapi\.cn|YCYAPI|Adobe2API/i);
    expect(combined).toContain('Seedance 2.0');
    expect(combined).toContain('Seedance 2.5');
    expect(combined).toContain('MiniMax-H3');
  });

  it('documents manual inputs, per-user providers and reference image editing', async () => {
    const content = await readFile(path.join(docsRoot, 'text-images.mdx'), 'utf8');
    for (const phrase of [
      '手动输入',
      '上传图片',
      '当前登录用户',
      'Key 在服务器加密保存',
      '参考图编辑图片',
      '/images/edits',
      '模型列表',
    ]) {
      expect(content).toContain(phrase);
    }
    expect(content).not.toContain('STUDIO_PROVIDER_ENCRYPTION_KEY');
  });

  it('documents the asynchronous API lifecycle and string duration', async () => {
    const content = await readFile(path.join(docsRoot, 'video-api.mdx'), 'utf8');
    const example = content.match(/```json\n([\s\S]*?)```/);
    expect(example).not.toBeNull();
    const request = JSON.parse(example?.[1] ?? '{}');
    expect(typeof request.seconds).toBe('string');
    expect(request.model).toBeTruthy();
    expect(request.size).toBe('16:9');
    expect(request.resolution).toBe('720p');
    for (const phrase of [
      '/v1/models',
      '/v1/videos',
      '/content',
      'queued',
      'in_progress',
      'completed',
      'failed',
      '保存返回的',
      '不要自动重发创建请求',
    ]) {
      expect(content).toContain(phrase);
    }
  });

  it('publishes a valid downloadable THQ skill using the same API contract', async () => {
    const content = await readFile(path.join(docsRoot, 'ai-integration.mdx'), 'utf8');
    const downloadPath = content.match(/href="([^"]+\/SKILL\.md)"/)?.[1];
    expect(downloadPath).toBe('/skills/thq-video-api/SKILL.md');
    const skill = await readFile(
      path.join(repoRoot, 'site/public', downloadPath?.slice(1) ?? ''),
      'utf8',
    );
    const frontmatter = skill.match(/^---\r?\n([\s\S]+?)\r?\n---/);
    expect(frontmatter).not.toBeNull();
    expect(parse(frontmatter?.[1] ?? '')).toEqual(
      expect.objectContaining({ name: 'thq-video-api', description: expect.any(String) }),
    );
    const example = JSON.parse(skill.match(/```json\n([\s\S]*?)```/)?.[1] ?? '{}');
    expect(typeof example.seconds).toBe('string');
    expect(example.size).toBe('16:9');
    expect(example.resolution).toBe('720p');
  });

  it('keeps published service URLs under THQ domains or reserved example domains', async () => {
    const documents = await readVideoDocs();
    const skill = await readFile(
      path.join(repoRoot, 'site/public/skills/thq-video-api/SKILL.md'),
      'utf8',
    );
    for (const content of [...documents.map((document) => document.content), skill]) {
      for (const [url] of content.matchAll(/https?:\/\/[a-zA-Z0-9.-]+/g)) {
        const { hostname, protocol } = new URL(url);
        expect(protocol).toBe('https:');
        expect(
          hostname === 'thqllm.com' ||
            hostname.endsWith('.thqllm.com') ||
            hostname === 'example.com' ||
            hostname.endsWith('.example.com'),
          `Unexpected published service domain: ${hostname}`,
        ).toBe(true);
      }
    }
  });

  it('distinguishes browser-local projects and local assembly from billed AI continuation', async () => {
    const content = await readFile(path.join(docsRoot, 'projects.mdx'), 'utf8');
    expect(content).toContain('当前浏览器');
    expect(content).toContain('不自动跨设备同步');
    expect(content).toContain('项目 ZIP');
    expect(content).toContain('不会额外调用视频模型');
    expect(content).toContain('新的模型生成');
  });

  it('redirects retired image and model guides to registered replacement documents', async () => {
    const content = await readFile(path.join(repoRoot, 'site/public/_redirects'), 'utf8');
    const rules = content.split('\n').filter((line) => line && !line.startsWith('#'));
    expect(rules.some((line) => line.startsWith('/docs/toho-image-studio/quick-start '))).toBe(
      true,
    );
    expect(rules.some((line) => line.startsWith('/docs/thq-video-api/firefly-video-v2 '))).toBe(
      true,
    );
    expect(rules.some((line) => line.startsWith('/docs/thq-video-api/sd2-official '))).toBe(true);
    for (const rule of rules) {
      const [, destination, status] = rule.split(/\s+/);
      expect(registeredRoutes).toContain(destination);
      expect(status).toBe('301');
    }
  });

  it('does not publish references to missing local documents', async () => {
    for (const relativePath of registeredFiles) {
      await expect(access(path.join(docsRoot, relativePath))).resolves.toBeUndefined();
    }
  });
});
