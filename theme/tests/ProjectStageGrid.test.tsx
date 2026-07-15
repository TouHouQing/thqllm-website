import { MemoryRouter } from '@rspress/core/runtime';
import { cleanup, render, screen, within } from '@testing-library/react';
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
  it('renders the registry-derived count and canonical safe links', () => {
    const fixture = [...projects, pendingProject];
    const featuredProjects = fixture.filter((project) => project.featured);
    const { container } = render(
      <MemoryRouter>
        <ProjectStageGrid projects={fixture} />
      </MemoryRouter>,
    );

    expect(container.querySelector('#projects')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(featuredProjects.length);

    for (const [projectName, externalUrl] of [
      ['FluctGraph', 'https://graph.tohoqing.com/'],
      ['THQ API', 'https://sub.thqllm.com/'],
      ['Toho Image Studio', 'https://img.tohoqing.com/'],
    ]) {
      const external = screen.getByRole('link', { name: `进入 ${projectName}` });
      expect(external).toHaveAttribute('href', externalUrl);
      expect(external).toHaveAttribute('target', '_blank');
      expect(external).toHaveAttribute('rel', 'noreferrer noopener');
    }

    expect(screen.getByRole('link', { name: '阅读 FluctGraph 文档' })).toHaveAttribute(
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

    expect(within(container).getByText('文档准备中')).toHaveAttribute('aria-disabled', 'true');
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
    ).toEqual(['FluctGraph', 'THQ API']);
    expect(fixture.map((project) => project.id)).toEqual(inputOrder);
  });
});
