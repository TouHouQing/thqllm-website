import { describe, expect, it } from 'vitest';

import { projectListSchema } from '../data/project-schema';
import { createProjectExternalLinksRemarkPlugin } from './project-llms';

const projectsSourcePath = '/repo/site/projects/index.mdx';
const registry = projectListSchema.parse([
  {
    id: 'documented',
    name: 'Documented Project',
    stageLabel: 'STAGE 01',
    categoryLabel: 'DOCUMENTATION',
    description: 'A documented project used by llms tests.',
    externalUrl: 'https://documented.example.com/',
    docs: {
      basePath: '/docs/documented/',
      sections: [
        {
          text: '开始',
          items: [{ text: '概览', slug: 'index' }],
        },
      ],
    },
    accent: 'vermilion',
    tags: ['Docs'],
    order: 2,
    featured: true,
  },
  {
    id: 'undocumented',
    name: 'Undocumented Project',
    stageLabel: 'STAGE 02',
    categoryLabel: 'EXPERIMENT',
    description: 'An undocumented project used by llms tests.',
    externalUrl: 'https://EXAMPLE.com:443/project',
    docs: undefined,
    accent: 'cyan',
    tags: ['Experiment'],
    order: 1,
    featured: false,
  },
]);

describe('project llms registry links', () => {
  it('appends every project URL in registry order to the generated projects Markdown', () => {
    const tree = {
      type: 'root',
      children: [{ type: 'heading', depth: 1, children: [{ type: 'text', value: '项目' }] }],
    };
    const transform = createProjectExternalLinksRemarkPlugin(registry, projectsSourcePath);

    transform(tree, { path: projectsSourcePath });

    expect(tree.children.at(-1)).toEqual({
      type: 'list',
      ordered: false,
      spread: false,
      children: [
        {
          type: 'listItem',
          spread: false,
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'link',
                  url: 'https://example.com/project',
                  children: [{ type: 'text', value: 'Undocumented Project' }],
                },
              ],
            },
          ],
        },
        {
          type: 'listItem',
          spread: false,
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'link',
                  url: 'https://documented.example.com/',
                  children: [{ type: 'text', value: 'Documented Project' }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('does not modify generated Markdown for other routes', () => {
    const tree = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Untouched' }] }],
    };
    const originalTree = structuredClone(tree);
    const transform = createProjectExternalLinksRemarkPlugin(registry, projectsSourcePath);

    transform(tree, { path: '/repo/site/about/index.mdx' });

    expect(tree).toEqual(originalTree);
  });
});
