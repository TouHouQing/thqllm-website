import { cleanup, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDefinition } from '../../src/data/project-schema';
import { projects } from '../../src/data/projects';
import { AboutBand, ManualBand } from '../components/HomeBands';

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
const tohoImageStudio = getProject('toho-image-studio');

const fourthProject: ProjectDefinition = {
  ...fluctgraph,
  id: 'fourth-project',
  name: 'Fourth Project',
  externalUrl: 'https://fourth.example.com/',
  docs: undefined,
  accent: 'sakura',
  order: 4,
  featured: true,
};

function createFixture() {
  return [tohoImageStudio, fourthProject, fluctgraph, thqApi];
}

afterEach(cleanup);

describe('ManualBand', () => {
  it('builds its project summary from the registry in order', () => {
    const fixture = createFixture();

    render(<ManualBand projects={fixture} />);

    const expectedSummary = fixture
      .toSorted((left, right) => left.order - right.order)
      .map((project) => project.name)
      .join(' · ');

    expect(screen.getByText(expectedSummary)).toBeInTheDocument();
  });

  it('sorts documented and pending projects without mutating the registry', () => {
    const fixture = createFixture();
    const originalIds = fixture.map((project) => project.id);

    const { container } = render(<ManualBand projects={fixture} />);

    const expectedItems = fixture
      .toSorted((left, right) => left.order - right.order)
      .map((project) => (project.docs ? project.name : `${project.name} · 文档准备中`));
    const renderedItems = within(container).getByRole('list').querySelectorAll('li');
    const renderedItemText = [...renderedItems].map((item) => item.textContent);

    expect(renderedItemText).toEqual(expectedItems);
    expect(fixture.map((project) => project.id)).toEqual(originalIds);
  });
});

describe('AboutBand', () => {
  it('keeps the about-page link without the retired project-network description', () => {
    render(<AboutBand />);

    expect(
      screen.queryByText('把模型、代码与图像工具整理成清晰、可使用、可查阅的项目网络。'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '了解更多' })).toHaveAttribute('href', '/about/');
  });
});
