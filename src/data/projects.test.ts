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

const validFourthProject = {
  ...validProject,
  id: 'sample-four',
  name: 'Sample Four',
  externalUrl: 'https://four.example.com/',
  docs: {
    ...validProject.docs,
    basePath: '/docs/sample-four/',
  },
  order: 10,
};

describe('project registry', () => {
  it('keeps the canonical projects and external URLs in the registry', () => {
    expect(projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'fluctgraph',
          name: 'FluctGraph',
          externalUrl: 'https://graph.tohoqing.com/',
        }),
        expect.objectContaining({
          id: 'thq-api',
          name: 'THQ API',
          externalUrl: 'https://sub.thqllm.com/',
        }),
        expect.objectContaining({
          id: 'toho-image-studio',
          name: 'Toho Image Studio',
          externalUrl: 'https://img.tohoqing.com/',
        }),
      ]),
    );
  });

  it('accepts an additional valid project without a registered-project count change', () => {
    expect(projectListSchema.parse([...projects, validFourthProject])).toContainEqual(
      validFourthProject,
    );
  });

  it('rejects project URLs that do not use HTTPS', () => {
    expect(() =>
      projectListSchema.parse([{ ...validProject, externalUrl: 'http://example.com/' }]),
    ).toThrow('Project URLs must use HTTPS');
  });

  it.each([
    {
      label: 'project',
      path: [0],
      unknownKey: 'documentation',
      fixture: {
        ...validProject,
        documentation: validProject.docs,
      },
    },
    {
      label: 'docs',
      path: [0, 'docs'],
      unknownKey: 'extra',
      fixture: {
        ...validProject,
        docs: {
          ...validProject.docs,
          extra: true,
        },
      },
    },
    {
      label: 'docs section',
      path: [0, 'docs', 'sections', 0],
      unknownKey: 'extra',
      fixture: {
        ...validProject,
        docs: {
          ...validProject.docs,
          sections: [
            {
              ...validProject.docs.sections[0],
              extra: true,
            },
          ],
        },
      },
    },
    {
      label: 'docs item',
      path: [0, 'docs', 'sections', 0, 'items', 0],
      unknownKey: 'extra',
      fixture: {
        ...validProject,
        docs: {
          ...validProject.docs,
          sections: [
            {
              ...validProject.docs.sections[0],
              items: [
                {
                  ...validProject.docs.sections[0].items[0],
                  extra: true,
                },
              ],
            },
          ],
        },
      },
    },
  ])('rejects unknown keys on a $label object', ({ fixture, path, unknownKey }) => {
    const result = projectListSchema.safeParse([fixture]);

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error(`Expected unknown ${unknownKey} key on ${path.join('.')} to fail`);
    }

    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        code: 'unrecognized_keys',
        keys: [unknownKey],
        path,
      }),
    );
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

  it('rejects duplicate project docs base paths', () => {
    const result = projectListSchema.safeParse([
      validProject,
      {
        ...validProject,
        id: 'sample-two',
        order: validProject.order + 1,
      },
    ]);

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error('Expected duplicate project docs base path validation to fail');
    }

    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        message: 'Duplicate project docs base path: /docs/sample/',
        path: [1, 'docs', 'basePath'],
      }),
    );
  });

  it.each([
    {
      label: 'name',
      path: [0, 'name'],
      mutate: (project: typeof validProject) => {
        project.name = '   ';
      },
    },
    {
      label: 'stage label',
      path: [0, 'stageLabel'],
      mutate: (project: typeof validProject) => {
        project.stageLabel = '   ';
      },
    },
    {
      label: 'category label',
      path: [0, 'categoryLabel'],
      mutate: (project: typeof validProject) => {
        project.categoryLabel = '   ';
      },
    },
    {
      label: 'description',
      path: [0, 'description'],
      mutate: (project: typeof validProject) => {
        project.description = '            ';
      },
    },
    {
      label: 'docs section text',
      path: [0, 'docs', 'sections', 0, 'text'],
      mutate: (project: typeof validProject) => {
        project.docs.sections[0].text = '   ';
      },
    },
    {
      label: 'docs item text',
      path: [0, 'docs', 'sections', 0, 'items', 0, 'text'],
      mutate: (project: typeof validProject) => {
        project.docs.sections[0].items[0].text = '   ';
      },
    },
    {
      label: 'tag',
      path: [0, 'tags', 0],
      mutate: (project: typeof validProject) => {
        project.tags[0] = '   ';
      },
    },
  ])('rejects a whitespace-only $label', ({ mutate, path }) => {
    const fixture = structuredClone(validProject);
    mutate(fixture);

    const result = projectListSchema.safeParse([fixture]);

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error(`Expected whitespace validation to fail at ${path.join('.')}`);
    }

    expect(result.error.issues).toContainEqual(expect.objectContaining({ path }));
  });

  it.each([
    {
      label: 'project id',
      path: [0, 'id'],
      mutate: (project: typeof validProject) => {
        project.id = ' sample';
      },
    },
    {
      label: 'docs item slug',
      path: [0, 'docs', 'sections', 0, 'items', 0, 'slug'],
      mutate: (project: typeof validProject) => {
        project.docs.sections[0].items[0].slug = 'index ';
      },
    },
  ])('rejects surrounding whitespace in a $label', ({ mutate, path }) => {
    const fixture = structuredClone(validProject);
    mutate(fixture);

    const result = projectListSchema.safeParse([fixture]);

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error(`Expected strict slug validation to fail at ${path.join('.')}`);
    }

    expect(result.error.issues).toContainEqual(expect.objectContaining({ path }));
  });

  it('does not suggest a docs base path until the project id is valid', () => {
    const result = projectListSchema.safeParse([
      {
        ...validProject,
        id: 'Invalid_ID',
      },
    ]);

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error('Expected an invalid project id to fail');
    }

    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: [0, 'id'],
      }),
    );
    expect(result.error.issues).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('Project docs base path must match project id'),
        path: [0, 'docs', 'basePath'],
      }),
    );
  });

  it.each([
    'index',
    'quick-start',
  ])('rejects duplicate docs item slug "%s" across sections', (duplicateSlug) => {
    const fixture = structuredClone(validProject);
    fixture.docs.sections.push({
      text: '更多',
      items: [{ text: '重复入口', slug: duplicateSlug }],
    });

    const result = projectListSchema.safeParse([fixture]);

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error(`Expected duplicate docs item slug ${duplicateSlug} to fail`);
    }

    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        message: `Duplicate project docs item slug: ${duplicateSlug}`,
        path: [0, 'docs', 'sections', 1, 'items', 0, 'slug'],
      }),
    );
  });

  it('requires docs.basePath to match the project id', () => {
    const result = projectListSchema.safeParse([
      {
        ...validProject,
        docs: {
          ...validProject.docs,
          basePath: '/docs/different-project/',
        },
      },
    ]);

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error('Expected a mismatched docs base path to fail');
    }

    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        message: 'Project docs base path must match project id: /docs/sample/',
        path: [0, 'docs', 'basePath'],
      }),
    );
  });

  it('requires documented projects to expose an index entry', () => {
    const fixture = structuredClone(validProject);
    fixture.docs.sections[0].items = [{ text: '快速开始', slug: 'quick-start' }];

    const result = projectListSchema.safeParse([fixture]);

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error('Expected docs without an index entry to fail');
    }

    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        message: 'Project docs must include an index item',
        path: [0, 'docs', 'sections'],
      }),
    );
  });
});
