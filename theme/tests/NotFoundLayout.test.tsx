import { MemoryRouter } from '@rspress/core/runtime';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OPEN_SEARCH_EVENT } from '../components/SiteSearch';
import { NotFoundLayout } from '../layouts/NotFoundLayout';

// Rspress provides its virtual route modules only during the site build.
vi.mock('@rspress/core/runtime', () => ({
  MemoryRouter: ({ children }: PropsWithChildren) => children,
}));

vi.mock('@rspress/core/theme-original', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));

describe('NotFoundLayout', () => {
  it('offers accessible recovery actions', async () => {
    const user = userEvent.setup();
    const searchEventListener = vi.fn();

    window.addEventListener(OPEN_SEARCH_EVENT, searchEventListener);

    render(
      <MemoryRouter>
        <NotFoundLayout />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'CONTINUE?' })).toBeInTheDocument();
    expect(screen.getByText('没有找到这个页面。请选择下一步。')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '错误页恢复操作' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '查看项目' })).toHaveAttribute('href', '/projects/');

    const searchRegion = document.querySelector('search[aria-label="错误页站点搜索"]');
    expect(searchRegion).not.toBeNull();

    const searchForm = searchRegion?.querySelector('form');
    expect(searchForm).not.toBeNull();
    expect(searchForm).toHaveAttribute('action', '/docs/fluctgraph/');
    expect(searchForm).toHaveAttribute('method', 'get');

    const homeLink = screen.getByRole('link', { name: '返回首页' });
    const projectLink = screen.getByRole('link', { name: '查看项目' });
    const searchButton = screen.getByRole('button', { name: '搜索文档' });

    expect(homeLink.className).toContain('primaryLink');
    expect(projectLink.className).not.toContain('primaryLink');
    expect(searchButton.className).not.toContain('primaryLink');

    expect(searchButton).toBeInTheDocument();
    expect(searchButton).toHaveAttribute('type', 'submit');
    expect(screen.queryByRole('link', { name: '搜索文档' })).not.toBeInTheDocument();

    await user.click(searchButton);

    expect(searchEventListener).toHaveBeenCalledTimes(1);
    const [event] = searchEventListener.mock.calls[0] ?? [];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event).toHaveProperty('type', 'thqllm:open-search');
    expect(event).toHaveProperty('detail.source', 'not-found-layout');
    expect(event).toHaveProperty('target', searchButton);
  });
});
