import { describe, expect, it } from 'vitest';

import { projects } from '../data/projects';
import { createSidebarConfig, getFeaturedProjects, getProjectByPathname } from './projects';

describe('project navigation helpers', () => {
  it('returns featured projects in ascending order', () => {
    expect(getFeaturedProjects(projects).map((project) => project.id)).toEqual([
      'fluctgraph',
      'thq-api',
      'toho-image-studio',
    ]);
  });

  it('finds a project from a nested docs pathname', () => {
    expect(getProjectByPathname('/docs/thq-api/faq')?.id).toBe('thq-api');
  });

  it('returns undefined for a non-docs pathname', () => {
    expect(getProjectByPathname('/projects/')).toBeUndefined();
  });

  it('creates sidebars for every documented project', () => {
    const sidebars = createSidebarConfig(projects);

    expect(Object.keys(sidebars)).toEqual([
      '/docs/fluctgraph/',
      '/docs/thq-api/',
      '/docs/toho-image-studio/',
    ]);
    expect(sidebars['/docs/fluctgraph/'][0].items[1]).toEqual({
      text: '快速开始',
      link: '/docs/fluctgraph/quick-start',
    });
  });
});
