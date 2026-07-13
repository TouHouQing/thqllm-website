import { Layout as BasicLayout, type LayoutProps } from '@rspress/core/theme-original';
import { DocProjectHeader } from './components/DocProjectHeader';
import { ApiEndpoint } from './components/mdx/ApiEndpoint';
import { ParameterTable } from './components/mdx/ParameterTable';
import { ProjectLink } from './components/mdx/ProjectLink';
import { ProjectDocSwitcher } from './components/ProjectDocSwitcher';
import { HomeLayout } from './layouts/HomeLayout';
import { NotFoundLayout } from './layouts/NotFoundLayout';
import './index.css';

type MdxComponentMap = NonNullable<LayoutProps['components']>;

const mdxComponents = {
  ApiEndpoint,
  ParameterTable,
  ProjectLink,
} as unknown as MdxComponentMap;

export function Layout() {
  return (
    <BasicLayout
      HomeLayout={HomeLayout}
      NotFoundLayout={NotFoundLayout}
      afterNav={<ProjectDocSwitcher />}
      beforeDoc={<DocProjectHeader />}
      components={mdxComponents}
    />
  );
}

export * from '@rspress/core/theme-original';
