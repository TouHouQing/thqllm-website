import { NoSSR } from '@rspress/core/runtime';
import { IconSearch, SearchButton, SearchPanel, SvgWrapper } from '@rspress/core/theme-original';
import { useEffect, useRef, useState } from 'react';
import styles from './SiteSearch.module.css';

export const OPEN_SEARCH_EVENT = 'thqllm:open-search';

export function SiteSearch() {
  const [focused, setFocused] = useState(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const openSearch = (event: Event) => {
      restoreFocusRef.current = event.target instanceof HTMLElement ? event.target : null;
      setFocused(true);
    };

    window.addEventListener(OPEN_SEARCH_EVENT, openSearch as EventListener);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, openSearch as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!focused && restoreFocusRef.current) {
      restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    }
  }, [focused]);

  return (
    <>
      <SearchButton setFocused={setFocused} />
      <button
        className={styles.mobileButton}
        type="button"
        aria-label="搜索"
        onClick={() => setFocused(true)}
      >
        <SvgWrapper icon={IconSearch} aria-hidden="true" />
      </button>
      <NoSSR>
        <SearchPanel focused={focused} setFocused={setFocused} />
      </NoSSR>
    </>
  );
}

export { SiteSearch as Search };
