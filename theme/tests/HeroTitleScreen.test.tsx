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
        <HeroTitleScreen projectCount={3} manualCount={2} />
      </MemoryRouter>,
    );

    const levelOneHeadings = screen.getAllByRole('heading', { level: 1 });
    expect(levelOneHeadings).toHaveLength(1);
    expect(levelOneHeadings[0]).toHaveAccessibleName('THQLLM');
    const menu = screen.getByRole('navigation', { name: '首页主菜单' });
    expect(within(menu).getByRole('link', { name: /项目选择/ })).toHaveAttribute(
      'href',
      'https://thqllm.com/#projects',
    );
    expect(within(menu).getByRole('link', { name: /项目选择/ })).not.toHaveAttribute('target');
    expect(within(menu).getByRole('link', { name: /使用文档/ })).toHaveAttribute(
      'href',
      '/docs/fluctgraph/',
    );
    expect(within(menu).getAllByRole('link')).toHaveLength(3);
    expect(within(menu).queryByRole('link', { name: /开发札记/ })).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('智能结界');
    expect(container.textContent).not.toContain('结界');
  });

  it('marks every mobile danmaku exclusion with stable data attributes', () => {
    const { container } = render(
      <MemoryRouter>
        <HeroTitleScreen projectCount={3} manualCount={2} />
      </MemoryRouter>,
    );

    const root = container.querySelector('[data-danmaku-root]');
    expect(root).not.toBeNull();
    expect(root?.querySelectorAll('[data-danmaku-exclusion="menu"]')).toHaveLength(3);
    expect(root?.querySelectorAll('[data-danmaku-exclusion="scroll-hint"]')).toHaveLength(1);
  });

  it('reports project and documentation counts without a synthetic online status', () => {
    const { container } = render(
      <MemoryRouter>
        <HeroTitleScreen projectCount={3} manualCount={2} />
      </MemoryRouter>,
    );

    const hud = container.querySelector('dl[aria-label="站点信息"]');
    expect(hud).not.toBeNull();
    expect(within(hud as HTMLElement).getByText('03 NODES')).toBeInTheDocument();
    expect(within(hud as HTMLElement).getByText('02 DOCS')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('ONLINE');
  });
});
