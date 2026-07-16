import { Layout as BasicLayout, type LayoutProps } from '@rspress/core/theme-original';
import { DocProjectHeader } from './components/DocProjectHeader';
import { AccessibleTable } from './components/mdx/AccessibleTable';
import { ApiEndpoint } from './components/mdx/ApiEndpoint';
import { ParameterTable } from './components/mdx/ParameterTable';
import { ProjectLink } from './components/mdx/ProjectLink';
import { NoScriptNavigation } from './components/NoScriptNavigation';
import { ProjectDocSwitcher } from './components/ProjectDocSwitcher';
import { SiteSearch } from './components/SiteSearch';

export { DocLayout } from './layouts/DocLayout';

import { HomeLayout } from './layouts/HomeLayout';
import { NotFoundLayout } from './layouts/NotFoundLayout';
import './index.css';

type MdxComponentMap = NonNullable<LayoutProps['components']>;

const mdxComponents = {
  ApiEndpoint,
  ParameterTable,
  ProjectLink,
  table: AccessibleTable,
} as unknown as MdxComponentMap;

export function Layout() {
  return (
    <BasicLayout
      HomeLayout={HomeLayout}
      NotFoundLayout={NotFoundLayout}
      afterNav={
        <>
          <NoScriptNavigation />
          <ProjectDocSwitcher />
        </>
      }
      beforeDoc={<DocProjectHeader />}
      components={mdxComponents}
    />
  );
}

export * from '@rspress/core/theme-original';
export { SiteSearch as Search };
