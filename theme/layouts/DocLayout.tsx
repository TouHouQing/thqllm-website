// Fixed-version Rspress 2.0.17 adapter: preserve the original mobile sidebar and outline behavior.
import { useSidebarMenu } from '@rspress/core/dist/theme/components/SidebarMenu/useSidebarMenu.js';
import { useFrontmatter, useLocation } from '@rspress/core/runtime';
import {
  DocContent,
  DocFooter,
  type DocLayoutProps,
  Outline,
  Overview,
  Sidebar,
  useWatchToc,
} from '@rspress/core/theme-original';
import { useEffect, useRef } from 'react';
import '@rspress/core/dist/theme/layout/DocLayout/index.css';

const DOC_PANEL_TOP_PROPERTY = '--thq-doc-panel-top';

export function DocLayout(props: DocLayoutProps) {
  if (import.meta.env.SSG_MD) {
    return <SsgMdDocLayout {...props} />;
  }

  return <RenderedDocLayout {...props} />;
}

function SsgMdDocLayout({ components }: DocLayoutProps) {
  const { frontmatter } = useFrontmatter();
  const isOverviewPage = frontmatter?.overview ?? false;

  return (
    <>
      {isOverviewPage ? (
        <Overview content={<DocContent components={components} isOverviewPage />} />
      ) : (
        <DocContent components={components} />
      )}
    </>
  );
}

function RenderedDocLayout(props: DocLayoutProps) {
  const {
    beforeDocFooter,
    afterDocFooter,
    beforeDoc,
    afterDoc,
    beforeDocContent,
    afterDocContent,
    beforeOutline,
    afterOutline,
    beforeSidebar,
    afterSidebar,
    components,
  } = props;
  const { frontmatter } = useFrontmatter();
  const { pathname } = useLocation();
  const isOverviewPage = frontmatter?.overview ?? false;
  const sidebar = frontmatter?.sidebar ?? true;
  const showSidebar = sidebar === true;
  const showSidebarPlaceholder = sidebar === false || sidebar === 'placeholder';
  const isLegacyPlaceholder = sidebar === 'placeholder';
  const { outline: showOutline = true, footer: showDocFooter = true, pageType } = frontmatter;
  const showSidebarMenu = showSidebar || (!isOverviewPage && showOutline);
  const isDocWide = pageType === 'doc-wide';
  const { isOutlineOpen, isSidebarOpen, sidebarMenu, asideLayoutRef, sidebarLayoutRef } =
    useSidebarMenu(beforeOutline, afterOutline);
  const { rspressDocRef } = useWatchToc();
  const menuLayoutRef = useRef<HTMLDivElement>(null);
  const containerLayoutRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Client navigation replaces observed sibling nodes without changing menu visibility.
  useEffect(() => {
    const menu = menuLayoutRef.current;
    const container = containerLayoutRef.current;
    if (!showSidebarMenu || !menu || !container) {
      return;
    }

    let animationFrame: number | null = null;
    let disposed = false;

    const updatePanelTop = () => {
      animationFrame = null;

      if (window.innerWidth >= 1280) {
        container.style.removeProperty(DOC_PANEL_TOP_PROPERTY);
        return;
      }

      container.style.setProperty(
        DOC_PANEL_TOP_PROPERTY,
        `${Math.max(0, menu.getBoundingClientRect().bottom)}px`,
      );
    };

    const schedulePanelTopUpdate = () => {
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(updatePanelTop);
      }
    };

    const resizeObserver = new ResizeObserver(schedulePanelTopUpdate);
    resizeObserver.observe(menu);
    if (menu.parentElement) {
      for (const sibling of menu.parentElement.children) {
        if (sibling === menu) {
          break;
        }
        resizeObserver.observe(sibling);
      }
    }

    window.addEventListener('scroll', schedulePanelTopUpdate, { passive: true });
    window.addEventListener('resize', schedulePanelTopUpdate);
    schedulePanelTopUpdate();
    void document.fonts?.ready.then(() => {
      if (!disposed) {
        schedulePanelTopUpdate();
      }
    });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener('scroll', schedulePanelTopUpdate);
      window.removeEventListener('resize', schedulePanelTopUpdate);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      container.style.removeProperty(DOC_PANEL_TOP_PROPERTY);
    };
  }, [pathname, showSidebarMenu]);

  return (
    <>
      {showSidebarMenu && (
        <div className="rp-doc-layout__menu" ref={menuLayoutRef}>
          {sidebarMenu}
        </div>
      )}
      {beforeDoc}
      <div
        className={`rp-doc-layout__container${
          showSidebarMenu ? '' : ' rp-doc-layout__container--no-menu'
        }`}
        ref={containerLayoutRef}
      >
        {showSidebar ? (
          <aside
            aria-label="文档导航"
            className={`rp-doc-layout__sidebar${
              isSidebarOpen ? ' rp-doc-layout__sidebar--open' : ''
            } rp-scrollbar`}
            id="thq-doc-sidebar"
            ref={sidebarLayoutRef}
          >
            {beforeSidebar}
            <Sidebar />
            {afterSidebar}
          </aside>
        ) : showSidebarPlaceholder ? (
          <div
            className={`rp-doc-layout__sidebar-placeholder${
              isLegacyPlaceholder ? ' rp-doc-layout__sidebar-placeholder--legacy' : ''
            }`}
            style={isDocWide ? { width: '0' } : {}}
          />
        ) : null}
        {isOverviewPage ? (
          <main className="rp-doc-layout__overview">
            {beforeDocContent}
            <Overview content={<DocContent components={components} isOverviewPage />} />
            {afterDocContent}
          </main>
        ) : (
          <div className={`rp-doc-layout__doc${isDocWide ? ' rp-doc-layout__doc--wide' : ''}`}>
            <main className="rp-doc-layout__doc-container">
              {beforeDocContent}
              <div className="rp-doc rspress-doc" ref={rspressDocRef}>
                <DocContent components={components} />
              </div>
              {afterDocContent}
              {beforeDocFooter}
              {showDocFooter && <DocFooter />}
              {afterDocFooter}
            </main>
          </div>
        )}
        {isOverviewPage ? null : showOutline ? (
          <aside
            aria-label="页内目录"
            className={`rp-doc-layout__outline${
              isOutlineOpen ? ' rp-doc-layout__outline--open' : ''
            } rp-scrollbar`}
            id="thq-doc-outline"
            ref={asideLayoutRef}
          >
            {beforeOutline}
            <Outline />
            {afterOutline}
          </aside>
        ) : (
          <div
            className="rp-doc-layout__outline-placeholder"
            style={isDocWide ? { width: '0' } : {}}
          />
        )}
      </div>
      {afterDoc}
    </>
  );
}
