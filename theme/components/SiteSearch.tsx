import { NoSSR } from '@rspress/core/runtime';
import { IconSearch, SearchButton, SearchPanel, SvgWrapper } from '@rspress/core/theme-original';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './SiteSearch.module.css';

export const OPEN_SEARCH_EVENT = 'thqllm:open-search';

const CURRENT_DEFAULT_SUGGESTION_SELECTOR = '.rp-suggest-item--current .rp-suggest-item__link';
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

export function SiteSearch() {
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    // Compatibility guard for pinned Rspress 2.0.17, whose passive-effect
    // listener dereferences a missing suggestion for every document Enter.
    // The current default suggestion classes are its stable rendered DOM contract.
    const guardUnsafeEnter = (event: KeyboardEvent) => {
      if (event.code !== 'Enter' || event.isComposing) {
        return;
      }

      const hasCurrentDefaultSuggestion =
        focusedRef.current && document.querySelector(CURRENT_DEFAULT_SUGGESTION_SELECTOR) !== null;
      if (!hasCurrentDefaultSuggestion) {
        event.stopImmediatePropagation();
      }
    };

    document.addEventListener('keydown', guardUnsafeEnter);
    return () => {
      document.removeEventListener('keydown', guardUnsafeEnter);
    };
  }, []);

  const openSearch = useCallback((restoreTarget: HTMLElement | null) => {
    if (!focusedRef.current) {
      restoreFocusRef.current = restoreTarget;
    }
    focusedRef.current = true;
    setFocused(true);
  }, []);

  const setSearchFocused = useCallback(
    (nextFocused: boolean) => {
      if (nextFocused) {
        openSearch(document.activeElement instanceof HTMLElement ? document.activeElement : null);
        return;
      }
      focusedRef.current = false;
      setFocused(false);
    },
    [openSearch],
  );

  useEffect(() => {
    const handleOpenSearch = (event: Event) => {
      openSearch(event.target instanceof HTMLElement ? event.target : null);
    };

    window.addEventListener(OPEN_SEARCH_EVENT, handleOpenSearch as EventListener);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, handleOpenSearch as EventListener);
    };
  }, [openSearch]);

  useEffect(() => {
    if (!focused && restoreFocusRef.current) {
      restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    }
  }, [focused]);

  return (
    <>
      <SearchButton setFocused={setSearchFocused} />
      <button
        className={styles.mobileButton}
        type="button"
        aria-label="搜索"
        onClick={(event) => {
          openSearch(event.currentTarget);
        }}
      >
        <SvgWrapper icon={IconSearch} aria-hidden="true" />
      </button>
      <NoSSR>
        <SearchPanel focused={focused} setFocused={setSearchFocused} />
      </NoSSR>
    </>
  );
}

export { SiteSearch as Search };
