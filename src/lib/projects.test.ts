import { describe, expect, it } from 'vitest';

import { projects } from '../data/projects';
import { createSidebarConfig, getFeaturedProjects, getProjectByPathname } from './projects';

function getProject(projectId: string) {
  const project = projects.find(({ id }) => id === projectId);

  if (!project) {
    throw new Error(`Missing canonical project fixture: ${projectId}`);
  }

  return project;
}

const fluctgraph = getProject('fluctgraph');
const thqApi = getProject('thq-api');
const tohoImageStudio = getProject('toho-image-studio');

describe('project navigation helpers', () => {
  it('filters and sorts featured projects without mutating the input', () => {
    const fixture = [
      { ...fluctgraph, order: 30, featured: true },
      { ...thqApi, order: 20, featured: false },
      { ...tohoImageStudio, order: 10, featured: true },
    ];
    const originalFixture = structuredClone(fixture);

    expect(getFeaturedProjects(fixture).map((project) => project.id)).toEqual([
      'toho-image-studio',
      'fluctgraph',
    ]);
    expect(fixture).toEqual(originalFixture);
  });

  it('finds a project from a nested docs pathname', () => {
    expect(getProjectByPathname('/docs/thq-api/faq')?.id).toBe('thq-api');
  });

  it('does not match a sibling docs path prefix', () => {
    expect(getProjectByPathname('/docs/thq-api-other/faq')).toBeUndefined();
  });

  it('returns undefined for a non-docs pathname', () => {
    expect(getProjectByPathname('/projects/')).toBeUndefined();
  });

  it('creates sidebars only for documented projects', () => {
    const projectWithoutDocs = {
      ...fluctgraph,
      id: 'undocumented',
      docs: undefined,
      order: 4,
      featured: false,
    };
    const fixture = [...projects, projectWithoutDocs];
    const sidebars = createSidebarConfig(fixture);
    const expectedBasePaths = fixture.flatMap((project) =>
      project.docs ? [project.docs.basePath] : [],
    );

    expect(Object.keys(sidebars)).toEqual(expectedBasePaths);
    expect(sidebars['/docs/fluctgraph/'][0].items[0]).toEqual({
      text: '概览',
      link: '/docs/fluctgraph/',
    });
    expect(sidebars['/docs/fluctgraph/'][0].items[1]).toEqual({
      text: '快速开始',
      link: '/docs/fluctgraph/quick-start',
    });
  });
});
