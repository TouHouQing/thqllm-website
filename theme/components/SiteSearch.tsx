import { NoSSR } from '@rspress/core/runtime';
import { IconSearch, SearchButton, SearchPanel, SvgWrapper } from '@rspress/core/theme-original';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './SiteSearch.module.css';

export const OPEN_SEARCH_EVENT = 'thqllm:open-search';

export function SiteSearch() {
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

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
