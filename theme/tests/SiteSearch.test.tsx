import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteSearch } from '../components/SiteSearch';

const { upstreamDocumentEnterListener } = vi.hoisted(() => ({
  upstreamDocumentEnterListener: vi.fn(),
}));

vi.mock('@rspress/core/runtime', () => ({
  NoSSR: ({ children }: PropsWithChildren) => children,
}));

vi.mock('@rspress/core/theme-original', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  return {
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
    }) => {
      React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.code === 'Enter' && !event.isComposing) {
            upstreamDocumentEnterListener(event);
          }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
          document.removeEventListener('keydown', handleKeyDown);
        };
      }, [focused]);

      return focused ? (
        <div role="dialog" aria-label="站点搜索">
          <input
            aria-label="SearchPanelInput"
            onClick={() => setFocused(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setFocused(false);
              }
            }}
          />
        </div>
      ) : null;
    },
    SvgWrapper: () => <svg aria-hidden="true" />,
  };
});

afterEach(() => {
  cleanup();
  upstreamDocumentEnterListener.mockClear();
});

describe('SiteSearch', () => {
  it('stops unsafe Enter before the later SearchPanel document listener', async () => {
    const user = userEvent.setup();
    render(<SiteSearch />);

    const desktopSearch = screen.getByRole('button', { name: '桌面搜索' });
    desktopSearch.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('dialog', { name: '站点搜索' })).toBeInTheDocument();
    expect(upstreamDocumentEnterListener).not.toHaveBeenCalled();

    const searchInput = screen.getByRole('textbox', { name: 'SearchPanelInput' });
    const emptyQueryEnter = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Enter',
      key: 'Enter',
    });
    searchInput.dispatchEvent(emptyQueryEnter);

    expect(upstreamDocumentEnterListener).not.toHaveBeenCalled();
    expect(emptyQueryEnter.defaultPrevented).toBe(false);
  });

  it('allows Enter to reach SearchPanel when a current default suggestion exists', async () => {
    const user = userEvent.setup();
    render(<SiteSearch />);

    await user.click(screen.getByRole('button', { name: '桌面搜索' }));

    const currentSuggestion = document.createElement('div');
    currentSuggestion.className = 'rp-suggest-item--current';
    const currentSuggestionLink = document.createElement('a');
    currentSuggestionLink.className = 'rp-suggest-item__link';
    currentSuggestionLink.href = '/docs/toho-image-studio/';
    currentSuggestion.append(currentSuggestionLink);
    screen.getByRole('dialog', { name: '站点搜索' }).append(currentSuggestion);

    const searchInput = screen.getByRole('textbox', { name: 'SearchPanelInput' });
    const currentSuggestionEnter = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Enter',
      key: 'Enter',
    });
    searchInput.dispatchEvent(currentSuggestionEnter);

    expect(upstreamDocumentEnterListener).toHaveBeenCalledTimes(1);
    expect(currentSuggestionEnter.defaultPrevented).toBe(false);
  });

  it('leaves composing Enter available to later document listeners', () => {
    render(<SiteSearch />);

    const laterDocumentListener = vi.fn();
    document.addEventListener('keydown', laterDocumentListener);

    try {
      const composingEnter = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Enter',
        isComposing: true,
        key: 'Enter',
      });
      screen.getByRole('button', { name: '桌面搜索' }).dispatchEvent(composingEnter);

      expect(laterDocumentListener).toHaveBeenCalledTimes(1);
      expect(upstreamDocumentEnterListener).not.toHaveBeenCalled();
      expect(composingEnter.defaultPrevented).toBe(false);
    } finally {
      document.removeEventListener('keydown', laterDocumentListener);
    }
  });

  it('provides a semantic mobile trigger for pointer and keyboard users', async () => {
    const user = userEvent.setup();
    render(<SiteSearch />);

    const mobileSearch = screen.getByRole('button', { name: /^搜索$/ });
    expect(mobileSearch).toHaveAttribute('type', 'button');

    await user.click(mobileSearch);
    expect(screen.getAllByRole('dialog', { name: '站点搜索' })).toHaveLength(1);

    const searchInput = screen.getByRole('textbox', { name: 'SearchPanelInput' });
    await user.click(searchInput);
    expect(searchInput).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '站点搜索' })).not.toBeInTheDocument();
    expect(mobileSearch).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getAllByRole('dialog', { name: '站点搜索' })).toHaveLength(1);

    await user.click(screen.getByRole('textbox', { name: 'SearchPanelInput' }));
    await user.keyboard('{Escape}');
    expect(mobileSearch).toHaveFocus();

    await user.keyboard(' ');
    expect(screen.getAllByRole('dialog', { name: '站点搜索' })).toHaveLength(1);
  });

  it('restores focus to the upstream desktop trigger when the panel closes', async () => {
    const user = userEvent.setup();
    render(<SiteSearch />);

    const desktopSearch = screen.getByRole('button', { name: '桌面搜索' });
    await user.click(desktopSearch);
    expect(screen.getAllByRole('dialog', { name: '站点搜索' })).toHaveLength(1);

    const searchInput = screen.getByRole('textbox', { name: 'SearchPanelInput' });
    await user.click(searchInput);
    expect(searchInput).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(desktopSearch).toHaveFocus();
  });
});
