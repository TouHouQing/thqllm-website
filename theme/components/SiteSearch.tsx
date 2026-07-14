import { NoSSR } from '@rspress/core/runtime';
import { SearchButton, SearchPanel } from '@rspress/core/theme-original';
import { useEffect, useState } from 'react';

export const OPEN_SEARCH_EVENT = 'thqllm:open-search';

export function SiteSearch() {
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const openSearch = () => {
      setFocused(true);
    };

    window.addEventListener(OPEN_SEARCH_EVENT, openSearch as EventListener);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, openSearch as EventListener);
    };
  }, []);

  return (
    <>
      <SearchButton setFocused={setFocused} />
      <NoSSR>
        <SearchPanel focused={focused} setFocused={setFocused} />
      </NoSSR>
    </>
  );
}

export { SiteSearch as Search };
