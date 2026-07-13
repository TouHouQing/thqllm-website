import { Layout as BasicLayout } from '@rspress/core/theme-original';
import { HomeLayout } from './layouts/HomeLayout';
import './index.css';

export function Layout() {
  return <BasicLayout HomeLayout={HomeLayout} />;
}

export * from '@rspress/core/theme-original';
