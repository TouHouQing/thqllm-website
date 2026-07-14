import { useLocation } from '@rspress/core/runtime';
import { useEffect } from 'react';

function setAttributeIfNeeded(element: Element, name: string, value: string) {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

export function AccessibilityGuards() {
  const { pathname } = useLocation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: Route changes replace the Rspress document chrome.
  useEffect(() => {
    for (const anchor of document.querySelectorAll('.rp-header-anchor[aria-hidden="true"]')) {
      setAttributeIfNeeded(anchor, 'tabindex', '-1');
    }

    for (const sidebar of document.querySelectorAll('.rp-doc-layout__sidebar')) {
      setAttributeIfNeeded(sidebar, 'aria-label', '文档导航');
    }

    for (const outline of document.querySelectorAll('.rp-doc-layout__outline')) {
      setAttributeIfNeeded(outline, 'aria-label', '页内目录');
    }
  }, [pathname]);

  return null;
}
