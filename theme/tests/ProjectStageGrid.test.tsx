import { MemoryRouter } from '@rspress/core/runtime';
import { render, screen, within } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { projects } from '../../src/data/projects';
import { ProjectStageGrid } from '../components/ProjectStageGrid';

// Rspress provides its virtual route modules only during the site build.
vi.mock('@rspress/core/runtime', () => ({
  MemoryRouter: ({ children }: PropsWithChildren) => children,
}));

vi.mock('@rspress/core/theme-original', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));

describe('ProjectStageGrid', () => {
  it('renders one safe external link and one docs link per project', () => {
    const { container } = render(
      <MemoryRouter>
        <ProjectStageGrid projects={projects} />
      </MemoryRouter>,
    );

    expect(container.querySelector('#projects')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    const external = screen.getByRole('link', { name: '进入 FluctGraph' });
    expect(external).toHaveAttribute('href', 'https://graph.tohoqing.com/');
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noreferrer noopener');
    expect(screen.getByRole('link', { name: '阅读 FluctGraph 文档' })).toHaveAttribute(
      'href',
      '/docs/fluctgraph/',
    );
  });

  it('shows a non-link state when a future project has no docs', () => {
    render(
      <MemoryRouter>
        <ProjectStageGrid
          projects={[
            {
              ...projects[0],
              id: 'future-project',
              name: 'Future Project',
              externalUrl: 'https://future.example.com/',
              docs: undefined,
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('文档准备中')).toHaveAttribute('aria-disabled', 'true');
  });

  it('counts only featured projects that are rendered', () => {
    const { container } = render(
      <MemoryRouter>
        <ProjectStageGrid
          projects={[
            projects[0],
            {
              ...projects[1],
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
});
