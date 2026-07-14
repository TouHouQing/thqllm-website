import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SiteSearch } from '../components/SiteSearch';

vi.mock('@rspress/core/runtime', () => ({
  NoSSR: ({ children }: PropsWithChildren) => children,
}));

vi.mock('@rspress/core/theme-original', () => ({
  IconSearch: () => <svg aria-hidden="true" />,
  SearchButton: ({ setFocused }: { setFocused: (focused: boolean) => void }) => (
    <button type="button" aria-label="桌面搜索" onClick={() => setFocused(true)}>
      桌面搜索
    </button>
  ),
  SearchPanel: ({
    focused,
    setFocused,
  }: {
    focused: boolean;
    setFocused: (focused: boolean) => void;
  }) =>
    focused ? (
      <div role="dialog" aria-label="站点搜索">
        <button type="button" onClick={() => setFocused(false)}>
          关闭搜索
        </button>
      </div>
    ) : null,
  SvgWrapper: () => <svg aria-hidden="true" />,
}));

describe('SiteSearch', () => {
  it('provides a semantic mobile trigger for pointer and keyboard users', async () => {
    const user = userEvent.setup();
    render(<SiteSearch />);

    const mobileSearch = screen.getByRole('button', { name: /^搜索$/ });
    expect(mobileSearch).toHaveAttribute('type', 'button');

    await user.click(mobileSearch);
    expect(screen.getByRole('dialog', { name: '站点搜索' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭搜索' }));
    mobileSearch.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: '站点搜索' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭搜索' }));
    mobileSearch.focus();
    await user.keyboard(' ');
    expect(screen.getByRole('dialog', { name: '站点搜索' })).toBeInTheDocument();
  });
});
