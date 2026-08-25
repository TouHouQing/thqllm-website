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
  it('publishes exactly the registered overview and video tutorial groups', async () => {
    expect(registeredFiles).toEqual(['index.mdx', 'firefly-video-v2.mdx', 'sd2-official.mdx']);
    expect(registeredRoutes).toEqual([
      '/docs/thq-video-api/',
      '/docs/thq-video-api/firefly-video-v2',
      '/docs/thq-video-api/sd2-official',
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
    expect(combinedContent).not.toMatch(/YCYAPI|Adobe2API|192\.6\.121\.6|22-视频-官方API/i);
  });

  it('keeps the overview page focused on the first successful call', async () => {
    const content = await readFile(path.join(docsRoot, 'index.mdx'), 'utf8');

    for (const requiredText of [
      '第一次使用：照着 5 步完成',
      '先选一个分组',
      'SD2 官方满血',
      '创建视频任务',
      '查询视频任务',
      '下载生成结果',
      '所有模型都使用同一套接口格式',
      'seedance-2.0-0826-720p',
    ]) {
      expect(content, `Video API overview is missing ${requiredText}`).toContain(requiredText);
    }
  });

  it('keeps the SD2 tutorial organized around a first successful task', async () => {
    const content = await readFile(path.join(docsRoot, 'firefly-video-v2.mdx'), 'utf8');

    for (const requiredText of [
      '先看懂 4 步调用流程',
      '选择模型',
      '准备 API Key',
      '创建第一条视频',
      '等待视频生成完成',
      '下载视频',
      '进阶：使用参考图、视频或音频',
      '进阶：使用分镜生成连续画面',
      '价格说明',
      '常见问题',
      '上线前检查',
      'firefly-video-v2',
      'firefly-video-v2-fast',
      'leonardo-seedance-2.0',
      'leonardo-seedance-2.0-fast',
      '满血 SD2',
      'SD2-fast',
      'Leonardo Seedance 2.0',
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
      '避免这些常见错误',
      '远程素材 URL',
      'JSON Base64',
      '跳过 TLS',
      '14 秒',
      '1080p',
    ]) {
      expect(content, `Firefly guide is missing ${requiredText}`).toContain(requiredText);
    }
  });

  it('publishes the current per-second pricing for the Firefly Video v2 model group', async () => {
    const firefly = await readFile(path.join(docsRoot, 'firefly-video-v2.mdx'), 'utf8');

    expect(firefly).toContain('| `firefly-video-v2-fast` | 0.15 / 秒 | 0.18 / 秒 | 不支持 |');
    expect(firefly).toContain('| `firefly-video-v2` | 0.18 / 秒 | 0.25 / 秒 | 0.5 / 秒 |');
    expect(firefly).toContain('| `leonardo-seedance-2.0-fast` | 0.15 / 秒 | 0.18 / 秒 | 不支持 |');
    expect(firefly).toContain('| `leonardo-seedance-2.0` | 0.18 / 秒 | 0.25 / 秒 | 不支持 |');
    expect(firefly).not.toContain('`leonardo-seedance-2.0` | 0.18 / 秒 | 0.25 / 秒 | 0.5 / 秒');
  });

  it('keeps the SD2 official full guide focused on the official 15-second workflow', async () => {
    const official = await readFile(path.join(docsRoot, 'sd2-official.mdx'), 'utf8');

    for (const requiredText of [
      'SD2 官方满血',
      '先看懂 4 步调用流程',
      '选择模型',
      '准备 API Key',
      '创建第一条视频',
      '等待视频生成完成',
      '下载视频',
      'seconds',
      '"seconds": "15"',
      'Idempotency-Key',
      'references',
      'data:',
      'download_url',
      '不要自己拼下载地址',
      'seedance-2.0-0826-480p',
      'seedance-2.0-0826-720p',
      'seedance-2.0-fast-0826-480p',
      'seedance-2.0-fast-0826-720p',
      'result_not_ready',
      'QuotaExceeded',
      '上线前检查',
    ]) {
      expect(official, `SD2 official guide is missing ${requiredText}`).toContain(requiredText);
    }
  });

  it('publishes the current per-second pricing for the SD2 official full group', async () => {
    const official = await readFile(path.join(docsRoot, 'sd2-official.mdx'), 'utf8');

    expect(official).toContain(
      '| `seedance-2.0-0826-480p` | 标准质量，480p | 480p | 0.25 / 秒 | 3.75 / 条 |',
    );
    expect(official).toContain(
      '| `seedance-2.0-0826-720p` | 标准质量，720p | 720p | 0.35 / 秒 | 5.25 / 条 |',
    );
    expect(official).toContain(
      '| `seedance-2.0-fast-0826-480p` | 快速生成，480p | 480p | 0.20 / 秒 | 3.00 / 条 |',
    );
    expect(official).toContain(
      '| `seedance-2.0-fast-0826-720p` | 快速生成，720p | 720p | 0.30 / 秒 | 4.50 / 条 |',
    );
  });

  it('does not publish references to missing local documents', async () => {
    for (const relativePath of registeredFiles) {
      await expect(access(path.join(docsRoot, relativePath))).resolves.toBeUndefined();
    }
  });
});
