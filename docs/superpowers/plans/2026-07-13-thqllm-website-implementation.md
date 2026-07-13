# THQLLM Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-static THQLLM project portal and Markdown/MDX documentation site with an original character-free Japanese doujin bullet-hell title-screen aesthetic.

**Architecture:** Rspress 2 uses `site/` as its public content root, while React theme code lives in `theme/` and typed project metadata lives in `src/`. A custom `HomeLayout` provides the title-screen homepage, the original Rspress documentation layout is enhanced through slots, and all project navigation/sidebar data is generated from one validated registry.

**Tech Stack:** Rspress 2.0.17, React 19, TypeScript, Zod, CSS Modules, Lucide React, Vitest, Testing Library, Playwright, Axe, Biome, Sharp

---

## File Structure

```text
.
├── package.json                         # Scripts and pinned dependencies
├── pnpm-lock.yaml                       # Reproducible dependency graph
├── rspress.config.ts                    # Static-site, nav, sidebar, sitemap, llms config
├── tsconfig.json                        # Strict TypeScript configuration
├── biome.json                           # Formatting and linting
├── vitest.config.ts                     # Unit/component test configuration
├── playwright.config.ts                 # Production-browser test configuration
├── scripts/
│   └── verify-build.mjs                 # Verifies required static routes and banned copy
├── src/
│   ├── data/
│   │   ├── project-schema.ts            # Zod schemas and exported project types
│   │   ├── projects.ts                  # Single registry for project and docs metadata
│   │   ├── projects.test.ts             # Registry validation tests
│   │   └── notes.ts                     # Homepage development-note metadata
│   └── lib/
│       ├── projects.ts                  # Sorting, route matching, sidebar generation
│       ├── projects.test.ts             # Project helper tests
│       ├── danmaku.ts                   # Deterministic bullet-frame geometry
│       └── danmaku.test.ts              # Bullet geometry tests
├── site/
│   ├── index.mdx                        # Home route metadata
│   ├── projects/index.mdx               # Complete project directory
│   ├── notes/index.mdx                  # Development notes
│   ├── about/index.mdx                  # About THQLLM
│   ├── docs/
│   │   ├── fluctgraph/                  # Four verified FluctGraph documents
│   │   ├── thq-api/                     # Four verified THQ API documents
│   │   └── toho-image-studio/           # Four verified image-studio documents
│   └── public/
│       ├── favicon.svg                  # THQ seal mark
│       ├── robots.txt                   # Search crawler policy
│       ├── og-cover.png                 # 1200x630 social preview
│       └── assets/hero/
│           ├── thqllm-title-desktop.webp
│           └── thqllm-title-mobile.webp
├── theme/
│   ├── env.d.ts                         # CSS-module and Rspress env declarations
│   ├── index.tsx                        # Original theme exports plus custom slots/layouts
│   ├── index.css                        # Font and global-style entrypoint
│   ├── styles/
│   │   ├── tokens.css                   # Brand colors, typography, sizing
│   │   └── global.css                   # Rspress overrides, focus, docs shell
│   ├── layouts/
│   │   ├── HomeLayout.tsx               # Homepage composition
│   │   ├── HomeLayout.module.css
│   │   ├── NotFoundLayout.tsx           # Continue-style 404 page
│   │   └── NotFoundLayout.module.css
│   ├── components/
│   │   ├── HeroTitleScreen.tsx          # THQLLM title, menu, picture, HUD
│   │   ├── HeroTitleScreen.module.css
│   │   ├── DanmakuCanvas.tsx            # Progressive canvas decoration
│   │   ├── ProjectStageGrid.tsx          # Featured Stage Select cards
│   │   ├── ProjectStageGrid.module.css
│   │   ├── HomeBands.tsx                 # Manual, notes, about, footer bands
│   │   ├── HomeBands.module.css
│   │   ├── ProjectsDirectory.tsx         # `/projects/` content
│   │   ├── ProjectDocSwitcher.tsx        # Current-doc project switcher
│   │   ├── DocProjectHeader.tsx          # Stage/project strip above doc content
│   │   ├── DocsChrome.module.css
│   │   └── mdx/
│   │       ├── ProjectLink.tsx           # Safe external project button
│   │       ├── ApiEndpoint.tsx           # Method/path display
│   │       ├── ParameterTable.tsx        # Accessible parameter table
│   │       └── MdxComponents.module.css
│   └── tests/
│       ├── HeroTitleScreen.test.tsx
│       ├── ProjectStageGrid.test.tsx
│       ├── ProjectDocSwitcher.test.tsx
│       ├── MdxComponents.test.tsx
│       └── NotFoundLayout.test.tsx
└── tests/
    ├── setup.ts                          # Jest DOM setup and matchMedia stub
    └── e2e/
        ├── home.spec.ts                  # Portal, keyboard, links, visual checks
        ├── docs.spec.ts                  # Docs navigation, search, components
        └── responsive.spec.ts            # Mobile overflow and reduced motion
```

## Task 1: Scaffold Rspress and Verification Tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `tests/setup.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "thqllm-website",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "rspress build",
    "check": "biome check .",
    "check:fix": "biome check --write .",
    "dev": "rspress dev",
    "preview": "rspress preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:update": "playwright test --update-snapshots",
    "verify:build": "node scripts/verify-build.mjs",
    "verify": "pnpm check && pnpm typecheck && pnpm test && pnpm build && pnpm verify:build && pnpm test:e2e"
  },
  "dependencies": {
    "@fontsource/cormorant-garamond": "5.2.11",
    "@fontsource/jetbrains-mono": "5.2.8",
    "@rspress/core": "2.0.17",
    "@rspress/plugin-llms": "2.0.17",
    "@rspress/plugin-sitemap": "2.0.17",
    "lucide-react": "1.24.0",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.12.1",
    "@biomejs/biome": "2.4.15",
    "@playwright/test": "1.61.1",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/node": "22.20.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitest/coverage-v8": "4.1.10",
    "jsdom": "29.1.1",
    "sharp": "0.35.3",
    "typescript": "6.0.3",
    "vitest": "4.1.10"
  },
  "packageManager": "pnpm@11.7.0"
}
```

- [ ] **Step 2: Install dependencies and Chromium**

Run:

```bash
pnpm install
pnpm exec playwright install chromium
```

Expected: `pnpm-lock.yaml` is created and Playwright reports Chromium installed.

- [ ] **Step 3: Create strict TypeScript, Biome, Vitest, and Playwright configs**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "lib": ["DOM", "ES2023"],
    "jsx": "react-jsx",
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": [
    "site",
    "src",
    "theme",
    "tests",
    "rspress.config.ts",
    "vitest.config.ts",
    "playwright.config.ts"
  ],
  "mdx": {
    "checkMdx": true
  }
}
```

`biome.json`:

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  },
  "formatter": {
    "indentStyle": "space",
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  },
  "css": {
    "parser": {
      "cssModules": true
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

`vitest.config.ts`:

```ts
import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'theme/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
  ],
});
```

`tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => null,
});
```

- [ ] **Step 4: Extend ignored generated paths**

Append to `.gitignore`:

```gitignore
coverage/
playwright-report/
test-results/
tmp/
```

- [ ] **Step 5: Verify the toolchain parses**

Run:

```bash
pnpm check
pnpm typecheck
```

Expected: both commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json biome.json vitest.config.ts playwright.config.ts tests/setup.ts .gitignore
git commit -m "chore: scaffold rspress and test tooling"
```

## Task 2: Build the Validated Project Registry

**Files:**
- Create: `src/data/project-schema.ts`
- Create: `src/data/projects.ts`
- Create: `src/data/projects.test.ts`

- [ ] **Step 1: Write failing project-schema tests**

`src/data/projects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { projectListSchema } from './project-schema';
import { projects } from './projects';

const validProject = {
  id: 'sample',
  name: 'Sample',
  stageLabel: 'STAGE 09',
  categoryLabel: 'EXPERIMENT',
  description: 'A verified sample project.',
  externalUrl: 'https://example.com/',
  docs: {
    basePath: '/docs/sample/',
    sections: [
      {
        text: '开始',
        items: [
          { text: '概览', slug: 'index' },
          { text: '快速开始', slug: 'quick-start' },
        ],
      },
    ],
  },
  accent: 'vermilion',
  tags: ['AI'],
  order: 9,
  featured: false,
};

describe('projectListSchema', () => {
  it('accepts the checked-in registry', () => {
    expect(projects).toHaveLength(3);
  });

  it('rejects non-HTTPS project URLs', () => {
    expect(() =>
      projectListSchema.parse([{ ...validProject, externalUrl: 'http://example.com/' }]),
    ).toThrow();
  });

  it('rejects duplicate project ids', () => {
    expect(() => projectListSchema.parse([validProject, validProject])).toThrow(
      /Duplicate project id/,
    );
  });

  it('rejects duplicate order values', () => {
    expect(() =>
      projectListSchema.parse([
        validProject,
        { ...validProject, id: 'sample-two', externalUrl: 'https://two.example.com/' },
      ]),
    ).toThrow(/Duplicate project order/);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing modules**

Run:

```bash
pnpm test src/data/projects.test.ts
```

Expected: FAIL because `project-schema.ts` and `projects.ts` do not exist.

- [ ] **Step 3: Implement schemas and exported types**

`src/data/project-schema.ts`:

```ts
import { z } from 'zod';

const slugSchema = z.string().regex(/^(index|[a-z0-9]+(?:-[a-z0-9]+)*)$/);

export const projectDocItemSchema = z.object({
  text: z.string().min(1),
  slug: slugSchema,
});

export const projectDocSectionSchema = z.object({
  text: z.string().min(1),
  items: z.array(projectDocItemSchema).min(1),
});

export const projectSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  stageLabel: z.string().min(1),
  categoryLabel: z.string().min(1),
  description: z.string().min(10),
  externalUrl: z
    .url()
    .refine((value) => value.startsWith('https://'), 'Project URLs must use HTTPS'),
  docs: z
    .object({
      basePath: z.string().regex(/^\/docs\/[a-z0-9-]+\/$/),
      sections: z.array(projectDocSectionSchema).min(1),
    })
    .optional(),
  accent: z.enum(['vermilion', 'cyan', 'gold', 'sakura']),
  tags: z.array(z.string().min(1)).min(1),
  order: z.number().int().nonnegative(),
  featured: z.boolean(),
});

export const projectListSchema = z.array(projectSchema).min(1).superRefine((items, context) => {
  const ids = new Set<string>();
  const orders = new Set<number>();

  for (const [index, item] of items.entries()) {
    if (ids.has(item.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate project id: ${item.id}`,
        path: [index, 'id'],
      });
    }
    if (orders.has(item.order)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate project order: ${item.order}`,
        path: [index, 'order'],
      });
    }
    ids.add(item.id);
    orders.add(item.order);
  }
});

export type ProjectDefinition = z.infer<typeof projectSchema>;
export type ProjectDocSection = z.infer<typeof projectDocSectionSchema>;
```

- [ ] **Step 4: Add the three initial projects and their documentation navigation**

`src/data/projects.ts`:

```ts
import { projectListSchema } from './project-schema';

export const projects = projectListSchema.parse([
  {
    id: 'fluctgraph',
    name: 'FluctGraph',
    stageLabel: 'STAGE 01',
    categoryLabel: 'KNOWLEDGE GRAPH',
    description: '面向 AI IDE 和 Agent 工作流的私有知识图谱接入层。',
    externalUrl: 'https://graph.tohoqing.com/',
    docs: {
      basePath: '/docs/fluctgraph/',
      sections: [
        {
          text: '开始',
          items: [
            { text: '概览', slug: 'index' },
            { text: '快速开始', slug: 'quick-start' },
          ],
        },
        {
          text: '参考',
          items: [
            { text: '常见问题', slug: 'faq' },
            { text: '更新记录', slug: 'changelog' },
          ],
        },
      ],
    },
    accent: 'vermilion',
    tags: ['知识图谱', 'MCP', 'Agent'],
    order: 1,
    featured: true,
  },
  {
    id: 'thq-api',
    name: 'THQ API',
    stageLabel: 'STAGE 02',
    categoryLabel: 'AI API GATEWAY',
    description: '统一连接多种模型能力的 AI API Gateway 与中转服务。',
    externalUrl: 'https://sub.thqllm.com/',
    docs: {
      basePath: '/docs/thq-api/',
      sections: [
        {
          text: '开始',
          items: [
            { text: '概览', slug: 'index' },
            { text: '快速开始', slug: 'quick-start' },
          ],
        },
        {
          text: '参考',
          items: [
            { text: '常见问题', slug: 'faq' },
            { text: '更新记录', slug: 'changelog' },
          ],
        },
      ],
    },
    accent: 'cyan',
    tags: ['模型中转', 'API', 'OpenAI 兼容'],
    order: 2,
    featured: true,
  },
  {
    id: 'toho-image-studio',
    name: 'Toho Image Studio',
    stageLabel: 'EXTRA STAGE',
    categoryLabel: 'IMAGE WORKSPACE',
    description: '面向图像生成与编辑工作流的浏览器创作空间。',
    externalUrl: 'https://img.tohoqing.com/',
    docs: {
      basePath: '/docs/toho-image-studio/',
      sections: [
        {
          text: '开始',
          items: [
            { text: '概览', slug: 'index' },
            { text: '快速开始', slug: 'quick-start' },
          ],
        },
        {
          text: '参考',
          items: [
            { text: '常见问题', slug: 'faq' },
            { text: '更新记录', slug: 'changelog' },
          ],
        },
      ],
    },
    accent: 'gold',
    tags: ['图像生成', '图像编辑', '提示词'],
    order: 3,
    featured: true,
  },
]);
```

- [ ] **Step 5: Run the registry tests**

Run:

```bash
pnpm test src/data/projects.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/project-schema.ts src/data/projects.ts src/data/projects.test.ts
git commit -m "feat: add validated project registry"
```

## Task 3: Generate Project Routes and Sidebars

**Files:**
- Create: `src/lib/projects.ts`
- Create: `src/lib/projects.test.ts`

- [ ] **Step 1: Write failing helper tests**

`src/lib/projects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { projects } from '../data/projects';
import {
  createSidebarConfig,
  getFeaturedProjects,
  getProjectByPathname,
} from './projects';

describe('project helpers', () => {
  it('sorts featured projects by order', () => {
    expect(getFeaturedProjects(projects).map((project) => project.id)).toEqual([
      'fluctgraph',
      'thq-api',
      'toho-image-studio',
    ]);
  });

  it('matches a nested document route to its project', () => {
    expect(getProjectByPathname('/docs/thq-api/faq')?.id).toBe('thq-api');
  });

  it('returns undefined for non-document routes', () => {
    expect(getProjectByPathname('/projects/')).toBeUndefined();
  });

  it('generates one sidebar root per project', () => {
    const sidebars = createSidebarConfig(projects);
    expect(Object.keys(sidebars)).toEqual([
      '/docs/fluctgraph/',
      '/docs/thq-api/',
      '/docs/toho-image-studio/',
    ]);
    expect(sidebars['/docs/fluctgraph/'][0].items[1]).toEqual({
      text: '快速开始',
      link: '/docs/fluctgraph/quick-start',
    });
  });
});
```

- [ ] **Step 2: Confirm the helper module is missing**

Run:

```bash
pnpm test src/lib/projects.test.ts
```

Expected: FAIL because `src/lib/projects.ts` does not exist.

- [ ] **Step 3: Implement deterministic selectors and sidebar generation**

`src/lib/projects.ts`:

```ts
import type { ProjectDefinition } from '../data/project-schema';
import { projects } from '../data/projects';

export interface SidebarItem {
  text: string;
  link: string;
}

export interface SidebarSection {
  text: string;
  items: SidebarItem[];
}

export type SidebarConfig = Record<string, SidebarSection[]>;

export function getFeaturedProjects(items: readonly ProjectDefinition[]) {
  return items.filter((project) => project.featured).toSorted((a, b) => a.order - b.order);
}

export function getProjectByPathname(pathname: string) {
  return projects.find(
    (project) => project.docs && pathname.startsWith(project.docs.basePath),
  );
}

export function createSidebarConfig(items: readonly ProjectDefinition[]): SidebarConfig {
  return Object.fromEntries(
    items.flatMap((project) => {
      const docs = project.docs;
      if (!docs) {
        return [];
      }
      const sections = docs.sections.map((section) => ({
        text: section.text,
        items: section.items.map((item) => ({
          text: item.text,
          link:
            item.slug === 'index'
              ? docs.basePath
              : `${docs.basePath}${item.slug}`,
        })),
      }));
      return [[docs.basePath, sections]];
    }),
  );
}
```

- [ ] **Step 4: Run helper and registry tests**

Run:

```bash
pnpm test src/lib/projects.test.ts src/data/projects.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects.ts src/lib/projects.test.ts
git commit -m "feat: generate project navigation data"
```

## Task 4: Configure Rspress and Establish the Theme Shell

**Files:**
- Create: `rspress.config.ts`
- Create: `site/index.mdx`
- Create: `site/public/favicon.svg`
- Create: `site/public/robots.txt`
- Create: `theme/env.d.ts`
- Create: `theme/index.tsx`
- Create: `theme/index.css`
- Create: `theme/styles/tokens.css`
- Create: `theme/styles/global.css`

- [ ] **Step 1: Add Rspress config with static plugins**

`rspress.config.ts`:

```ts
import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import { pluginLlms } from '@rspress/plugin-llms';
import { pluginSitemap } from '@rspress/plugin-sitemap';

export default defineConfig({
  root: path.join(__dirname, 'site'),
  outDir: path.join(__dirname, 'doc_build'),
  lang: 'zh-CN',
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
    checkDeadLinks: false,
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
      },
    }),
  ],
  themeConfig: {
    darkMode: false,
    search: true,
    hideNavbar: 'never',
    enableContentAnimation: false,
    enableAppearanceAnimation: false,
    lastUpdated: true,
    nav: [
      { text: '项目', link: '/projects/', activeMatch: '/projects/' },
      { text: '文档', link: '/docs/fluctgraph/', activeMatch: '/docs/' },
      { text: '开发札记', link: '/notes/', activeMatch: '/notes/' },
      { text: '关于', link: '/about/', activeMatch: '/about/' },
    ],
  },
});
```

- [ ] **Step 2: Create the home route metadata and crawler policy**

`site/index.mdx`:

```mdx
---
pageType: home
title: THQLLM
description: 模型中转、AI 编程、图像生成与实验工具的统一项目入口。
---
```

`site/public/robots.txt`:

```text
User-agent: *
Allow: /

Sitemap: https://thqllm.com/sitemap.xml
```

`site/public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="6" fill="#A92935"/>
  <rect x="7" y="7" width="50" height="50" fill="none" stroke="#FFFDF7" stroke-width="3"/>
  <text x="32" y="39" text-anchor="middle" font-family="Georgia, serif" font-size="21" font-weight="700" fill="#FFFDF7">THQ</text>
</svg>
```

- [ ] **Step 3: Add theme exports and global tokens**

`theme/env.d.ts`:

```ts
declare module '*.css';
declare module '*.module.css';

interface ImportMetaEnv {
  readonly SSG_MD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

`theme/index.tsx`:

```tsx
import './index.css';

export * from '@rspress/core/theme-original';
```

`theme/index.css`:

```css
@import '@fontsource/cormorant-garamond/600.css';
@import '@fontsource/cormorant-garamond/700.css';
@import '@fontsource/jetbrains-mono/500.css';
@import './styles/tokens.css';
@import './styles/global.css';
```

`theme/styles/tokens.css`:

```css
:root {
  --thq-ink: #263e3a;
  --thq-ink-deep: #172824;
  --thq-vermilion: #a92935;
  --thq-paper: #fffdf7;
  --thq-paper-muted: #f2ecda;
  --thq-sakura: #f28aa0;
  --thq-cyan: #70d8c7;
  --thq-gold: #f4cf71;
  --thq-sky: #72aebc;
  --thq-text: #2d292a;
  --thq-text-muted: #6c6564;
  --thq-border: #d8d1bc;
  --thq-nav-height: 64px;
  --thq-radius: 6px;
  --thq-display-font: 'Cormorant Garamond', Georgia, serif;
  --thq-serif-font: 'Songti SC', STSong, 'Noto Serif CJK SC', serif;
  --thq-sans-font: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  --thq-mono-font: 'JetBrains Mono', ui-monospace, monospace;

  --rp-c-brand: var(--thq-vermilion);
  --rp-c-brand-dark: #92232e;
  --rp-c-brand-darker: #7f1e28;
  --rp-c-brand-light: #bd3c47;
  --rp-c-brand-lighter: #d25661;
  --rp-c-brand-tint: rgb(169 41 53 / 8%);
}
```

`theme/styles/global.css`:

```css
html {
  color-scheme: light;
  scroll-behavior: smooth;
}

body {
  margin: 0;
  color: var(--thq-text);
  background: var(--thq-paper);
  font-family: var(--thq-sans-font);
  letter-spacing: 0;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  letter-spacing: 0;
}

*:focus-visible {
  outline: 3px solid var(--thq-gold);
  outline-offset: 3px;
}

.rp-nav {
  min-height: var(--thq-nav-height);
  border-bottom: 1px solid rgb(255 253 247 / 15%);
  color: var(--thq-paper);
  background: var(--thq-ink);
}

.rp-nav__title {
  font-family: var(--thq-display-font);
  font-size: 1.45rem;
  letter-spacing: 0;
}

.rp-doc-layout__container,
.rp-doc-layout__doc {
  background: var(--thq-paper);
}

.rp-doc-layout__sidebar {
  border-right: 1px solid var(--thq-border);
  background: var(--thq-paper-muted);
}

.rp-doc-layout__outline {
  border-left: 1px solid var(--thq-border);
  background: #fbf8ef;
}

.rspress-doc h1,
.rspress-doc h2,
.rspress-doc h3 {
  font-family: var(--thq-serif-font);
  letter-spacing: 0;
}

.rspress-doc pre {
  border: 1px solid #18211f;
  border-radius: var(--thq-radius);
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Build the empty site shell**

Run:

```bash
pnpm check
pnpm typecheck
pnpm build
```

Expected: `doc_build/index.html`, `doc_build/sitemap.xml`, and `doc_build/llms.txt` exist.

- [ ] **Step 5: Commit**

```bash
git add rspress.config.ts site theme
git commit -m "feat: configure rspress site shell"
```

## Task 5: Produce Original Character-Free Hero Assets

**Files:**
- Create: `tmp/imagegen/thqllm-title-desktop-source.png`
- Create: `tmp/imagegen/thqllm-title-mobile-source.png`
- Create: `site/public/assets/hero/thqllm-title-desktop.webp`
- Create: `site/public/assets/hero/thqllm-title-mobile.webp`

- [ ] **Step 1: Generate the desktop source image with the image-generation skill**

Use this exact prompt:

```text
Use case: stylized-concept
Asset type: full-bleed website title-screen background
Primary request: an original Japanese doujin bullet-hell game title-screen landscape, without characters
Scene/backdrop: misty mountain valley at early morning, distant shrine roof silhouettes, one vermilion torii positioned on the far right, layered ink-green hills, pale blue sky, drifting white mist, a few abstract sakura petals
Style/medium: polished hand-painted 2D anime game background with subtle print grain; original composition, not copied from any existing franchise, game, artist, or screenshot
Composition/framing: wide 16:9; large calm negative space on the left for the THQLLM title and menu; visually detailed right side; clear depth layers suitable for subtle parallax
Lighting/mood: luminous, mysterious, playful rather than dark or ominous
Color palette: sky blue, ink green, vermilion, paper ivory, small sakura-pink and gold accents
Constraints: no people, no humanoid silhouettes, no text, no logos, no UI, no bullets, no watermark
Avoid: photorealism, 3D render, modern city, neon cyberpunk, purple-dominated palette, dark-blue-dominated palette, copied Touhou characters or locations
```

Expected output: a landscape image at least `2048x1152`.

- [ ] **Step 2: Generate the mobile source image**

Use the same prompt with this composition line:

```text
Composition/framing: portrait 3:4; open sky and calm negative space across the upper-left and center for title/menu; torii and shrine silhouettes confined to the lower-right; preserve the same world and palette as the desktop image
```

Expected output: a portrait image at least `1536x2048`.

- [ ] **Step 3: Compress and normalize both assets**

Run:

```bash
mkdir -p site/public/assets/hero
node --input-type=module -e "
import sharp from 'sharp';
await sharp('tmp/imagegen/thqllm-title-desktop-source.png')
  .resize(1920, 1080, { fit: 'cover' })
  .webp({ quality: 84 })
  .toFile('site/public/assets/hero/thqllm-title-desktop.webp');
await sharp('tmp/imagegen/thqllm-title-mobile-source.png')
  .resize(1080, 1440, { fit: 'cover' })
  .webp({ quality: 84 })
  .toFile('site/public/assets/hero/thqllm-title-mobile.webp');
"
```

- [ ] **Step 4: Validate dimensions, file size, and visual constraints**

Run:

```bash
node --input-type=module -e "
import { stat } from 'node:fs/promises';
import sharp from 'sharp';
for (const file of [
  'site/public/assets/hero/thqllm-title-desktop.webp',
  'site/public/assets/hero/thqllm-title-mobile.webp'
]) {
  const metadata = await sharp(file).metadata();
  const bytes = (await stat(file)).size;
  console.log(file, metadata.width, metadata.height, bytes);
  if (!metadata.width || !metadata.height || bytes > 900000) process.exitCode = 1;
}
"
```

Expected: desktop is `1920x1080`, mobile is `1080x1440`, each file is under `900000` bytes. Inspect both images and reject any output containing people, text, logos, recognizable franchise assets, blank regions caused by generation failure, or unusable title contrast.

- [ ] **Step 5: Commit**

```bash
git add site/public/assets/hero
git commit -m "feat: add original THQLLM title-screen artwork"
```

## Task 6: Implement the THQLLM Hero with Test-First Copy Guarantees

**Files:**
- Create: `theme/tests/HeroTitleScreen.test.tsx`
- Create: `theme/components/HeroTitleScreen.tsx`
- Create: `theme/components/HeroTitleScreen.module.css`
- Create: `theme/layouts/HomeLayout.tsx`
- Create: `theme/layouts/HomeLayout.module.css`
- Modify: `theme/index.tsx`

- [ ] **Step 1: Write the failing hero test**

`theme/tests/HeroTitleScreen.test.tsx`:

```tsx
import { MemoryRouter } from '@rspress/core/runtime';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroTitleScreen } from '../components/HeroTitleScreen';

describe('HeroTitleScreen', () => {
  it('uses THQLLM as the only hero title and keeps direct navigation copy', () => {
    const { container } = render(
      <MemoryRouter>
        <HeroTitleScreen projectCount={3} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'THQLLM' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /项目选择/ })).toHaveAttribute('href', '/#projects');
    expect(screen.getByRole('link', { name: /使用文档/ })).toHaveAttribute(
      'href',
      '/docs/fluctgraph/',
    );
    expect(container.textContent).not.toContain('智能结界');
    expect(container.textContent).not.toContain('结界');
  });
});
```

- [ ] **Step 2: Run the test and confirm the component is missing**

Run:

```bash
pnpm test theme/tests/HeroTitleScreen.test.tsx
```

Expected: FAIL because `HeroTitleScreen` does not exist.

- [ ] **Step 3: Implement the hero component**

`theme/components/HeroTitleScreen.tsx`:

```tsx
import { Link } from '@rspress/core/runtime';
import { ChevronDown } from 'lucide-react';
import styles from './HeroTitleScreen.module.css';

interface HeroTitleScreenProps {
  projectCount: number;
}

const menuItems = [
  { index: '01', label: '项目选择', detail: 'PROJECT SELECT', href: '/#projects' },
  { index: '02', label: '使用文档', detail: 'MANUAL', href: '/docs/fluctgraph/' },
  { index: '03', label: '开发札记', detail: 'EXTRA STAGE', href: '/notes/' },
  { index: '04', label: '关于 THQLLM', detail: 'OMAKE', href: '/about/' },
] as const;

export function HeroTitleScreen({ projectCount }: HeroTitleScreenProps) {
  return (
    <section className={styles.hero} aria-labelledby="thq-home-title">
      <picture className={styles.picture}>
        <source
          media="(max-width: 640px)"
          srcSet="/assets/hero/thqllm-title-mobile.webp"
        />
        <img
          src="/assets/hero/thqllm-title-desktop.webp"
          alt=""
          className={styles.background}
          fetchPriority="high"
        />
      </picture>

      <div className={styles.scrim} aria-hidden="true" />

      <div className={styles.content}>
        <div className={styles.lockup}>
          <span className={styles.seal} aria-hidden="true">
            THQ
          </span>
          <div>
            <h1 id="thq-home-title">THQLLM</h1>
            <p className={styles.english}>AI PROJECTS · TOOLS · EXPERIMENTS</p>
            <p className={styles.chinese}>模型中转 · AI 编程 · 图像生成</p>
          </div>
        </div>

        <nav className={styles.menu} aria-label="首页主菜单">
          {menuItems.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.menuItem}
              data-active={index === 0 ? 'true' : undefined}
            >
              <span>{item.index}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </Link>
          ))}
        </nav>
      </div>

      <dl className={styles.hud} aria-label="站点信息">
        <div>
          <dt>Project</dt>
          <dd>{String(projectCount).padStart(2, '0')} NODES</dd>
        </div>
        <div>
          <dt>Manual</dt>
          <dd>ONLINE</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>1.00</dd>
        </div>
      </dl>

      <a className={styles.scrollHint} href="#projects">
        <span>进入项目选择</span>
        <ChevronDown aria-hidden="true" size={16} />
      </a>
    </section>
  );
}
```

`theme/components/HeroTitleScreen.module.css`:

```css
.hero {
  position: relative;
  min-height: min(780px, calc(88svh - var(--thq-nav-height)));
  overflow: hidden;
  color: var(--thq-paper);
  background: var(--thq-sky);
  isolation: isolate;
}

.picture,
.background,
.scrim {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.background {
  object-fit: cover;
  object-position: center;
}

.scrim {
  z-index: 1;
  background: rgb(23 40 36 / 26%);
}

.content {
  position: relative;
  z-index: 3;
  display: grid;
  align-content: center;
  width: min(1180px, calc(100% - 48px));
  min-height: inherit;
  margin: 0 auto;
  padding: 44px 0 72px;
}

.lockup {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  max-width: 620px;
  text-shadow: 0 3px 1px rgb(54 28 33 / 44%);
}

.seal {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  place-items: center;
  border: 2px solid currentColor;
  color: var(--thq-paper);
  background: var(--thq-vermilion);
  font-family: var(--thq-serif-font);
  font-size: 0.75rem;
  font-weight: 800;
  transform: rotate(-4deg);
}

.lockup h1 {
  margin: 0;
  font-family: var(--thq-display-font);
  font-size: 8.5rem;
  font-weight: 700;
  line-height: 0.76;
  letter-spacing: 0;
}

.english,
.chinese {
  margin: 18px 0 0;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0;
}

.chinese {
  margin-top: 7px;
  font-family: var(--thq-serif-font);
  opacity: 0.84;
}

.menu {
  display: grid;
  gap: 5px;
  width: min(340px, 100%);
  margin-top: 52px;
}

.menuItem {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  min-height: 40px;
  padding: 0 12px;
  border-left: 3px solid transparent;
  color: var(--thq-paper);
  text-decoration: none;
  text-shadow: 0 1px 2px rgb(23 40 36 / 70%);
}

.menuItem[data-active='true'],
.menuItem:hover,
.menuItem:focus-visible {
  border-left-color: var(--thq-gold);
  color: #3d292d;
  background: rgb(255 241 174 / 94%);
  text-shadow: none;
}

.menuItem span,
.menuItem small {
  font-family: var(--thq-mono-font);
  font-size: 0.66rem;
}

.menuItem strong {
  font-size: 0.82rem;
}

.hud {
  position: absolute;
  z-index: 4;
  top: 28px;
  right: 28px;
  display: grid;
  gap: 8px;
  min-width: 190px;
  margin: 0;
  padding: 13px;
  border: 1px solid rgb(255 253 247 / 22%);
  background: rgb(23 40 36 / 42%);
  font-family: var(--thq-mono-font);
  font-size: 0.66rem;
  backdrop-filter: blur(6px);
}

.hud div {
  display: flex;
  justify-content: space-between;
  gap: 18px;
}

.hud dt,
.hud dd {
  margin: 0;
}

.hud dd {
  color: var(--thq-gold);
}

.scrollHint {
  position: absolute;
  z-index: 4;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 42px;
  color: #403134;
  background: rgb(248 242 216 / 94%);
  font-size: 0.75rem;
  font-weight: 800;
  text-decoration: none;
}

@media (max-width: 640px) {
  .hero {
    min-height: min(720px, calc(88svh - var(--thq-nav-height)));
  }

  .content {
    width: min(calc(100% - 32px), 540px);
    align-content: start;
    padding-top: 72px;
  }

  .lockup h1 {
    font-size: 5rem;
  }

  .menu {
    margin-top: 44px;
  }

  .hud {
    display: none;
  }
}

@media (min-width: 641px) and (max-width: 900px) {
  .lockup h1 {
    font-size: 6.5rem;
  }
}
```

- [ ] **Step 4: Compose the initial custom home layout**

`theme/layouts/HomeLayout.tsx`:

```tsx
import { projects } from '../../src/data/projects';
import { HeroTitleScreen } from '../components/HeroTitleScreen';
import styles from './HomeLayout.module.css';

export function HomeLayout() {
  return (
    <main className={styles.page}>
      <HeroTitleScreen projectCount={projects.length} />
    </main>
  );
}
```

`theme/layouts/HomeLayout.module.css`:

```css
.page {
  min-width: 0;
  background: var(--thq-paper);
}
```

Replace `theme/index.tsx` with:

```tsx
import { Layout as BasicLayout } from '@rspress/core/theme-original';
import { HomeLayout } from './layouts/HomeLayout';
import './index.css';

export function Layout() {
  return <BasicLayout HomeLayout={HomeLayout} />;
}

export * from '@rspress/core/theme-original';
```

- [ ] **Step 5: Run component tests and build**

Run:

```bash
pnpm test theme/tests/HeroTitleScreen.test.tsx
pnpm typecheck
pnpm build
```

Expected: the hero test passes and `doc_build/index.html` contains `THQLLM`.

- [ ] **Step 6: Commit**

```bash
git add theme
git commit -m "feat: build THQLLM title-screen hero"
```

## Task 7: Add Deterministic Danmaku Motion with Reduced-Motion Support

**Files:**
- Create: `src/lib/danmaku.ts`
- Create: `src/lib/danmaku.test.ts`
- Create: `theme/components/DanmakuCanvas.tsx`
- Modify: `theme/components/HeroTitleScreen.tsx`
- Modify: `theme/components/HeroTitleScreen.module.css`

- [ ] **Step 1: Write failing geometry tests**

`src/lib/danmaku.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDanmakuFrame } from './danmaku';

describe('createDanmakuFrame', () => {
  it('returns a deterministic number of bullets', () => {
    const first = createDanmakuFrame(800, 600, 0, 24);
    const second = createDanmakuFrame(800, 600, 0, 24);
    expect(first).toEqual(second);
    expect(first).toHaveLength(24);
  });

  it('keeps every bullet within the viewport', () => {
    for (const bullet of createDanmakuFrame(800, 600, Math.PI / 3, 24)) {
      expect(bullet.x).toBeGreaterThanOrEqual(0);
      expect(bullet.x).toBeLessThanOrEqual(800);
      expect(bullet.y).toBeGreaterThanOrEqual(0);
      expect(bullet.y).toBeLessThanOrEqual(600);
    }
  });
});
```

- [ ] **Step 2: Confirm the geometry module is missing**

Run:

```bash
pnpm test src/lib/danmaku.test.ts
```

Expected: FAIL because `src/lib/danmaku.ts` does not exist.

- [ ] **Step 3: Implement deterministic bullet geometry**

`src/lib/danmaku.ts`:

```ts
export interface DanmakuBullet {
  x: number;
  y: number;
  rotation: number;
  color: string;
}

const colors = ['#70D8C7', '#F28AA0', '#F4CF71'] as const;

export function createDanmakuFrame(
  width: number,
  height: number,
  angle: number,
  count = 24,
): DanmakuBullet[] {
  const centerX = width * 0.72;
  const centerY = height * 0.43;
  const radius = Math.min(width, height) * 0.28;

  return Array.from({ length: count }, (_, index) => {
    const rotation = angle + (Math.PI * 2 * index) / count;
    const wave = Math.sin(rotation * 3) * radius * 0.08;
    const currentRadius = radius + wave;
    return {
      x: Math.min(width, Math.max(0, centerX + Math.cos(rotation) * currentRadius)),
      y: Math.min(height, Math.max(0, centerY + Math.sin(rotation) * currentRadius)),
      rotation: rotation + Math.PI / 2,
      color: colors[index % colors.length],
    };
  });
}
```

- [ ] **Step 4: Implement the progressive canvas**

`theme/components/DanmakuCanvas.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { createDanmakuFrame } from '../../src/lib/danmaku';

export function DanmakuCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frameId = 0;
    let angle = 0;
    let width = 0;
    let height = 0;
    let ratio = 1;

    const draw = () => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      for (const bullet of createDanmakuFrame(width, height, angle)) {
        context.save();
        context.translate(bullet.x, bullet.y);
        context.rotate(bullet.rotation);
        context.fillStyle = bullet.color;
        context.shadowColor = bullet.color;
        context.shadowBlur = 8;
        context.beginPath();
        context.ellipse(0, 0, 4, 9, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      draw();
    };

    const animate = () => {
      draw();
      angle += 0.0018;
      frameId = window.requestAnimationFrame(animate);
    };

    if (reducedMotion) {
      canvas.dataset.motion = 'reduced';
    } else {
      canvas.dataset.motion = 'animated';
      animate();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="danmaku-canvas" />;
}
```

Add inside the hero section, immediately after the scrim:

```tsx
<div className={styles.danmaku}>
  <DanmakuCanvas />
</div>
```

Add the import:

```tsx
import { DanmakuCanvas } from './DanmakuCanvas';
```

Append to `HeroTitleScreen.module.css`:

```css
.danmaku {
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;
}

.danmaku canvas {
  width: 100%;
  height: 100%;
}

@media (max-width: 640px) {
  .danmaku {
    opacity: 0.54;
  }
}
```

- [ ] **Step 5: Run geometry, component, type, and build checks**

Run:

```bash
pnpm test src/lib/danmaku.test.ts theme/tests/HeroTitleScreen.test.tsx
pnpm typecheck
pnpm build
```

Expected: all tests PASS and the home build completes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/danmaku.ts src/lib/danmaku.test.ts theme/components
git commit -m "feat: add accessible danmaku motion"
```

## Task 8: Build Stage Select and the Remaining Homepage Bands

**Files:**
- Create: `src/data/notes.ts`
- Create: `theme/tests/ProjectStageGrid.test.tsx`
- Create: `theme/components/ProjectStageGrid.tsx`
- Create: `theme/components/ProjectStageGrid.module.css`
- Create: `theme/components/HomeBands.tsx`
- Create: `theme/components/HomeBands.module.css`
- Modify: `theme/layouts/HomeLayout.tsx`

- [ ] **Step 1: Write failing project-card tests**

`theme/tests/ProjectStageGrid.test.tsx`:

```tsx
import { MemoryRouter } from '@rspress/core/runtime';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { projects } from '../../src/data/projects';
import { ProjectStageGrid } from '../components/ProjectStageGrid';

describe('ProjectStageGrid', () => {
  it('renders one safe external link and one docs link per project', () => {
    render(
      <MemoryRouter>
        <ProjectStageGrid projects={projects} />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('article')).toHaveLength(3);
    const external = screen.getByRole('link', { name: '进入 FluctGraph' });
    expect(external).toHaveAttribute('href', 'https://graph.tohoqing.com/');
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noreferrer noopener');
    expect(screen.getByRole('link', { name: '阅读 FluctGraph 文档' })).toHaveAttribute(
      'href',
      '/docs/fluctgraph/',
    );
  });

  it('shows a non-link state when a future project has no docs', () => {
    render(
      <MemoryRouter>
        <ProjectStageGrid
          projects={[
            {
              ...projects[0],
              id: 'future-project',
              name: 'Future Project',
              externalUrl: 'https://future.example.com/',
              docs: undefined,
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('文档准备中')).toHaveAttribute('aria-disabled', 'true');
  });
});
```

- [ ] **Step 2: Confirm the component is missing**

Run:

```bash
pnpm test theme/tests/ProjectStageGrid.test.tsx
```

Expected: FAIL because `ProjectStageGrid` does not exist.

- [ ] **Step 3: Add note metadata**

`src/data/notes.ts`:

```ts
export const notes = [
  {
    slug: '/notes/',
    label: 'EXTRA STAGE 01',
    title: 'THQLLM 官网启动记录',
    date: '2026-07-13',
    summary: '统一项目入口、文档结构与视觉方向的首版记录。',
  },
] as const;
```

- [ ] **Step 4: Implement Stage Select**

`theme/components/ProjectStageGrid.tsx`:

```tsx
import { Link } from '@rspress/core/runtime';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import type { ProjectDefinition } from '../../src/data/project-schema';
import { getFeaturedProjects } from '../../src/lib/projects';
import styles from './ProjectStageGrid.module.css';

interface ProjectStageGridProps {
  projects: readonly ProjectDefinition[];
}

export function ProjectStageGrid({ projects }: ProjectStageGridProps) {
  return (
    <section id="projects" className={styles.section} aria-labelledby="projects-title">
      <header className={styles.header}>
        <div>
          <p>STAGE SELECT / PROJECT NETWORK</p>
          <h2 id="projects-title">项目选择</h2>
        </div>
        <span>{String(projects.length).padStart(2, '0')} PROJECTS AVAILABLE</span>
      </header>

      <div className={styles.grid}>
        {getFeaturedProjects(projects).map((project) => (
          <article
            key={project.id}
            className={styles.card}
            data-accent={project.accent}
            data-testid="project-stage"
          >
            <p className={styles.stage}>
              {project.stageLabel} · {project.categoryLabel}
            </p>
            <h3>{project.name}</h3>
            <p className={styles.description}>{project.description}</p>
            <ul className={styles.tags} aria-label={`${project.name} 标签`}>
              {project.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
            <div className={styles.actions}>
              <a
                href={project.externalUrl}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`进入 ${project.name}`}
              >
                <ArrowUpRight aria-hidden="true" size={16} />
                进入项目
              </a>
              {project.docs ? (
                <Link
                  href={project.docs.basePath}
                  aria-label={`阅读 ${project.name} 文档`}
                >
                  <BookOpen aria-hidden="true" size={16} />
                  使用文档
                </Link>
              ) : (
                <span aria-disabled="true">文档准备中</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

`theme/components/ProjectStageGrid.module.css`:

```css
.section {
  padding: 72px max(24px, calc((100vw - 1180px) / 2));
  background: var(--thq-paper-muted);
}

.header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 28px;
  margin-bottom: 28px;
}

.header p,
.stage {
  margin: 0 0 8px;
  color: var(--thq-vermilion);
  font-family: var(--thq-mono-font);
  font-size: 0.72rem;
  font-weight: 800;
}

.header h2 {
  margin: 0;
  font-family: var(--thq-serif-font);
  font-size: 3.6rem;
  letter-spacing: 0;
}

.header > span {
  max-width: 380px;
  color: var(--thq-text-muted);
  font-size: 0.9rem;
  line-height: 1.6;
  text-align: right;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.card {
  position: relative;
  min-height: 320px;
  padding: 24px;
  border: 1px solid var(--thq-border);
  border-top: 5px solid var(--thq-vermilion);
  border-radius: var(--thq-radius);
  background: var(--thq-paper);
}

.card[data-accent='cyan'] {
  border-top-color: #2a8d81;
}

.card[data-accent='gold'] {
  border-top-color: #d3a12b;
}

.card h3 {
  margin: 18px 0 12px;
  font-family: var(--thq-serif-font);
  font-size: 1.6rem;
  letter-spacing: 0;
}

.description {
  min-height: 72px;
  margin: 0;
  color: var(--thq-text-muted);
  line-height: 1.65;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 18px 0 74px;
  padding: 0;
  list-style: none;
}

.tags li {
  padding: 4px 7px;
  border: 1px solid var(--thq-border);
  border-radius: 3px;
  font-size: 0.72rem;
}

.actions {
  position: absolute;
  right: 24px;
  bottom: 24px;
  left: 24px;
  display: flex;
  gap: 8px;
}

.actions a,
.actions span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--thq-ink);
  border-radius: 4px;
  color: var(--thq-ink);
  font-size: 0.78rem;
  font-weight: 800;
  text-decoration: none;
}

.actions a:first-child {
  color: var(--thq-paper);
  background: var(--thq-ink);
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .header {
    align-items: start;
    flex-direction: column;
  }

  .header > span {
    text-align: left;
  }
}
```

- [ ] **Step 5: Implement Manual, notes, about, and footer bands**

`theme/components/HomeBands.tsx`:

```tsx
import { Link } from '@rspress/core/runtime';
import { ArrowRight, BookOpen } from 'lucide-react';
import { notes } from '../../src/data/notes';
import type { ProjectDefinition } from '../../src/data/project-schema';
import styles from './HomeBands.module.css';

export function ManualBand({ projects }: { projects: readonly ProjectDefinition[] }) {
  return (
    <section className={styles.manual} aria-labelledby="manual-title">
      <div>
        <p>MANUAL / DOCUMENTATION</p>
        <h2 id="manual-title">使用文档</h2>
        <span>FluctGraph · THQ API · Toho Image Studio</span>
      </div>
      <ul>
        {projects.map((project) => (
          <li key={project.id}>
            {project.docs ? (
              <Link href={project.docs.basePath}>
                <BookOpen aria-hidden="true" size={16} />
                <span>{project.name}</span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            ) : (
              <span>{project.name} · 文档准备中</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NotesBand() {
  const latest = notes[0];
  return (
    <section className={styles.notes} aria-labelledby="notes-title">
      <div>
        <p>{latest.label}</p>
        <h2 id="notes-title">{latest.title}</h2>
        <span>{latest.summary}</span>
      </div>
      <Link href={latest.slug}>
        阅读开发札记
        <ArrowRight aria-hidden="true" size={16} />
      </Link>
    </section>
  );
}

export function AboutBand() {
  return (
    <section className={styles.about} aria-labelledby="about-title">
      <p>OMAKE / ABOUT</p>
      <h2 id="about-title">关于 THQLLM</h2>
      <span>把模型、代码与图像工具整理成清晰、可使用、可查阅的项目网络。</span>
      <Link href="/about/">了解更多</Link>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <strong>THQLLM</strong>
      <span>AI PROJECTS · TOOLS · EXPERIMENTS</span>
      <span>© 2026 THQLLM</span>
    </footer>
  );
}
```

`theme/components/HomeBands.module.css`:

```css
.manual,
.notes,
.about,
.footer {
  padding-right: max(24px, calc((100vw - 1180px) / 2));
  padding-left: max(24px, calc((100vw - 1180px) / 2));
}

.manual {
  display: grid;
  grid-template-columns: minmax(240px, 0.8fr) minmax(320px, 1.2fr);
  gap: 64px;
  padding-top: 72px;
  padding-bottom: 72px;
  color: var(--thq-paper);
  background: var(--thq-ink);
}

.manual p,
.notes p,
.about p {
  margin: 0 0 10px;
  color: var(--thq-gold);
  font-family: var(--thq-mono-font);
  font-size: 0.72rem;
  font-weight: 800;
}

.manual h2,
.notes h2,
.about h2 {
  margin: 0 0 14px;
  font-family: var(--thq-serif-font);
  font-size: 3.1rem;
  letter-spacing: 0;
}

.manual > div > span,
.notes span,
.about span {
  color: rgb(255 253 247 / 72%);
  line-height: 1.65;
}

.manual ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.manual a,
.manual li > span {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  min-height: 52px;
  padding: 0 14px;
  border: 1px solid rgb(255 253 247 / 18%);
  border-radius: 4px;
  color: var(--thq-paper);
  text-decoration: none;
}

.manual a:hover {
  border-color: var(--thq-cyan);
  color: var(--thq-cyan);
}

.notes {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  padding-top: 58px;
  padding-bottom: 58px;
  color: var(--thq-text);
  background: var(--thq-paper);
}

.notes p,
.about p {
  color: var(--thq-vermilion);
}

.notes span,
.about span {
  color: var(--thq-text-muted);
}

.notes > a,
.about > a {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 13px;
  border: 1px solid var(--thq-ink);
  border-radius: 4px;
  color: var(--thq-ink);
  font-size: 0.8rem;
  font-weight: 800;
  text-decoration: none;
}

.about {
  padding-top: 66px;
  padding-bottom: 66px;
  color: var(--thq-paper);
  background: #47363b;
}

.about > a {
  margin-top: 24px;
  color: var(--thq-paper);
  border-color: var(--thq-paper);
}

.footer {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 24px;
  align-items: center;
  min-height: 72px;
  color: rgb(255 253 247 / 68%);
  background: var(--thq-ink-deep);
  font-family: var(--thq-mono-font);
  font-size: 0.7rem;
}

.footer strong {
  color: var(--thq-paper);
  font-family: var(--thq-display-font);
  font-size: 1.4rem;
}

@media (max-width: 720px) {
  .manual {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  .notes {
    align-items: start;
    flex-direction: column;
  }

  .footer {
    grid-template-columns: 1fr;
    gap: 8px;
    padding-top: 22px;
    padding-bottom: 22px;
  }
}
```

- [ ] **Step 6: Compose the complete homepage**

Replace `theme/layouts/HomeLayout.tsx` with:

```tsx
import { projects } from '../../src/data/projects';
import { HeroTitleScreen } from '../components/HeroTitleScreen';
import {
  AboutBand,
  ManualBand,
  NotesBand,
  SiteFooter,
} from '../components/HomeBands';
import { ProjectStageGrid } from '../components/ProjectStageGrid';
import styles from './HomeLayout.module.css';

export function HomeLayout() {
  return (
    <main className={styles.page}>
      <HeroTitleScreen projectCount={projects.length} />
      <ProjectStageGrid projects={projects} />
      <ManualBand projects={projects} />
      <NotesBand />
      <AboutBand />
      <SiteFooter />
    </main>
  );
}
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
pnpm test theme/tests/ProjectStageGrid.test.tsx theme/tests/HeroTitleScreen.test.tsx
pnpm typecheck
pnpm build
```

Expected: tests PASS and the homepage build contains all three project names.

- [ ] **Step 8: Commit**

```bash
git add src/data/notes.ts theme/components theme/layouts/HomeLayout.tsx
git commit -m "feat: add project portal homepage sections"
```

## Task 9: Add the Complete Project Directory and Static Pages

**Files:**
- Create: `theme/components/ProjectsDirectory.tsx`
- Create: `site/projects/index.mdx`
- Create: `site/notes/index.mdx`
- Create: `site/about/index.mdx`

- [ ] **Step 1: Implement the project-directory component**

`theme/components/ProjectsDirectory.tsx`:

```tsx
import { projects } from '../../src/data/projects';
import { ProjectStageGrid } from './ProjectStageGrid';

export function ProjectsDirectory() {
  return <ProjectStageGrid projects={projects} />;
}
```

- [ ] **Step 2: Create the project directory page**

`site/projects/index.mdx`:

```mdx
---
title: 项目
description: THQLLM 当前公开项目与文档入口。
pageType: doc-wide
sidebar: false
outline: false
---

import { ProjectsDirectory } from '../../theme/components/ProjectsDirectory';

# 项目

<ProjectsDirectory />
```

- [ ] **Step 3: Create the development-notes page**

`site/notes/index.mdx`:

```mdx
---
title: 开发札记
description: THQLLM 项目与官网的更新记录。
sidebar: false
---

# 开发札记

## 2026-07-13 · 官网启动记录

THQLLM 官网以项目入口和使用文档为核心，同时采用原创、无人物的同人弹幕游戏标题画面。

首版包含：

- FluctGraph、THQ API 与 Toho Image Studio 的统一入口
- 每个项目独立的文档空间
- 跨项目全文搜索
- 纯静态部署与移动端适配
```

- [ ] **Step 4: Create the about page**

`site/about/index.mdx`:

```mdx
---
title: 关于 THQLLM
description: THQLLM 的项目范围、设计原则与内容边界。
sidebar: false
---

# 关于 THQLLM

THQLLM 用于整理和连接模型中转、AI 编程、图像生成与其他 AI 实验项目。

## 原则

- 项目入口清楚，访问项目与阅读文档互不混淆。
- 文档只写入已经确认的信息，不虚构命令、参数或服务能力。
- 官网保持纯静态，不要求用户在门户中提交 API Key。
- 东方同人弹幕游戏气质来自原创场景、排版和交互，不使用现成角色素材。

## 当前项目

- [FluctGraph](https://graph.tohoqing.com/)
- [THQ API](https://sub.thqllm.com/)
- [Toho Image Studio](https://img.tohoqing.com/)
```

- [ ] **Step 5: Verify all static routes build**

Run:

```bash
pnpm build
test -f doc_build/projects/index.html
test -f doc_build/notes/index.html
test -f doc_build/about/index.html
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add theme/components/ProjectsDirectory.tsx site/projects site/notes site/about
git commit -m "feat: add project notes and about pages"
```

## Task 10: Theme the Documentation Shell and Register MDX Components

**Files:**
- Create: `theme/tests/ProjectDocSwitcher.test.tsx`
- Create: `theme/tests/MdxComponents.test.tsx`
- Create: `theme/components/ProjectDocSwitcher.tsx`
- Create: `theme/components/DocProjectHeader.tsx`
- Create: `theme/components/DocsChrome.module.css`
- Create: `theme/components/mdx/ProjectLink.tsx`
- Create: `theme/components/mdx/ApiEndpoint.tsx`
- Create: `theme/components/mdx/ParameterTable.tsx`
- Create: `theme/components/mdx/MdxComponents.module.css`
- Modify: `theme/index.tsx`

- [ ] **Step 1: Write failing docs-chrome and MDX tests**

`theme/tests/ProjectDocSwitcher.test.tsx`:

```tsx
import { MemoryRouter } from '@rspress/core/runtime';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectDocSwitcher } from '../components/ProjectDocSwitcher';

describe('ProjectDocSwitcher', () => {
  it('shows the current project on a nested docs route', () => {
    render(
      <MemoryRouter initialEntries={['/docs/thq-api/faq']}>
        <ProjectDocSwitcher />
      </MemoryRouter>,
    );
    expect(screen.getByText('THQ API')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '切换当前项目文档' })).toHaveValue(
      'thq-api',
    );
    expect(screen.getByRole('link', { name: 'FluctGraph 文档' })).toHaveAttribute(
      'href',
      '/docs/fluctgraph/',
    );
  });

  it('renders nothing outside docs routes', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/projects/']}>
        <ProjectDocSwitcher />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

`theme/tests/MdxComponents.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiEndpoint } from '../components/mdx/ApiEndpoint';
import { ParameterTable } from '../components/mdx/ParameterTable';
import { ProjectLink } from '../components/mdx/ProjectLink';

describe('MDX components', () => {
  it('renders safe project links', () => {
    render(<ProjectLink href="https://example.com/">打开项目</ProjectLink>);
    expect(screen.getByRole('link', { name: '打开项目' })).toHaveAttribute(
      'rel',
      'noreferrer noopener',
    );
  });

  it('renders an endpoint and accessible parameter table', () => {
    render(
      <>
        <ApiEndpoint method="POST" path="/v1/example" />
        <ParameterTable
          rows={[
            {
              name: 'model',
              type: 'string',
              required: true,
              description: '模型标识。',
            },
          ]}
        />
      </>,
    );
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('model')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Confirm tests fail**

Run:

```bash
pnpm test theme/tests/ProjectDocSwitcher.test.tsx theme/tests/MdxComponents.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the project switcher and document header**

`theme/components/ProjectDocSwitcher.tsx`:

```tsx
import { Link, useLocation, useNavigate } from '@rspress/core/runtime';
import { projects } from '../../src/data/projects';
import { getProjectByPathname } from '../../src/lib/projects';
import styles from './DocsChrome.module.css';

export function ProjectDocSwitcher() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = getProjectByPathname(pathname);
  if (!current) {
    return null;
  }

  return (
    <nav className={styles.switcher} aria-label="切换项目文档">
      <span>PROJECT</span>
      <strong>{current.name}</strong>
      <div>
        {projects
          .filter((project) => project.docs && project.id !== current.id)
          .map((project) => (
            <Link
              key={project.id}
              href={project.docs?.basePath ?? '/projects/'}
              aria-label={`${project.name} 文档`}
            >
              {project.name}
            </Link>
          ))}
      </div>
      <select
        className={styles.mobileSelect}
        aria-label="切换当前项目文档"
        value={current.id}
        onChange={(event) => {
          const target = projects.find((project) => project.id === event.target.value);
          if (target?.docs) {
            navigate(target.docs.basePath);
          }
        }}
      >
        {projects
          .filter((project) => project.docs)
          .map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
      </select>
    </nav>
  );
}
```

`theme/components/DocProjectHeader.tsx`:

```tsx
import { useLocation } from '@rspress/core/runtime';
import { ArrowUpRight } from 'lucide-react';
import { getProjectByPathname } from '../../src/lib/projects';
import styles from './DocsChrome.module.css';

export function DocProjectHeader() {
  const { pathname } = useLocation();
  const project = getProjectByPathname(pathname);
  if (!project) {
    return null;
  }

  return (
    <header className={styles.projectHeader}>
      <p>
        {project.stageLabel} · {project.categoryLabel}
      </p>
      <strong>{project.name}</strong>
      <a href={project.externalUrl} target="_blank" rel="noreferrer noopener">
        <ArrowUpRight aria-hidden="true" size={15} />
        打开项目
      </a>
    </header>
  );
}
```

`theme/components/DocsChrome.module.css`:

```css
.switcher {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  padding: 0 max(18px, calc((100vw - 1180px) / 2));
  border-bottom: 1px solid var(--thq-border);
  color: var(--thq-text-muted);
  background: var(--thq-paper-muted);
  font-size: 0.75rem;
}

.switcher > span {
  color: var(--thq-vermilion);
  font-family: var(--thq-mono-font);
  font-weight: 800;
}

.switcher strong {
  color: var(--thq-text);
}

.switcher div {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.switcher a {
  color: var(--thq-text-muted);
  text-decoration: none;
}

.mobileSelect {
  display: none;
  min-height: 32px;
  margin-left: auto;
  border: 1px solid var(--thq-border);
  border-radius: 4px;
  color: var(--thq-text);
  background: var(--thq-paper);
}

.projectHeader {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 7px 18px;
  margin-bottom: 32px;
  padding: 16px;
  border-left: 4px solid var(--thq-vermilion);
  background: #faf5e8;
}

.projectHeader p {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--thq-vermilion);
  font-family: var(--thq-mono-font);
  font-size: 0.68rem;
  font-weight: 800;
}

.projectHeader strong {
  font-family: var(--thq-serif-font);
  font-size: 1.1rem;
}

.projectHeader a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--thq-ink);
  font-size: 0.78rem;
  font-weight: 800;
}

@media (max-width: 700px) {
  .switcher div {
    display: none;
  }

  .mobileSelect {
    display: block;
  }
}
```

- [ ] **Step 4: Implement the MDX components**

`theme/components/mdx/ProjectLink.tsx`:

```tsx
import type { PropsWithChildren } from 'react';
import { ArrowUpRight } from 'lucide-react';
import styles from './MdxComponents.module.css';

export function ProjectLink({ href, children }: PropsWithChildren<{ href: string }>) {
  return (
    <a
      className={styles.projectLink}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
      <ArrowUpRight aria-hidden="true" size={16} />
    </a>
  );
}
```

`theme/components/mdx/ApiEndpoint.tsx`:

```tsx
import styles from './MdxComponents.module.css';

export function ApiEndpoint({ method, path }: { method: string; path: string }) {
  return (
    <div className={styles.endpoint}>
      <strong>{method.toUpperCase()}</strong>
      <code>{path}</code>
    </div>
  );
}
```

`theme/components/mdx/ParameterTable.tsx`:

```tsx
import styles from './MdxComponents.module.css';

interface ParameterRow {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export function ParameterTable({ rows }: { rows: readonly ParameterRow[] }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.parameterTable}>
        <thead>
          <tr>
            <th scope="col">参数</th>
            <th scope="col">类型</th>
            <th scope="col">必填</th>
            <th scope="col">说明</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <th scope="row">
                <code>{row.name}</code>
              </th>
              <td>{row.type}</td>
              <td>{row.required ? '是' : '否'}</td>
              <td>{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`theme/components/mdx/MdxComponents.module.css`:

```css
.projectLink {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--thq-ink);
  border-radius: 4px;
  color: var(--thq-paper);
  background: var(--thq-ink);
  font-weight: 800;
  text-decoration: none;
}

.endpoint {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0;
  padding: 12px;
  border: 1px solid var(--thq-border);
  border-radius: 4px;
  background: #faf5e8;
}

.endpoint strong {
  color: var(--thq-vermilion);
  font-family: var(--thq-mono-font);
}

.endpoint code {
  color: var(--thq-ink);
}

.tableScroll {
  overflow-x: auto;
}

.parameterTable {
  width: 100%;
  border-collapse: collapse;
}

.parameterTable th,
.parameterTable td {
  padding: 10px;
  border: 1px solid var(--thq-border);
  text-align: left;
  vertical-align: top;
}

.parameterTable thead {
  background: var(--thq-paper-muted);
}
```

- [ ] **Step 5: Register slots and global MDX components**

Replace `theme/index.tsx` with:

```tsx
import { Layout as BasicLayout } from '@rspress/core/theme-original';
import type { FC } from 'react';
import { ApiEndpoint } from './components/mdx/ApiEndpoint';
import { ParameterTable } from './components/mdx/ParameterTable';
import { ProjectLink } from './components/mdx/ProjectLink';
import { DocProjectHeader } from './components/DocProjectHeader';
import { ProjectDocSwitcher } from './components/ProjectDocSwitcher';
import { HomeLayout } from './layouts/HomeLayout';
import './index.css';

const mdxComponents = {
  ApiEndpoint,
  ParameterTable,
  ProjectLink,
} as unknown as Record<string, FC>;

export function Layout() {
  return (
    <BasicLayout
      HomeLayout={HomeLayout}
      afterNav={<ProjectDocSwitcher />}
      beforeDoc={<DocProjectHeader />}
      components={mdxComponents}
    />
  );
}

export * from '@rspress/core/theme-original';
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test theme/tests/ProjectDocSwitcher.test.tsx theme/tests/MdxComponents.test.tsx
pnpm typecheck
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add theme/components theme/tests theme/index.tsx
git commit -m "feat: theme project documentation"
```

## Task 11: Write the Initial Project Documentation

**Files:**
- Modify: `rspress.config.ts`
- Create: `site/docs/fluctgraph/index.mdx`
- Create: `site/docs/fluctgraph/quick-start.mdx`
- Create: `site/docs/fluctgraph/faq.mdx`
- Create: `site/docs/fluctgraph/changelog.mdx`
- Create: `site/docs/thq-api/index.mdx`
- Create: `site/docs/thq-api/quick-start.mdx`
- Create: `site/docs/thq-api/faq.mdx`
- Create: `site/docs/thq-api/changelog.mdx`
- Create: `site/docs/toho-image-studio/index.mdx`
- Create: `site/docs/toho-image-studio/quick-start.mdx`
- Create: `site/docs/toho-image-studio/faq.mdx`
- Create: `site/docs/toho-image-studio/changelog.mdx`

- [ ] **Step 1: Add FluctGraph documents using only confirmed public facts**

`site/docs/fluctgraph/index.mdx`:

```mdx
---
title: FluctGraph 概览
description: 面向 AI IDE 和 Agent 工作流的私有知识图谱接入层。
---

# FluctGraph

FluctGraph 是面向 AI IDE 和 Agent 工作流的私有知识图谱接入层。

它围绕知识图谱、MCP、LightRAG、私有知识库与 AI IDE 接入场景组织能力。

<ProjectLink href="https://graph.tohoqing.com/">打开 FluctGraph</ProjectLink>

## 文档范围

- 项目定位与适用场景
- 接入前准备
- AI IDE、Agent、MCP 与 LightRAG 相关入口
- 常见问题和更新记录

具体安装命令、配置字段与服务端参数以 FluctGraph 项目页面当前提供的信息为准。
```

`site/docs/fluctgraph/quick-start.mdx`:

```mdx
---
title: FluctGraph 快速开始
description: 开始评估并接入 FluctGraph。
---

# 快速开始

## 1. 确认使用场景

先确定需要连接的是 AI IDE、Agent 工作流、MCP 客户端还是 LightRAG。

## 2. 打开项目

<ProjectLink href="https://graph.tohoqing.com/">进入 FluctGraph</ProjectLink>

## 3. 使用项目当前提供的接入信息

从项目页面获取当前版本的安装、地址与配置说明。不要根据旧截图或第三方示例填写密钥和服务地址。

## 4. 从最小知识库验证

先使用少量非敏感内容完成连接和检索验证，再逐步扩展私有知识库范围。
```

`site/docs/fluctgraph/faq.mdx`:

```mdx
---
title: FluctGraph 常见问题
description: FluctGraph 使用边界与排查原则。
---

# 常见问题

## 官网会保存我的知识库内容吗？

不会。THQLLM 官网仅提供项目入口和文档，不代理 FluctGraph 的业务请求。

## 文档为什么不直接给出未经确认的配置字段？

配置会随项目版本变化。本站只记录已确认信息，具体字段以 FluctGraph 当前项目页面为准。

## 应该先接入哪个场景？

优先选择已有明确需求的 AI IDE 或 Agent 工作流，并使用最小数据集完成验证。
```

`site/docs/fluctgraph/changelog.mdx`:

```mdx
---
title: FluctGraph 文档更新记录
description: THQLLM 侧的 FluctGraph 文档变更。
---

# 更新记录

## 2026-07-13

- 建立 FluctGraph 独立文档空间。
- 收录项目定位、快速开始和常见问题。
- 明确所有安装与配置细节以项目当前页面为准。
```

- [ ] **Step 2: Add THQ API documents without inventing endpoints**

`site/docs/thq-api/index.mdx`:

```mdx
---
title: THQ API 概览
description: THQ API 是 AI API Gateway 与模型中转服务。
---

# THQ API

THQ API 是统一连接多种模型能力的 AI API Gateway 与中转服务。

<ProjectLink href="https://sub.thqllm.com/">打开 THQ API 控制台</ProjectLink>

## 使用原则

- API Key 只保存在可信客户端或服务端环境。
- Base URL、模型标识和计费信息以控制台当前显示为准。
- 不在浏览器前端代码、公开仓库或截图中暴露完整密钥。
```

`site/docs/thq-api/quick-start.mdx`:

```mdx
---
title: THQ API 快速开始
description: 获取并安全使用 THQ API 的基本流程。
---

# 快速开始

## 1. 打开控制台

<ProjectLink href="https://sub.thqllm.com/">进入 THQ API</ProjectLink>

## 2. 登录并创建 API Key

在控制台中创建独立密钥。为不同设备或应用使用不同密钥，便于撤销和排查。

## 3. 读取当前接入参数

从控制台复制当前 Base URL、可用模型标识和兼容方式。本站不写死可能变化的地址或模型列表。

## 4. 在可信环境发起最小请求

先使用控制台推荐的最小示例验证认证、模型名称和响应格式，再集成到正式应用。
```

`site/docs/thq-api/faq.mdx`:

```mdx
---
title: THQ API 常见问题
description: THQ API 密钥、安全与接入排查。
---

# 常见问题

## 官网会读取我的 API Key 吗？

不会。THQLLM 官网是纯静态门户，不包含密钥输入、代理请求或统一登录。

## 请求失败时先检查什么？

依次检查 API Key 是否有效、Base URL 是否来自当前控制台、模型标识是否可用，以及客户端是否发送了控制台要求的认证头。

## 可以把密钥写在前端代码里吗？

不建议。公开网页中的密钥可以被访问者读取，应通过可信服务端或本地安全配置调用。
```

`site/docs/thq-api/changelog.mdx`:

```mdx
---
title: THQ API 文档更新记录
description: THQLLM 侧的 THQ API 文档变更。
---

# 更新记录

## 2026-07-13

- 建立 THQ API 独立文档空间。
- 增加密钥安全、接入流程和排查原则。
- 明确 Base URL 与模型列表以控制台当前信息为准。
```

- [ ] **Step 3: Add Toho Image Studio documents based on its public interface**

`site/docs/toho-image-studio/index.mdx`:

```mdx
---
title: Toho Image Studio 概览
description: 面向图像生成与编辑工作流的浏览器创作空间。
---

# Toho Image Studio

Toho Image Studio 是面向图像生成与编辑工作流的浏览器创作空间。

公开界面提供 API Key、模型与引擎选择、提示词输入、参考图、遮罩、生成结果、编辑、历史结果和直连接口等区域。

<ProjectLink href="https://img.tohoqing.com/">打开 Toho Image Studio</ProjectLink>
```

`site/docs/toho-image-studio/quick-start.mdx`:

```mdx
---
title: Toho Image Studio 快速开始
description: 生成第一张图片的基本流程。
---

# 快速开始

## 1. 准备 API Key

在页面的 Access 区域填写可用的 API Key。不要在共享设备上长期保留密钥。

## 2. 选择模型与引擎

从页面当前提供的模型与引擎中选择适合的选项。

## 3. 输入提示词

清楚描述主体、场景、风格、构图与必须避免的内容。

## 4. 生成并检查结果

生成第一张图片后，检查主体、构图、文字、边缘和不希望出现的元素。

## 5. 按需编辑

使用参考图、遮罩或编辑功能进行一次有针对性的修改，避免同时改变过多条件。
```

`site/docs/toho-image-studio/faq.mdx`:

```mdx
---
title: Toho Image Studio 常见问题
description: 图像生成、编辑与密钥使用问题。
---

# 常见问题

## 为什么页面没有生成结果？

先检查 API Key、模型选择、提示词和网络请求状态。模型名称和接口能力以页面当前显示为准。

## 参考图和遮罩分别适合什么场景？

参考图用于提供视觉、构图或内容参考；遮罩用于限定编辑区域。一次修改只改变一个主要目标更容易验证结果。

## 官网会保存我的生成结果吗？

THQLLM 官网不会。Toho Image Studio 的具体历史记录行为以该项目当前页面为准。
```

`site/docs/toho-image-studio/changelog.mdx`:

```mdx
---
title: Toho Image Studio 文档更新记录
description: THQLLM 侧的 Toho Image Studio 文档变更。
---

# 更新记录

## 2026-07-13

- 建立 Toho Image Studio 独立文档空间。
- 收录生成、编辑、参考图、遮罩与直连接口的界面范围。
- 增加第一张图片的生成流程和常见排查原则。
```

- [ ] **Step 4: Enable generated sidebars and dead-link checking**

Add these imports to `rspress.config.ts`:

```ts
import { projects } from './src/data/projects';
import { createSidebarConfig } from './src/lib/projects';
```

Change the Markdown setting and add the generated sidebar:

```ts
markdown: {
  checkDeadLinks: true,
},
themeConfig: {
  darkMode: false,
  search: true,
  hideNavbar: 'never',
  enableContentAnimation: false,
  enableAppearanceAnimation: false,
  lastUpdated: true,
  nav: [
    { text: '项目', link: '/projects/', activeMatch: '/projects/' },
    { text: '文档', link: '/docs/fluctgraph/', activeMatch: '/docs/' },
    { text: '开发札记', link: '/notes/', activeMatch: '/notes/' },
    { text: '关于', link: '/about/', activeMatch: '/about/' },
  ],
  sidebar: createSidebarConfig(projects),
},
```

- [ ] **Step 5: Build with dead-link checking**

Run:

```bash
pnpm build
```

Expected: build exits `0`; every configured sidebar link resolves.

- [ ] **Step 6: Commit**

```bash
git add rspress.config.ts site/docs
git commit -m "docs: add initial project manuals"
```

## Task 12: Add Continue-Style 404 and Accessibility Guards

**Files:**
- Create: `theme/tests/NotFoundLayout.test.tsx`
- Create: `theme/layouts/NotFoundLayout.tsx`
- Create: `theme/layouts/NotFoundLayout.module.css`
- Modify: `theme/index.tsx`
- Modify: `theme/styles/global.css`

- [ ] **Step 1: Write the failing 404 test**

`theme/tests/NotFoundLayout.test.tsx`:

```tsx
import { MemoryRouter } from '@rspress/core/runtime';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotFoundLayout } from '../layouts/NotFoundLayout';

describe('NotFoundLayout', () => {
  it('offers useful recovery links', () => {
    render(
      <MemoryRouter>
        <NotFoundLayout />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'CONTINUE?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '查看项目' })).toHaveAttribute(
      'href',
      '/projects/',
    );
  });
});
```

- [ ] **Step 2: Confirm the layout is missing**

Run:

```bash
pnpm test theme/tests/NotFoundLayout.test.tsx
```

Expected: FAIL because `NotFoundLayout` does not exist.

- [ ] **Step 3: Implement the 404 layout**

`theme/layouts/NotFoundLayout.tsx`:

```tsx
import { Link } from '@rspress/core/runtime';
import styles from './NotFoundLayout.module.css';

export function NotFoundLayout() {
  return (
    <main className={styles.page}>
      <p>404 · ROUTE LOST</p>
      <h1>CONTINUE?</h1>
      <span>没有找到这个页面。请选择下一步。</span>
      <nav aria-label="错误页恢复操作">
        <Link href="/">返回首页</Link>
        <Link href="/projects/">查看项目</Link>
        <Link href="/docs/fluctgraph/">搜索文档</Link>
      </nav>
    </main>
  );
}
```

`theme/layouts/NotFoundLayout.module.css`:

```css
.page {
  display: grid;
  min-height: calc(100svh - var(--thq-nav-height));
  place-content: center;
  padding: 32px;
  color: var(--thq-paper);
  text-align: center;
  background: var(--thq-ink);
}

.page p {
  margin: 0 0 12px;
  color: var(--thq-gold);
  font-family: var(--thq-mono-font);
  font-size: 0.75rem;
}

.page h1 {
  margin: 0;
  font-family: var(--thq-display-font);
  font-size: 8rem;
  line-height: 0.8;
  letter-spacing: 0;
}

.page > span {
  margin-top: 24px;
  color: rgb(255 253 247 / 72%);
}

.page nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 32px;
}

.page a {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 13px;
  border: 1px solid var(--thq-paper);
  border-radius: 4px;
  color: var(--thq-paper);
  font-weight: 800;
  text-decoration: none;
}

.page a:first-child {
  color: var(--thq-ink);
  border-color: var(--thq-gold);
  background: var(--thq-gold);
}

@media (max-width: 640px) {
  .page h1 {
    font-size: 4rem;
  }
}
```

- [ ] **Step 4: Register the custom 404 and add robust media defaults**

Replace `theme/index.tsx` with:

```tsx
import { Layout as BasicLayout } from '@rspress/core/theme-original';
import type { FC } from 'react';
import { ApiEndpoint } from './components/mdx/ApiEndpoint';
import { ParameterTable } from './components/mdx/ParameterTable';
import { ProjectLink } from './components/mdx/ProjectLink';
import { DocProjectHeader } from './components/DocProjectHeader';
import { ProjectDocSwitcher } from './components/ProjectDocSwitcher';
import { HomeLayout } from './layouts/HomeLayout';
import { NotFoundLayout } from './layouts/NotFoundLayout';
import './index.css';

const mdxComponents = {
  ApiEndpoint,
  ParameterTable,
  ProjectLink,
} as unknown as Record<string, FC>;

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
```

Append to `theme/styles/global.css`:

```css
img,
picture,
canvas {
  display: block;
  max-width: 100%;
}

a,
button,
input,
summary {
  -webkit-tap-highlight-color: transparent;
}

@media (forced-colors: active) {
  *:focus-visible {
    outline: 3px solid CanvasText;
  }
}
```

- [ ] **Step 5: Run component and build checks**

Run:

```bash
pnpm test theme/tests/NotFoundLayout.test.tsx
pnpm typecheck
pnpm build
```

Expected: PASS and `doc_build/404.html` exists.

- [ ] **Step 6: Commit**

```bash
git add theme/layouts theme/tests/NotFoundLayout.test.tsx theme/index.tsx theme/styles/global.css
git commit -m "feat: add accessible recovery states"
```

## Task 13: Verify Static Output and Create the Social Preview

**Files:**
- Create: `scripts/verify-build.mjs`
- Create: `site/public/og-cover.png`

- [ ] **Step 1: Add a deterministic build verification script**

`scripts/verify-build.mjs`:

```js
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const requiredFiles = [
  'index.html',
  '404.html',
  'projects/index.html',
  'notes/index.html',
  'about/index.html',
  'docs/fluctgraph/index.html',
  'docs/thq-api/index.html',
  'docs/toho-image-studio/index.html',
  'sitemap.xml',
  'llms.txt',
  'llms-full.txt',
];

for (const file of requiredFiles) {
  await access(path.join('doc_build', file));
}

async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectHtmlFiles(absolute);
      }
      return entry.name.endsWith('.html') ? [absolute] : [];
    }),
  );
  return nested.flat();
}

for (const file of await collectHtmlFiles('doc_build')) {
  const html = await readFile(file, 'utf8');
  for (const banned of ['智能结界', '结界']) {
    if (html.includes(banned)) {
      throw new Error(`Banned site copy found in ${file}: ${banned}`);
    }
  }
}

const home = await readFile(path.join('doc_build', 'index.html'), 'utf8');
for (const project of ['FluctGraph', 'THQ API', 'Toho Image Studio']) {
  if (!home.includes(project)) {
    throw new Error(`Missing homepage project: ${project}`);
  }
}

console.log(`Verified ${requiredFiles.length} static outputs and site copy.`);
```

- [ ] **Step 2: Build and run verification**

Run:

```bash
pnpm build
pnpm verify:build
```

Expected: `Verified 11 static outputs and site copy.`

- [ ] **Step 3: Capture the real hero as a 1200x630 social image**

Start the production preview:

```bash
pnpm preview --host 127.0.0.1 --port 4173
```

In another shell, run:

```bash
node --input-type=module -e "
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'site/public/og-cover.png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
"
```

Inspect `site/public/og-cover.png`: THQLLM must be readable, no text may overlap the menu, and the image must not be blank.

- [ ] **Step 4: Rebuild so the social image is included**

Run:

```bash
pnpm build
test -f doc_build/og-cover.png
pnpm verify:build
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-build.mjs site/public/og-cover.png
git commit -m "chore: verify static output and social preview"
```

## Task 14: Add Production Browser, Accessibility, and Visual Tests

**Files:**
- Create: `tests/e2e/home.spec.ts`
- Create: `tests/e2e/docs.spec.ts`
- Create: `tests/e2e/responsive.spec.ts`
- Create: `tests/e2e/*.spec.ts-snapshots/*`

- [ ] **Step 1: Write homepage behavior and accessibility tests**

`tests/e2e/home.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('homepage routes to projects and docs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'THQLLM' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('智能结界');
  await expect(page.locator('body')).not.toContainText('结界');

  const cards = page.getByTestId('project-stage');
  await expect(cards).toHaveCount(3);
  await expect(page.getByRole('link', { name: '进入 FluctGraph' })).toHaveAttribute(
    'href',
    'https://graph.tohoqing.com/',
  );

  await page.getByRole('link', { name: /使用文档/ }).first().click();
  await expect(page).toHaveURL(/\/docs\/fluctgraph\/$/);
});

test('homepage menu is keyboard reachable', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  let found = false;
  for (let index = 0; index < 12; index += 1) {
    const label = await page.locator(':focus').getAttribute('aria-label');
    const text = await page.locator(':focus').textContent();
    if (`${label ?? ''}${text ?? ''}`.includes('项目选择')) {
      found = true;
      break;
    }
    await page.keyboard.press('Tab');
  }
  expect(found).toBe(true);
});

test('homepage has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('homepage desktop screenshot', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('desktop'));
  await page.goto('/');
  await expect(page).toHaveScreenshot('home-desktop.png', {
    fullPage: true,
    animations: 'disabled',
  });
});
```

- [ ] **Step 2: Write documentation tests**

`tests/e2e/docs.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('each project has an independent document root', async ({ page }) => {
  for (const [path, title] of [
    ['/docs/fluctgraph/', 'FluctGraph'],
    ['/docs/thq-api/', 'THQ API'],
    ['/docs/toho-image-studio/', 'Toho Image Studio'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
    await expect(page.getByRole('navigation', { name: '切换项目文档' })).toBeVisible();
  }
});

test('full-text search opens from docs', async ({ page }) => {
  await page.goto('/docs/fluctgraph/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByLabel('SearchPanelInput');
  await expect(input).toBeVisible();
  await input.fill('Toho Image Studio');
  await expect(page.getByText(/Toho Image Studio 概览/)).toBeVisible();
});

test('docs have no serious accessibility violations', async ({ page }) => {
  await page.goto('/docs/thq-api/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('docs desktop screenshot', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('desktop'));
  await page.goto('/docs/fluctgraph/');
  await expect(page).toHaveScreenshot('docs-desktop.png', {
    fullPage: true,
    animations: 'disabled',
  });
});
```

- [ ] **Step 3: Write responsive and reduced-motion tests**

`tests/e2e/responsive.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('required viewports have no horizontal overflow', async ({ page }) => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of ['/', '/projects/', '/docs/fluctgraph/']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  }
});

test('reduced motion disables the danmaku loop', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByTestId('danmaku-canvas')).toHaveAttribute(
    'data-motion',
    'reduced',
  );
});

test('hero copy and navigation survive an image failure', async ({ page }) => {
  await page.route('**/assets/hero/*.webp', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'THQLLM' })).toBeVisible();
  await expect(page.getByRole('link', { name: /项目选择/ })).toBeVisible();
});

test('core navigation renders without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'THQLLM' })).toBeVisible();
  await expect(page.getByRole('link', { name: /项目选择/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '进入 FluctGraph' })).toBeVisible();
  await context.close();
});

test('mobile screenshot', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'));
  await page.goto('/');
  await expect(page).toHaveScreenshot('home-mobile.png', {
    fullPage: true,
    animations: 'disabled',
  });
});
```

- [ ] **Step 4: Run tests and create reviewed baselines**

Run:

```bash
pnpm test:e2e:update
```

Expected: behavior and accessibility assertions PASS; screenshot files are generated. Inspect every screenshot for blank hero images, bad crops, text overlap, hidden controls, one-note color balance, and mobile overflow.

- [ ] **Step 5: Run the browser suite against the baselines**

Run:

```bash
pnpm test:e2e
```

Expected: all desktop and mobile tests PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e
git commit -m "test: cover portal docs and responsive behavior"
```

## Task 15: Final Documentation and End-to-End Verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Add concise project operation documentation**

`README.md`:

````md
# THQLLM Website

Pure-static project portal and documentation site for `thqllm.com`, built with Rspress 2.

## Commands

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm test:e2e
pnpm verify
```

## Add a project

1. Add one validated entry to `src/data/projects.ts`.
2. Add Markdown/MDX files under `site/docs/<project-id>/`.
3. Run `pnpm verify`.

## Content boundaries

- Do not add unverified API endpoints, model names, commands, or configuration fields.
- Do not use official Touhou Project characters, logos, music, or unlicensed fan art.
- Keep the homepage title as `THQLLM`.
````

- [ ] **Step 2: Run the complete verification pipeline**

Run:

```bash
pnpm verify
```

Expected:

- Biome exits `0`
- TypeScript exits `0`
- Vitest exits `0`
- Rspress production build exits `0`
- static-output verification prints `Verified 11 static outputs and site copy.`
- Playwright desktop and mobile projects exit `0`

- [ ] **Step 3: Inspect the final git diff and worktree**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only `README.md` is uncommitted.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add THQLLM website operations"
```

- [ ] **Step 5: Start the local server for user acceptance**

Run:

```bash
pnpm dev --host 127.0.0.1 --port 5173
```

Expected: Rspress prints `http://127.0.0.1:5173`. Keep the server running and provide that URL to the user for final visual review.
