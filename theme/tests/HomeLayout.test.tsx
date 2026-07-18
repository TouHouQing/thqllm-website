import { MemoryRouter } from '@rspress/core/runtime';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDefinition } from '../../src/data/project-schema';
import { projects } from '../../src/data/projects';
import { HomeLayout } from '../layouts/HomeLayout';

vi.mock('@rspress/core/runtime', () => ({
  MemoryRouter: ({ children }: PropsWithChildren) => children,
}));

vi.mock('@rspress/core/theme-original', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));

const pendingProject: ProjectDefinition = {
  ...projects[0],
  id: 'pending-undocumented-project',
  name: 'Pending Project',
  externalUrl: 'https://pending.example.com/',
  docs: undefined,
  order: projects.length + 1,
  featured: true,
};

afterEach(cleanup);

describe('HomeLayout', () => {
  it('does not render the retired website launch note on the home page', () => {
    render(
      <MemoryRouter>
        <HomeLayout />
      </MemoryRouter>,
    );

    expect(screen.queryByText('THQLLM 官网启动记录')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '阅读开发札记' })).not.toBeInTheDocument();
  });

  it('renders HUD counts and project content from the injected registry fixture', () => {
    const projectRegistry = [...projects, pendingProject];
    const expectedProjectCount = String(projectRegistry.length).padStart(2, '0');
    const expectedDocsCount = String(
      projectRegistry.filter((project) => project.docs).length,
    ).padStart(2, '0');

    render(
      <MemoryRouter>
        <HomeLayout projectRegistry={projectRegistry} />
      </MemoryRouter>,
    );

    const hud = document.querySelector('dl[aria-label="站点信息"]');
    expect(hud).not.toBeNull();
    expect(
      within(hud as HTMLElement).getByText(`${expectedProjectCount} NODES`),
    ).toBeInTheDocument();
    expect(within(hud as HTMLElement).getByText(`${expectedDocsCount} DOCS`)).toBeInTheDocument();

    const projectCard = screen
      .getByRole('heading', { level: 3, name: 'Pending Project' })
      .closest('article');
    expect(projectCard).not.toBeNull();
    expect(within(projectCard as HTMLElement).getByText('Pending Project')).toBeInTheDocument();
    expect(within(projectCard as HTMLElement).getByText('文档准备中')).toBeInTheDocument();
    expect(screen.getByText('Pending Project · 文档准备中')).toBeInTheDocument();
  });
});
