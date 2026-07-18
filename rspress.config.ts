import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import { pluginLlms } from '@rspress/plugin-llms';
import { pluginSitemap } from '@rspress/plugin-sitemap';
import { projects } from './src/data/projects';
import { createProjectBuildManifest } from './src/lib/project-build-manifest';
import { createProjectBuildManifestPlugin } from './src/lib/project-build-manifest-plugin';
import { createProjectExternalLinksRemarkPlugin } from './src/lib/project-llms';
import { createSidebarConfig } from './src/lib/projects';
import { rehypeAccessibleHeaderAnchors } from './src/lib/rehypeAccessibleHeaderAnchors';

const siteRoot = path.join(__dirname, 'site');
const outDir = path.join(__dirname, 'doc_build');
const projectBuildManifest = createProjectBuildManifest(projects);

export default defineConfig({
  root: siteRoot,
  outDir,
  lang: 'zh',
  title: 'THQLLM',
  description: '模型中转、AI 编程、图像生成与实验工具的统一项目入口。',
  icon: '/favicon.svg',
  logo: {
    light: '/favicon.svg',
    dark: '/favicon.svg',
  },
  logoText: 'THQLLM',
  head: [
    ['meta', { name: 'theme-color', content: '#263E3A' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'THQLLM' }],
    ['meta', { property: 'og:image', content: 'https://thqllm.com/og-cover.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],
  markdown: {
    link: {
      checkDeadLinks: true,
    },
    rehypePlugins: [rehypeAccessibleHeaderAnchors],
  },
  plugins: [
    pluginSitemap({
      siteUrl: 'https://thqllm.com',
      defaultChangeFreq: 'weekly',
      defaultPriority: '0.7',
    }),
    pluginLlms({
      llmsTxt: {
        name: 'llms.txt',
      },
      llmsFullTxt: {
        name: 'llms-full.txt',
      },
      mdFiles: {
        mdxToMd: true,
        remarkPlugins: [
          () =>
            createProjectExternalLinksRemarkPlugin(
              projects,
              path.join(siteRoot, 'projects/index.mdx'),
            ),
        ],
      },
    }),
    createProjectBuildManifestPlugin(projectBuildManifest),
  ],
  themeConfig: {
    darkMode: false,
    search: true,
    hideNavbar: 'never',
    enableContentAnimation: false,
    enableAppearanceAnimation: false,
    lastUpdated: true,
    sidebar: createSidebarConfig(projects),
    nav: [
      { text: '项目', link: '/projects/', activeMatch: '/projects/' },
      { text: '文档', link: '/docs/fluctgraph/', activeMatch: '/docs/' },
      { text: '关于', link: '/about/', activeMatch: '/about/' },
    ],
  },
});
