import { MemoryRouter } from '@rspress/core/runtime';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const user = userEvent.setup();

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

    const searchButton = screen.getByRole('button', { name: '搜索文档' });
    expect(searchButton).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '搜索文档' })).not.toBeInTheDocument();

    await user.click(searchButton);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const [event] = dispatchSpy.mock.calls[0] ?? [];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event).toHaveProperty('type', 'thqllm:open-search');
    expect(event).toHaveProperty('detail.source', 'not-found-layout');
  });
});
