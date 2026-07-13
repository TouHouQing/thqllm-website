import { describe, expect, it } from 'vitest';

import { projectListSchema } from './project-schema';
import { projects } from './projects';

const validProject = {
  id: 'sample',
  name: 'Sample',
  stageLabel: 'STAGE 09',
  categoryLabel: 'EXPERIMENT',
  description: 'A verified sample project.',
  externalUrl: 'https://example.com/',
  docs: {
    basePath: '/docs/sample/',
    sections: [
      {
        text: '开始',
        items: [
          { text: '概览', slug: 'index' },
          { text: '快速开始', slug: 'quick-start' },
        ],
      },
    ],
  },
  accent: 'vermilion',
  tags: ['AI'],
  order: 9,
  featured: false,
};

describe('project registry', () => {
  it('contains three checked-in projects', () => {
    expect(projects).toHaveLength(3);
  });

  it('rejects project URLs that do not use HTTPS', () => {
    expect(() =>
      projectListSchema.parse([{ ...validProject, externalUrl: 'http://example.com/' }]),
    ).toThrow('Project URLs must use HTTPS');
  });

  it('rejects duplicate project ids', () => {
    expect(() =>
      projectListSchema.parse([validProject, { ...validProject, order: validProject.order + 1 }]),
    ).toThrow(/Duplicate project id/);
  });

  it('rejects duplicate project orders', () => {
    expect(() =>
      projectListSchema.parse([validProject, { ...validProject, id: 'sample-two' }]),
    ).toThrow(/Duplicate project order/);
  });
});
