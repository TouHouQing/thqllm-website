import { MemoryRouter } from '@rspress/core/runtime';
import { render, screen, within } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HeroTitleScreen } from '../components/HeroTitleScreen';

// Rspress provides its virtual route modules only during the site build.
vi.mock('@rspress/core/runtime', () => ({
  MemoryRouter: ({ children }: PropsWithChildren) => children,
}));

vi.mock('@rspress/core/theme-original', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));

describe('HeroTitleScreen', () => {
  it('uses THQLLM as the only hero title and keeps direct navigation copy', () => {
    const { container } = render(
      <MemoryRouter>
        <HeroTitleScreen projectCount={3} />
      </MemoryRouter>,
    );

    const levelOneHeadings = screen.getAllByRole('heading', { level: 1 });
    expect(levelOneHeadings).toHaveLength(1);
    expect(levelOneHeadings[0]).toHaveAccessibleName('THQLLM');
    const menu = screen.getByRole('navigation', { name: '首页主菜单' });
    expect(within(menu).getByRole('link', { name: /项目选择/ })).toHaveAttribute(
      'href',
      '/#projects',
    );
    expect(within(menu).getByRole('link', { name: /使用文档/ })).toHaveAttribute(
      'href',
      '/docs/fluctgraph/',
    );
    expect(container.textContent).not.toContain('智能结界');
    expect(container.textContent).not.toContain('结界');
  });
});
