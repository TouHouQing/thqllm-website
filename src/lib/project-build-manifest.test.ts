import { describe, expect, it } from 'vitest';

import { projectListSchema } from '../data/project-schema';
import {
  createProjectBuildManifest,
  serializeProjectBuildManifest,
} from './project-build-manifest';

const documentedProject = {
  id: 'documented',
  name: 'Documented Project',
  stageLabel: 'STAGE 01',
  categoryLabel: 'DOCUMENTATION',
  description: 'A documented project used by manifest tests.',
  externalUrl: 'https://EXAMPLE.com:443/path',
  docs: {
    basePath: '/docs/documented/',
    sections: [
      {
        text: '开始',
        items: [
          { text: '概览', slug: 'index' },
          { text: '快速开始', slug: 'quick-start' },
        ],
      },
      {
        text: '参考',
        items: [
          { text: '常见问题', slug: 'faq' },
          { text: '客户端概览', slug: 'clients/index' },
          { text: 'Codex', slug: 'clients/codex' },
        ],
      },
    ],
  },
  accent: 'vermilion',
  tags: ['AI'],
  order: 2,
  featured: true,
};

const undocumentedProject = {
  id: 'undocumented',
  name: 'Undocumented Project',
  stageLabel: 'STAGE 02',
  categoryLabel: 'EXPERIMENT',
  description: 'A project without documentation used by manifest tests.',
  externalUrl: 'https://undocumented.example.com/',
  docs: undefined,
  accent: 'cyan',
  tags: ['Experiment'],
  order: 1,
  featured: false,
};

describe('project build manifest', () => {
  it('derives fixed, documented, and llms-aware routes from the registry', () => {
    const registry = projectListSchema.parse([documentedProject, undocumentedProject]);
    const manifest = createProjectBuildManifest(registry);

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.siteOrigin).toBe('https://thqllm.com');
    expect(manifest.routes).toEqual([
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
        routePath: '/about/',
        htmlPath: 'about/index.html',
        markdownPath: 'about/index.md',
        llms: { txt: true, full: true },
      },
      {
        routePath: '/docs/documented/',
        htmlPath: 'docs/documented/index.html',
        markdownPath: 'docs/documented/index.md',
        llms: { txt: true, full: true },
      },
      {
        routePath: '/docs/documented/quick-start',
        htmlPath: 'docs/documented/quick-start.html',
        markdownPath: 'docs/documented/quick-start.md',
        llms: { txt: true, full: true },
      },
      {
        routePath: '/docs/documented/faq',
        htmlPath: 'docs/documented/faq.html',
        markdownPath: 'docs/documented/faq.md',
        llms: { txt: true, full: true },
      },
      {
        routePath: '/docs/documented/clients/',
        htmlPath: 'docs/documented/clients/index.html',
        markdownPath: 'docs/documented/clients/index.md',
        llms: { txt: true, full: true },
      },
      {
        routePath: '/docs/documented/clients/codex',
        htmlPath: 'docs/documented/clients/codex.html',
        markdownPath: 'docs/documented/clients/codex.md',
        llms: { txt: true, full: true },
      },
    ]);
  });

  it('derives normalized project verifier data without mutating input or adding no-doc routes', () => {
    const registry = projectListSchema.parse([documentedProject, undocumentedProject]);
    const originalRegistry = structuredClone(registry);

    const manifest = createProjectBuildManifest(registry);

    expect(manifest.projects).toEqual([
      {
        id: 'undocumented',
        name: 'Undocumented Project',
        externalUrl: 'https://undocumented.example.com/',
        order: 1,
        featured: false,
        documented: false,
      },
      {
        id: 'documented',
        name: 'Documented Project',
        externalUrl: 'https://example.com/path',
        order: 2,
        featured: true,
        documented: true,
      },
    ]);
    expect(manifest.routes.some((route) => route.routePath.includes('undocumented'))).toBe(false);
    expect(registry).toEqual(originalRegistry);
  });

  it('serializes a deterministic readable manifest with a trailing newline', () => {
    const registry = projectListSchema.parse([documentedProject, undocumentedProject]);
    const manifest = createProjectBuildManifest(registry);

    expect(serializeProjectBuildManifest(manifest)).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
    expect(serializeProjectBuildManifest(manifest)).toContain('\n  "schemaVersion": 1,\n');
  });
});
