import { MemoryRouter } from '@rspress/core/runtime';
import { cleanup, render, within } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projects } from '../../src/data/projects';
import { ProjectStageGrid } from '../components/ProjectStageGrid';

// Rspress provides its virtual route modules only during the site build.
vi.mock('@rspress/core/runtime', () => ({
  MemoryRouter: ({ children }: PropsWithChildren) => children,
}));

vi.mock('@rspress/core/theme-original', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));

function getProject(projectId: string) {
  const project = projects.find(({ id }) => id === projectId);

  if (!project) {
    throw new Error(`Missing canonical project fixture: ${projectId}`);
  }

  return project;
}

const fluctgraph = getProject('fluctgraph');
const thqApi = getProject('thq-api');
const pendingProject = {
  ...fluctgraph,
  id: 'pending-project',
  name: 'Pending Project',
  externalUrl: 'https://pending.example.com/',
  docs: undefined,
  order: 4,
  featured: true,
};

afterEach(cleanup);

describe('ProjectStageGrid', () => {
  it('binds every featured project card to its registry entry', () => {
    const registry = [...projects, pendingProject];
    const featuredProjects = registry.filter((project) => project.featured);
    const { container } = render(
      <MemoryRouter>
        <ProjectStageGrid projects={registry} />
      </MemoryRouter>,
    );
    const view = within(container);

    expect(container.querySelector('#projects')).toBeInTheDocument();
    expect(view.getAllByRole('article')).toHaveLength(featuredProjects.length);

    for (const project of featuredProjects) {
      const heading = view.getByRole('heading', { level: 3, name: project.name });
      const card = heading.closest('article');

      if (!card) {
        throw new Error(`Expected ${project.name} heading to belong to a project card`);
      }

      const external = within(card).getByRole('link', { name: `进入 ${project.name}` });
      const actions = card.querySelector('[data-project-actions]');

      if (!actions) {
        throw new Error(`Expected ${project.name} card to have a project actions container`);
      }

      const actionAnchors = [...actions.querySelectorAll(':scope > a')];

      expect(external).toHaveAttribute('href', project.externalUrl);
      expect(external).toHaveAttribute('data-project-external-link', project.id);
      expect(external).toHaveAttribute('target', '_blank');
      expect(external).toHaveAttribute('rel', 'noreferrer noopener');
      expect(external.parentElement).toBe(actions);
      expect(actionAnchors[0]).toBe(external);
      expect(external).not.toHaveAttribute('class');
      expect(external).not.toHaveAttribute('style');
      expect(external).not.toHaveAttribute('hidden');
      expect(external).not.toHaveAttribute('aria-hidden');
      expect(external).not.toHaveAttribute('tabindex', '-1');

      if (project.docs) {
        const docs = within(card).getByRole('link', { name: `阅读 ${project.name} 文档` });

        expect(docs).toHaveAttribute('href', project.docs.basePath);
        expect(docs).toHaveAttribute('data-project-docs-link', project.id);
        expect(docs.parentElement).toBe(actions);
        expect(actionAnchors[1]).toBe(docs);
        expect(actionAnchors).toHaveLength(2);
      } else {
        expect(card.querySelector('[data-project-docs-link]')).not.toBeInTheDocument();
        expect(actionAnchors).toHaveLength(1);
      }
    }

    expect(view.getByRole('link', { name: '阅读 FluctGraph 文档' })).toHaveAttribute(
      'href',
      '/docs/fluctgraph/',
    );
  });

  it('shows a non-link state when a future project has no docs', () => {
    const { container } = render(
      <MemoryRouter>
        <ProjectStageGrid
          projects={[
            {
              ...fluctgraph,
              id: 'future-project',
              name: 'Future Project',
              externalUrl: 'https://future.example.com/',
              docs: undefined,
            },
          ]}
        />
      </MemoryRouter>,
    );

    const view = within(container);

    expect(view.getByText('文档准备中')).toHaveAttribute('aria-disabled', 'true');
    expect(container.querySelectorAll('[data-project-actions]')).toHaveLength(1);
    expect(container.querySelector('[data-project-docs-link]')).not.toBeInTheDocument();
  });

  it('counts only featured projects that are rendered', () => {
    const { container } = render(
      <MemoryRouter>
        <ProjectStageGrid
          projects={[
            fluctgraph,
            {
              ...thqApi,
              id: 'hidden-project',
              name: 'Hidden Project',
              featured: false,
            },
          ]}
        />
      </MemoryRouter>,
    );
    const view = within(container);

    expect(view.getAllByRole('article')).toHaveLength(1);
    expect(view.queryByText('Hidden Project')).not.toBeInTheDocument();
    expect(view.getByText('01 PROJECTS AVAILABLE')).toBeInTheDocument();
  });

  it('renders every supplied project when featured-only filtering is disabled', () => {
    const fixture = [
      fluctgraph,
      {
        ...thqApi,
        id: 'non-featured-project',
        name: 'Non-featured Project',
        featured: false,
      },
    ];
    const { container } = render(
      <MemoryRouter>
        <ProjectStageGrid projects={fixture} featuredOnly={false} />
      </MemoryRouter>,
    );
    const view = within(container);

    expect(view.getAllByRole('article')).toHaveLength(2);
    expect(view.getByText('FluctGraph')).toBeInTheDocument();
    expect(view.getByText('Non-featured Project')).toBeInTheDocument();
    expect(view.getByText('02 PROJECTS AVAILABLE')).toBeInTheDocument();
  });

  it('sorts all projects by order without mutating the supplied fixture', () => {
    const fixture = [
      {
        ...thqApi,
        featured: false,
      },
      fluctgraph,
    ];
    const inputOrder = fixture.map((project) => project.id);
    const { container } = render(
      <MemoryRouter>
        <ProjectStageGrid projects={fixture} featuredOnly={false} />
      </MemoryRouter>,
    );
    const view = within(container);

    expect(
      view.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(['THQ API', 'FluctGraph']);
    expect(fixture.map((project) => project.id)).toEqual(inputOrder);
  });
});
