import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { projects } from '../../src/data/projects';
import { ProjectDirectoryLinks } from '../components/ProjectsDirectory';

vi.mock('@rspress/core/theme-original', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));

describe('ProjectDirectoryLinks', () => {
  it('renders safe registry links by order without mutating the supplied fixture', () => {
    const fixture = [
      {
        ...projects[1],
        id: 'later-project',
        name: 'Later Project',
        externalUrl: 'https://later.example.com/',
        order: 20,
        featured: false,
      },
      {
        ...projects[0],
        id: 'earlier-project',
        name: 'Earlier Project',
        externalUrl: 'https://earlier.example.com/',
        order: 10,
      },
    ];
    const inputOrder = fixture.map((project) => project.id);

    render(<ProjectDirectoryLinks items={fixture} />);

    const list = screen.getByRole('list');
    const links = within(list).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual(['Earlier Project', 'Later Project']);
    expect(links[0]).toHaveAttribute('href', 'https://earlier.example.com/');
    expect(links[1]).toHaveAttribute('href', 'https://later.example.com/');
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    }
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(fixture.map((project) => project.id)).toEqual(inputOrder);
  });
});
