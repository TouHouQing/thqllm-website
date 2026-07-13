import { MemoryRouter } from '@rspress/core/runtime';
import { render, screen } from '@testing-library/react';
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
  it('offers accessible recovery links', () => {
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
    expect(screen.getByRole('link', { name: '搜索文档' })).toHaveAttribute(
      'href',
      '/docs/fluctgraph/',
    );
  });
});
