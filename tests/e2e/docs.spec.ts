import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { projects } from '../../src/data/projects';
import { createProjectDocRoutePath } from '../../src/lib/project-doc-routes';

const documentationRoots = projects
  .flatMap((project) =>
    project.docs
      ? [
          {
            order: project.order,
            path: project.docs.basePath,
            projectName: project.name,
          },
        ]
      : [],
  )
  .toSorted((left, right) => left.order - right.order)
  .map(({ path, projectName }) => ({ path, projectName }));
const documentedProjects = projects.flatMap((project) =>
  project.docs
    ? [
        {
          name: project.name,
          path: project.docs.basePath,
        },
      ]
    : [],
);
const thqApiProject = projects.find((project) => project.id === 'thq-api');

if (!thqApiProject?.docs) {
  throw new Error('Missing THQ API documentation registry');
}

const thqApiDocs = thqApiProject.docs;
const thqApiExpectedHeadings = new Map<string, string>([
  ['index', 'THQ API'],
  ['quick-start', '快速开始'],
  ['clients/index', '客户端接入总览'],
  ['clients/codex', 'Codex 接入 THQ API'],
  ['clients/claude-code', 'Claude Code 接入 THQ API'],
  ['clients/gemini-cli', 'Gemini CLI 接入 THQ API'],
  ['clients/vscode', 'VS Code 接入 THQ API'],
  ['clients/opencode', 'OpenCode 接入 THQ API'],
  ['clients/openclaw', 'OpenClaw 接入 THQ API'],
  ['clients/cherry-studio', 'Cherry Studio 接入 THQ API'],
  ['configuration', '手动配置'],
  ['endpoints', '端点说明'],
  ['account', '账户、额度与使用记录'],
  ['faq', '常见问题与错误排查'],
  ['changelog', '更新记录'],
]);
const thqApiDocumentationRoutes = thqApiDocs.sections.flatMap((section) =>
  section.items.map((item) => {
    const expectedHeading = thqApiExpectedHeadings.get(item.slug);

    if (expectedHeading === undefined) {
      throw new Error(`Missing THQ API heading expectation for ${item.slug}`);
    }

    return {
      expectedHeading,
      path: createProjectDocRoutePath(thqApiDocs.basePath, item.slug),
      sidebarItemText: item.text,
    };
  }),
);

if (thqApiDocumentationRoutes.length !== 15) {
  throw new Error(
    `Expected 15 THQ API documentation routes, found ${thqApiDocumentationRoutes.length}`,
  );
}

const docPanelTopProperty = '--thq-doc-panel-top';
const docPanelFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

async function openDeterministicDocs(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

function getProjectHeading(page: Page, projectName: string) {
  return page.getByRole('heading', {
    exact: true,
    level: 1,
    name: projectName,
  });
}

function normalizeStaticDocPath(pathname: string) {
  return pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
}

async function readPanelMetrics(page: Page, panel: Locator) {
  const [menuBox, panelBox] = await Promise.all([
    page.locator('.rp-doc-layout__menu').boundingBox(),
    panel.boundingBox(),
  ]);
  const viewport = page.viewportSize();

  if (!menuBox || !panelBox || !viewport) {
    return {
      bottomOverflow: Number.POSITIVE_INFINITY,
      topDelta: Number.POSITIVE_INFINITY,
    };
  }

  return {
    bottomOverflow: panelBox.y + panelBox.height - viewport.height,
    topDelta: Math.abs(panelBox.y - (menuBox.y + menuBox.height)),
  };
}

async function expectPanelAlignedWithinViewport(page: Page, panel: Locator) {
  await expect
    .poll(async () => (await readPanelMetrics(page, panel)).topDelta)
    .toBeLessThanOrEqual(1);
  await expect
    .poll(async () => (await readPanelMetrics(page, panel)).bottomOverflow)
    .toBeLessThanOrEqual(1);
}

async function expectPanelTopVariableMatchesMenu(page: Page) {
  const container = page.locator('.rp-doc-layout__container');

  await expect
    .poll(async () => {
      const [menuBox, propertyValue] = await Promise.all([
        page.locator('.rp-doc-layout__menu').boundingBox(),
        container.evaluate(
          (element, property) => element.style.getPropertyValue(property),
          docPanelTopProperty,
        ),
      ]);
      const panelTop = Number.parseFloat(propertyValue);

      if (!menuBox || !Number.isFinite(panelTop)) {
        return Number.POSITIVE_INFINITY;
      }

      return Math.abs(panelTop - (menuBox.y + menuBox.height));
    })
    .toBeLessThanOrEqual(1);
}

async function expectItemInsidePanel(panel: Locator, item: Locator) {
  await expect
    .poll(async () => {
      const [panelBox, itemBox] = await Promise.all([panel.boundingBox(), item.boundingBox()]);
      if (!panelBox || !itemBox) {
        return false;
      }

      return (
        itemBox.y >= panelBox.y - 1 &&
        itemBox.y + itemBox.height <= panelBox.y + panelBox.height + 1
      );
    })
    .toBe(true);
}

async function waitForTwoAnimationFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      }),
  );
}

async function expectTabFocusConfinedToPanel(
  page: Page,
  panelSelector: string,
  key: 'Shift+Tab' | 'Tab',
) {
  const upperBound = await page.evaluate(
    ({ focusableSelector, panel }) => {
      const roots = [document.querySelector('.rp-sidebar-menu'), document.querySelector(panel)];
      return roots.reduce((count, root) => {
        return count + (root?.querySelectorAll(focusableSelector).length ?? 0);
      }, 0);
    },
    { focusableSelector: docPanelFocusableSelector, panel: panelSelector },
  );
  expect(upperBound).toBeGreaterThan(0);

  for (let index = 0; index < upperBound + 3; index += 1) {
    await page.keyboard.press(key);
    const focusRegion = await page.evaluate((selector) => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) {
        return 'none';
      }
      if (activeElement.closest('.rp-sidebar-menu')) {
        return 'menu';
      }
      if (activeElement.closest(selector)) {
        return 'panel';
      }
      return `${activeElement.tagName.toLowerCase()}:${activeElement.getAttribute('aria-label') ?? activeElement.textContent?.trim().slice(0, 40) ?? ''}`;
    }, panelSelector);

    expect(
      ['menu', 'panel'],
      `${key} ${index + 1} escaped the open documentation panel to ${focusRegion}`,
    ).toContain(focusRegion);
  }
}

for (const documentationRoot of documentationRoots) {
  test(`${documentationRoot.projectName} documentation has its own root and project switcher`, async ({
    page,
  }) => {
    await page.goto(documentationRoot.path);

    await expect(getProjectHeading(page, documentationRoot.projectName)).toBeVisible();
    const switcher = page.getByRole('navigation', { name: '切换项目文档' });
    await expect(switcher).toBeVisible();
    await expect(switcher.locator('a, [aria-current="page"]')).toHaveText(
      documentedProjects.map((project) => project.name),
    );

    for (const project of documentedProjects) {
      if (project.name === documentationRoot.projectName) {
        const currentTab = switcher.locator('[aria-current="page"]');
        await expect(currentTab).toHaveText(project.name);
        await expect(currentTab).not.toHaveAttribute('href');
      } else {
        await expect(switcher.getByRole('link', { name: `${project.name} 文档` })).toHaveAttribute(
          'href',
          project.path,
        );
      }
    }

    await expect(switcher.getByRole('combobox', { name: '切换当前项目文档' })).toHaveCount(0);
  });
}

test('documentation omits the project information header while keeping the project switcher', async ({
  page,
}) => {
  await page.goto('/docs/fluctgraph/');

  await expect(page.getByRole('region', { name: 'FluctGraph 项目信息' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '切换项目文档' })).toBeVisible();
});

for (const route of thqApiDocumentationRoutes) {
  test(`THQ API route ${route.path} is published and linked`, async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'THQ API route coverage only needs one browser project');

    await page.goto(route.path);

    await expect(
      page.getByRole('heading', {
        exact: true,
        level: 1,
        name: route.expectedHeading,
      }),
    ).toBeVisible();
    const sidebarLink = page
      .getByRole('complementary', { name: '文档导航' })
      .getByRole('link', { name: route.sidebarItemText, exact: true });
    await expect(sidebarLink).toHaveCount(1);
    await expect(sidebarLink).toBeVisible();
    const sidebarHref = await sidebarLink.getAttribute('href');
    expect(sidebarHref).not.toBeNull();
    expect(normalizeStaticDocPath(new URL(sidebarHref ?? '', page.url()).pathname)).toBe(
      route.path,
    );
  });
}

test('documentation project names treat regex punctuation as literal text', async ({ page }) => {
  await page.setContent('<h1>C++ Tools</h1><h1>C++ Tools Extra</h1>');

  await expect(getProjectHeading(page, 'C++ Tools')).toHaveCount(1);
});

test('FluctGraph full-text search finds the Toho Image Studio overview', async ({ page }) => {
  await page.goto('/docs/fluctgraph/');

  await page.keyboard.press('ControlOrMeta+k');
  const searchInput = page.getByLabel('SearchPanelInput');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('Toho Image Studio');

  await expect(page.getByText(/Toho Image Studio 概览/).first()).toBeVisible();
});

test('THQ API endpoint reference distinguishes all protocols', async ({ page }) => {
  await page.goto('/docs/thq-api/endpoints');

  const main = page.locator('main');
  for (const address of [
    'https://api.thqllm.com/v1',
    'https://api.thqllm.com',
    'https://api.thqllm.com/v1beta',
  ]) {
    await expect(main.getByText(address, { exact: true }).first()).toBeVisible();
  }

  const correctionTable = main.getByRole('table').filter({ hasText: '错误配置' });
  const correctionRows = [
    {
      incorrect: 'Claude Code 使用 https://api.thqllm.com/v1',
      correct: '使用 https://api.thqllm.com',
    },
    {
      incorrect: 'Gemini CLI 使用 https://api.thqllm.com/v1',
      correct: '分别配置主机 https://api.thqllm.com 与版本 v1beta',
    },
    {
      incorrect: 'OpenAI 兼容客户端只填 https://api.thqllm.com',
      correct: '使用 https://api.thqllm.com/v1',
    },
  ] as const;

  for (const correction of correctionRows) {
    const row = correctionTable.getByRole('row').filter({ hasText: correction.incorrect });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(correction.correct);
  }
});

test('documentation search finds the Claude Code guide', async ({ page, isMobile }) => {
  await page.goto('/docs/thq-api/');

  const searchButton = isMobile
    ? page.getByRole('button', { name: '搜索', exact: true })
    : page.getByRole('button', { name: /^搜索(?:\s|$)/ });
  await searchButton.click();

  const searchInput = page.getByLabel('SearchPanelInput');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('Claude Code 接入');

  const claudeCodeResult = page
    .locator('.rp-suggest-item__link')
    .filter({ hasText: 'Claude Code 接入' })
    .first();
  await expect(claudeCodeResult).toBeVisible();
  await expect(claudeCodeResult).toHaveAttribute('href', '/docs/thq-api/clients/claude-code');
});

test('SearchPanel keeps Enter safe without breaking keyboard navigation', async ({
  page,
  isMobile,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error);
  });
  const expectNoPageErrors = (stage: string) => {
    expect(pageErrors, `${stage} emitted a pageerror`).toEqual([]);
  };

  await page.goto('/docs/fluctgraph/');

  const searchButton = isMobile
    ? page.getByRole('button', { name: '搜索', exact: true })
    : page.getByRole('button', { name: /^搜索(?:\s|$)/ });
  await searchButton.focus();
  await expect(searchButton).toBeFocused();
  await page.keyboard.press('Enter');

  const searchInput = page.getByLabel('SearchPanelInput');
  await expect(searchInput).toBeVisible();
  expectNoPageErrors('opening search from the visible trigger');

  await searchInput.focus();
  await page.keyboard.press('Enter');
  await expect(searchInput).toBeVisible();
  expectNoPageErrors('pressing Enter with an empty query');

  const noResultQuery = 'zzzzqv-no-search-hit-7f3a9b2c';
  await searchInput.fill(noResultQuery);
  await expect(page.locator('.rp-no-search-result')).toContainText(noResultQuery);
  await page.keyboard.press('Enter');
  await expect(searchInput).toBeVisible();
  expectNoPageErrors('pressing Enter with no search results');

  await page.keyboard.press('Escape');
  await expect(searchInput).not.toBeVisible();
  expectNoPageErrors('closing the no-result panel');

  await page.goto('/');
  const docsLink = page
    .getByRole('navigation', { name: '首页主菜单' })
    .getByRole('link', { name: /使用文档/ });
  await docsLink.focus();
  await expect(docsLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/docs\/fluctgraph\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /FluctGraph/i })).toBeVisible();
  expectNoPageErrors('following a regular link with Enter');

  await page.keyboard.press('ControlOrMeta+k');
  await expect(searchInput).toBeVisible();
  expectNoPageErrors('reopening search with the keyboard shortcut');
  await searchInput.fill('Toho Image Studio 概览');

  const currentSuggestion = page.locator('.rp-suggest-item--current .rp-suggest-item__link');
  await expect(currentSuggestion).toBeVisible();
  expectNoPageErrors('rendering a current search suggestion');
  const suggestionHref = await currentSuggestion.getAttribute('href');
  expect(suggestionHref).not.toBeNull();
  const expectedSuggestionUrl = new URL(suggestionHref ?? '', page.url());

  await searchInput.dispatchEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code: 'Enter',
    isComposing: true,
    key: 'Enter',
  });
  await expect(searchInput).toBeVisible();
  await expect(page).toHaveURL(/\/docs\/fluctgraph\/$/);
  expectNoPageErrors('pressing composing Enter with a current suggestion');

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === expectedSuggestionUrl.pathname &&
      url.search === expectedSuggestionUrl.search &&
      url.hash === expectedSuggestionUrl.hash
    );
  });
  expectNoPageErrors('following the current search suggestion with Enter');
});

test('SearchPanel does not navigate stale suggestions while a new query is pending', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error);
  });

  await page.goto('/docs/fluctgraph/');
  await page.keyboard.press('ControlOrMeta+k');

  const searchInput = page.getByLabel('SearchPanelInput');
  await expect(searchInput).toBeVisible();
  const originalUrl = page.url();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await searchInput.fill('Toho Image Studio 概览');
    await expect(page.locator('.rp-suggest-item--current .rp-suggest-item__link')).toBeVisible();

    const pendingQuery = `zzzzqv-stale-query-${attempt}-7f3a9b2c`;
    await searchInput.evaluate((element, nextQuery) => {
      const input = element as HTMLInputElement;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setValue) {
        throw new Error('HTMLInputElement value setter is unavailable');
      }

      setValue.call(input, nextQuery);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          code: 'Enter',
          key: 'Enter',
        }),
      );
    }, pendingQuery);

    await expect(page).toHaveURL(originalUrl);
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveValue(pendingQuery);
    expect(pageErrors, `stale-query attempt ${attempt + 1} emitted a pageerror`).toEqual([]);

    await expect(page.locator('.rp-no-search-result')).toContainText(pendingQuery);
  }
});

test('SearchPanel leaves later global Enter listeners intact', async ({ page, isMobile }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error);
  });

  await page.goto('/docs/fluctgraph/');

  const searchButton = isMobile
    ? page.getByRole('button', { name: '搜索', exact: true })
    : page.getByRole('button', { name: /^搜索(?:\s|$)/ });
  await expect(searchButton).toBeVisible();
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __thqllmGlobalEnterTargets?: string[];
    };
    testWindow.__thqllmGlobalEnterTargets = [];
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Enter') {
        return;
      }

      const label =
        event.target instanceof HTMLInputElement ? `input:${event.target.value}` : 'search-trigger';
      testWindow.__thqllmGlobalEnterTargets?.push(label);
    });
  });

  await searchButton.focus();
  await page.keyboard.press('Enter');

  const searchInput = page.getByLabel('SearchPanelInput');
  await expect(searchInput).toBeVisible();
  expect(pageErrors, 'closed search Enter emitted a pageerror').toEqual([]);

  await searchInput.focus();
  await page.keyboard.press('Enter');
  await expect(searchInput).toBeVisible();
  expect(pageErrors, 'empty query Enter emitted a pageerror').toEqual([]);

  const noResultQuery = 'zzzzqv-global-listener-7f3a9b2c';
  await searchInput.fill(noResultQuery);
  await expect(page.locator('.rp-no-search-result')).toContainText(noResultQuery);
  await page.keyboard.press('Enter');
  await expect(searchInput).toBeVisible();
  expect(pageErrors, 'no-result Enter emitted a pageerror').toEqual([]);

  const globalEnterTargets = await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __thqllmGlobalEnterTargets?: string[];
    };
    return testWindow.__thqllmGlobalEnterTargets ?? [];
  });
  expect(globalEnterTargets).toEqual(['search-trigger', 'input:', `input:${noResultQuery}`]);
});

test('FluctGraph documentation uses the Chinese Rspress shell', async ({ page, isMobile }) => {
  await page.goto('/docs/fluctgraph/');

  await expect(page.getByText(/^最后更新于:/)).toBeVisible();
  await expect(page.getByRole('link', { name: /^下一页(?:\s|$)/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');

  if (isMobile) {
    await expect(page.getByRole('button', { name: '菜单', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '目录', exact: true })).toBeVisible();
    const mobileSearchButton = page.getByRole('button', { name: '搜索', exact: true });
    const mobileSearchBox = await mobileSearchButton.boundingBox();
    expect(mobileSearchBox).not.toBeNull();
    expect(mobileSearchBox?.width).toBe(40);
    expect(mobileSearchBox?.height).toBe(40);
    await mobileSearchButton.click();
  } else {
    const searchButton = page.getByRole('button', { name: /^搜索(?:\s|$)/ });
    await expect(searchButton).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: '页内目录' }).getByText('目录', { exact: true }),
    ).toBeVisible();
    await searchButton.click();
  }

  await expect(page.getByLabel('SearchPanelInput')).toHaveAttribute('placeholder', '搜索');
});

test('mobile search restores focus to its trigger after Escape', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile search trigger only');

  await page.goto('/docs/fluctgraph/');

  const mobileSearchButton = page.getByRole('button', { name: '搜索', exact: true });
  await mobileSearchButton.click();

  const searchInput = page.getByLabel('SearchPanelInput');
  await expect(searchInput).toBeVisible();
  await searchInput.click();
  await expect(searchInput).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(searchInput).not.toBeVisible();
  await expect(mobileSearchButton).toBeFocused();
});

test('mobile closed documentation panels stay out of the Tab order', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile documentation controls only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/fluctgraph/');

  const sidebar = page.getByRole('complementary', {
    name: '文档导航',
    includeHidden: true,
  });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });
  const projectLink = page.getByRole('link', { name: '打开 FluctGraph', exact: true });

  await expect(sidebar).not.toHaveClass(/rp-doc-layout__sidebar--open/);
  await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
  await projectLink.focus();

  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press('Tab');
    const hiddenPanel = await page.evaluate(() => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) {
        return null;
      }
      if (activeElement.closest('.rp-doc-layout__sidebar')) {
        return 'sidebar';
      }
      if (activeElement.closest('.rp-doc-layout__outline')) {
        return 'outline';
      }
      return null;
    });
    expect(hiddenPanel, `Tab ${index + 1} entered the closed ${hiddenPanel} panel`).toBeNull();
  }
});

test('mobile documentation panel triggers expose stable ARIA state and relationships', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile documentation controls only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/fluctgraph/');

  const menuButton = page.getByRole('button', { name: '菜单', exact: true });
  const outlineButton = page.getByRole('button', { name: '目录', exact: true });
  const sidebar = page.getByRole('complementary', {
    name: '文档导航',
    includeHidden: true,
  });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });

  await expect(menuButton).toHaveAttribute('aria-controls', 'thq-doc-sidebar');
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar).toHaveAttribute('id', 'thq-doc-sidebar');
  await expect(outlineButton).toHaveAttribute('aria-controls', 'thq-doc-outline');
  await expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
  await expect(outline).toHaveAttribute('id', 'thq-doc-outline');

  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(menuButton).toBeFocused();

  await outlineButton.click();
  await expect(outlineButton).toHaveAttribute('aria-expanded', 'true');
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await outlineButton.click();
  await expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
  await expect(outlineButton).toBeFocused();
});

test('mobile open sidebar confines Tab focus to the panel and its controls', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile documentation controls only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/fluctgraph/');

  const menuButton = page.getByRole('button', { name: '菜单', exact: true });
  const sidebar = page.getByRole('complementary', {
    name: '文档导航',
    includeHidden: true,
  });

  await menuButton.focus();
  await page.keyboard.press('Enter');
  await expect(sidebar).toHaveClass(/rp-doc-layout__sidebar--open/);
  await expectTabFocusConfinedToPanel(page, '.rp-doc-layout__sidebar', 'Tab');
  await expectTabFocusConfinedToPanel(page, '.rp-doc-layout__sidebar', 'Shift+Tab');
});

for (const key of ['Tab', 'Shift+Tab'] as const) {
  test(`mobile collapsed sidebar links stay out of ${key} focus and Enter navigation`, async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Mobile documentation controls only');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/docs/fluctgraph/');

    const originalUrl = page.url();
    const menuButton = page.getByRole('button', { name: '菜单', exact: true });
    const sidebar = page.getByRole('complementary', {
      name: '文档导航',
      includeHidden: true,
    });
    const startGroup = sidebar.locator('.rp-sidebar-group').filter({ hasText: '开始' }).first();
    const startGroupContent = startGroup.locator('xpath=following-sibling::div[1]');
    const overviewLink = sidebar.getByRole('link', { name: '概览', exact: true });
    const quickStartLink = sidebar.getByRole('link', { name: '快速开始', exact: true });

    await menuButton.click();
    await expect(sidebar).toHaveClass(/rp-doc-layout__sidebar--open/);
    await expect
      .poll(async () => (await startGroupContent.boundingBox())?.height ?? 0)
      .toBeGreaterThan(1);
    await startGroup.click();
    await expect
      .poll(async () => (await startGroupContent.boundingBox())?.height ?? Number.POSITIVE_INFINITY)
      .toBeLessThanOrEqual(1);

    const candidateCount =
      (await page.evaluate((focusableSelector) => {
        const roots = [
          document.querySelector('.rp-sidebar-menu'),
          document.querySelector('.rp-doc-layout__sidebar'),
        ];
        return roots.reduce((count, root) => {
          return count + (root?.querySelectorAll(focusableSelector).length ?? 0);
        }, 0);
      }, docPanelFocusableSelector)) + 3;
    const hiddenFocusHits: string[] = [];
    await menuButton.focus();

    for (let index = 0; index < candidateCount; index += 1) {
      await page.keyboard.press(key);
      const [overviewFocused, quickStartFocused] = await Promise.all([
        overviewLink.evaluate((element) => document.activeElement === element),
        quickStartLink.evaluate((element) => document.activeElement === element),
      ]);
      if (overviewFocused) {
        hiddenFocusHits.push('概览');
      }
      if (quickStartFocused) {
        hiddenFocusHits.push('快速开始');
        await page.keyboard.press('Enter');
        break;
      }
    }

    expect(hiddenFocusHits).toEqual([]);
    await expect(page).toHaveURL(originalUrl);
  });
}

test('mobile open outline confines Tab focus to the panel and its controls', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile documentation controls only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/fluctgraph/');

  const outlineButton = page.getByRole('button', { name: '目录', exact: true });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });

  await outlineButton.focus();
  await page.keyboard.press('Enter');
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  await expectTabFocusConfinedToPanel(page, '.rp-doc-layout__outline', 'Tab');
  await expectTabFocusConfinedToPanel(page, '.rp-doc-layout__outline', 'Shift+Tab');
});

for (const key of ['Tab', 'Shift+Tab'] as const) {
  test(`short mobile outline scrolls every TOC item into ${key} focus without escaping`, async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Mobile documentation controls only');
    await page.setViewportSize({ width: 390, height: 320 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/docs/toho-image-studio/quick-start/');
    await page.addStyleTag({
      content: 'html { font-size: 200% !important; }',
    });

    const outlineButton = page.getByRole('button', { name: '目录', exact: true });
    const outline = page.getByRole('complementary', {
      name: '页内目录',
      includeHidden: true,
    });
    const tocLinks = outline.locator('.rp-outline__toc a[href*="#"]');
    await expect(tocLinks).toHaveCount(5);
    const expectedHrefs = await tocLinks.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')),
    );

    await outlineButton.click();
    await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
    await expect(outline).toBeVisible();
    await outlineButton.focus();

    const focusedHrefs = new Set<string | null>();
    for (let index = 0; index < 20; index += 1) {
      await page.keyboard.press(key);
      const focusState = await page.evaluate(() => {
        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) {
          return { href: null, region: 'none' };
        }
        if (activeElement.closest('.rp-sidebar-menu')) {
          return { href: null, region: 'menu' };
        }
        if (activeElement.closest('.rp-doc-layout__outline')) {
          return {
            href:
              activeElement instanceof HTMLAnchorElement
                ? activeElement.getAttribute('href')
                : null,
            region: 'outline',
          };
        }
        return {
          href: null,
          region: `${activeElement.tagName.toLowerCase()}:${
            activeElement.getAttribute('aria-label') ??
            activeElement.textContent?.trim().slice(0, 40) ??
            ''
          }`,
        };
      });

      expect(
        ['menu', 'outline'],
        `${key} ${index + 1} escaped the open outline to ${focusState.region}`,
      ).toContain(focusState.region);

      if (focusState.href && expectedHrefs.includes(focusState.href)) {
        focusedHrefs.add(focusState.href);
        await expectItemInsidePanel(outline, page.locator(':focus'));
      }
    }

    expect([...focusedHrefs].sort()).toEqual([...expectedHrefs].sort());
  });
}

for (const panel of [
  {
    name: 'sidebar',
    panelSelector: '.rp-doc-layout__sidebar',
    triggerName: '菜单',
  },
  {
    name: 'outline',
    panelSelector: '.rp-doc-layout__outline',
    triggerName: '目录',
  },
] as const) {
  test(`mobile search modal keeps ${panel.name} panel trap suspended until search closes`, async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Mobile documentation controls only');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/docs/fluctgraph/');

    const trigger = page.getByRole('button', { name: panel.triggerName, exact: true });
    const documentationPanel = page.locator(panel.panelSelector);

    await trigger.click();
    await expect(documentationPanel).toHaveClass(/--open/);
    await page.keyboard.press('ControlOrMeta+k');

    const searchInput = page.getByLabel('SearchPanelInput');
    const searchModal = page.locator('.rp-search-panel__modal');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeFocused();
    await searchInput.fill('Toho Image Studio 概览');
    await expect(page.locator('.rp-suggest-item--current .rp-suggest-item__link')).toBeVisible();

    await page.keyboard.press('Tab');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const activeElement = document.activeElement;
          return Boolean(
            activeElement instanceof HTMLElement &&
              activeElement.closest('.rp-search-panel__modal'),
          );
        }),
      )
      .toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect
      .poll(() => searchModal.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);

    await page.keyboard.press('Escape');
    await expect(searchInput).toBeHidden();
    await expect(documentationPanel).toHaveClass(/--open/);
    await expect(trigger).toBeFocused();
    await expectTabFocusConfinedToPanel(page, panel.panelSelector, 'Tab');
  });
}

test('mobile sidebar search pointer keeps focus in the search input', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile documentation controls only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/fluctgraph/');

  const menuButton = page.getByRole('button', { name: '菜单', exact: true });
  const sidebar = page.getByRole('complementary', {
    name: '文档导航',
    includeHidden: true,
  });
  const searchButton = page.getByRole('button', { name: '搜索', exact: true });

  await menuButton.click();
  await expect(sidebar).toHaveClass(/rp-doc-layout__sidebar--open/);
  await expect(searchButton).toBeVisible();
  await searchButton.click();

  const searchInput = page.getByLabel('SearchPanelInput');
  await expect(searchInput).toBeVisible();
  await waitForTwoAnimationFrames(page);
  await expect(searchInput).toBeFocused();
  await page.keyboard.type('pointer focus stays');
  await expect(searchInput).toHaveValue('pointer focus stays');
  await expect(menuButton).not.toBeFocused();
});

test('tablet outline search pointer keeps focus in the search input', async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), 'Custom tablet viewport only needs one browser project');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/docs/fluctgraph/');

  const outlineButton = page.getByRole('button', { name: '目录', exact: true });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });
  const searchButton = page.getByRole('button', { name: /^搜索(?:\s|$)/ });

  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  await expect(searchButton).toBeVisible();
  await searchButton.click();

  const searchInput = page.getByLabel('SearchPanelInput');
  await expect(searchInput).toBeVisible();
  await waitForTwoAnimationFrames(page);
  await expect(searchInput).toBeFocused();
  await page.keyboard.type('pointer focus stays');
  await expect(searchInput).toHaveValue('pointer focus stays');
  await expect(outlineButton).not.toBeFocused();
});

test('mobile sidebar mask closes the panel and restores focus to its trigger', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile documentation controls only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/fluctgraph/');

  const menuButton = page.getByRole('button', { name: '菜单', exact: true });
  const sidebar = page.getByRole('complementary', {
    name: '文档导航',
    includeHidden: true,
  });

  await menuButton.click();
  await sidebar.getByRole('link').first().focus();
  await page.locator('.rp-sidebar-menu__mask').click({
    position: { x: 385, y: 400 },
  });

  await expect(sidebar).not.toHaveClass(/rp-doc-layout__sidebar--open/);
  await expect(page.locator('.rp-sidebar-menu__mask')).toHaveCount(0);
  await expect(menuButton).toBeFocused();
});

test('mobile outline mask closes the panel and restores focus to its trigger', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile documentation controls only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/fluctgraph/');

  const outlineButton = page.getByRole('button', { name: '目录', exact: true });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });

  await outlineButton.click();
  await outline.getByRole('link').first().focus();
  await page.locator('.rp-sidebar-menu__mask').click({
    position: { x: 5, y: 400 },
  });

  await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
  await expect(page.locator('.rp-sidebar-menu__mask')).toHaveCount(0);
  await expect(outlineButton).toBeFocused();
});

test('tablet outline pointer navigation closes without restoring its trigger focus', async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), 'Custom tablet viewport only needs one browser project');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/docs/fluctgraph/');

  const outlineButton = page.getByRole('button', { name: '目录', exact: true });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });

  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  const nextPageLink = page.getByRole('link', { name: /^下一页(?:\s|$)/ });
  await nextPageLink.click();

  await expect(page).toHaveURL(/\/docs\/fluctgraph\/quick-start(?:\.html|\/)?$/);
  await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
  await expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
  await waitForTwoAnimationFrames(page);
  await expect(outlineButton).not.toBeFocused();
});

test('outline closes for project, history, and document pathname navigation', async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), 'Custom tablet viewport only needs one browser project');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/docs/fluctgraph/');

  const outlineButton = page.getByRole('button', { name: '目录', exact: true });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });
  const bodyOverflow = () => page.locator('body').evaluate((element) => element.style.overflow);
  const expectOutlineClosedAfterNavigation = async () => {
    await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
    await expect(outline).toHaveCSS('visibility', 'hidden');
    await expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
    await expect(outlineButton).not.toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const activeElement = document.activeElement;
          return !(
            activeElement instanceof HTMLElement && activeElement.closest('.rp-sidebar-menu')
          );
        }),
      )
      .toBe(true);
    await expect(page.locator('.rp-sidebar-menu__mask')).toHaveCount(0);
    await expect.poll(bodyOverflow).toBe('');
  };

  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  const projectSwitcher = page.getByRole('navigation', { name: '切换项目文档' });
  const thqApiLink = projectSwitcher.getByRole('link', { name: 'THQ API 文档' });
  await thqApiLink.focus();
  await thqApiLink.click();
  await expect(page).toHaveURL(/\/docs\/thq-api\/$/);
  await expectOutlineClosedAfterNavigation();

  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  await page.getByRole('link', { name: 'FluctGraph 文档' }).focus();
  await page.goBack();
  await expect(page).toHaveURL(/\/docs\/fluctgraph\/$/);
  await expectOutlineClosedAfterNavigation();

  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  await page.getByRole('link', { name: 'THQ API 文档' }).focus();
  await page.goForward();
  await expect(page).toHaveURL(/\/docs\/thq-api\/$/);
  await expectOutlineClosedAfterNavigation();

  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  const nextPageLink = page.getByRole('link', { name: /^下一页(?:\s|$)/ });
  await nextPageLink.focus();
  await nextPageLink.evaluate((element) => (element as HTMLElement).click());
  await expect(page).not.toHaveURL(/\/docs\/thq-api\/$/);
  await expectOutlineClosedAfterNavigation();
});

test('outline overlay closes without focus theft when resizing from 1279px to desktop', async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), 'Custom responsive viewport only needs one browser project');
  await page.setViewportSize({ width: 1279, height: 768 });
  await page.goto('/docs/fluctgraph/');

  const outlineButton = page.getByRole('button', {
    name: '目录',
    exact: true,
    includeHidden: true,
  });
  const sidebar = page.getByRole('complementary', { name: '文档导航' });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });

  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  await expect(outlineButton).toHaveAttribute('aria-expanded', 'true');
  await outline.getByRole('link').first().focus();

  await page.setViewportSize({ width: 1280, height: 768 });
  await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
  await expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.rp-sidebar-menu__mask')).toHaveCount(0);
  await expect(outlineButton).not.toBeFocused();
  await expect(outline).toHaveCSS('position', 'sticky');

  const projectSwitcherLink = page
    .getByRole('navigation', { name: '切换项目文档' })
    .getByRole('link')
    .last();
  const firstSidebarLink = sidebar.getByRole('link').first();
  await projectSwitcherLink.focus();
  await page.keyboard.press('Tab');
  await expect(firstSidebarLink).toBeFocused();
});

test('tablet persistent sidebar has no inactive mobile trigger or body lock', async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), 'Custom tablet viewport only needs one browser project');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/docs/fluctgraph/');

  const menuButton = page.getByRole('button', {
    name: '菜单',
    exact: true,
    includeHidden: true,
  });
  const sidebar = page.getByRole('complementary', { name: '文档导航' });

  await expect(sidebar).toBeVisible();
  await expect(menuButton).toBeHidden();
  await menuButton.dispatchEvent('click');
  await expect(sidebar).not.toHaveClass(/rp-doc-layout__sidebar--open/);
  await expect(page.locator('.rp-sidebar-menu__mask')).toHaveCount(0);
  await expect
    .poll(() => page.locator('body').evaluate((element) => element.style.overflow))
    .toBe('');
});

test('768px uses a persistent sidebar without a mobile trigger, mask, or body lock', async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), 'Custom tablet viewport only needs one browser project');
  await page.setViewportSize({ width: 768, height: 768 });
  await page.goto('/docs/fluctgraph/');

  const menuButton = page.getByRole('button', {
    name: '菜单',
    exact: true,
    includeHidden: true,
  });
  await menuButton.dispatchEvent('click');

  await expect
    .poll(() =>
      page.evaluate(() => {
        const trigger = document.querySelector<HTMLElement>('.rp-sidebar-menu__left');
        const sidebar = document.querySelector<HTMLElement>('.rp-doc-layout__sidebar');
        const mask = document.querySelector<HTMLElement>('.rp-sidebar-menu__mask');
        const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
        const sidebarBounds = sidebar?.getBoundingClientRect();

        return {
          bodyOverflow: document.body.style.overflow,
          maskCount: mask ? 1 : 0,
          maskDisplay: mask ? getComputedStyle(mask).display : null,
          sidebarOpen: sidebar?.classList.contains('rp-doc-layout__sidebar--open') ?? false,
          sidebarVisible: Boolean(
            sidebarStyle &&
              sidebarBounds &&
              sidebarStyle.display !== 'none' &&
              sidebarStyle.visibility !== 'hidden' &&
              Number.parseFloat(sidebarStyle.opacity) > 0 &&
              sidebarBounds.right > 0,
          ),
          triggerVisible: Boolean(trigger && trigger.getClientRects().length > 0),
        };
      }),
    )
    .toEqual({
      bodyOverflow: '',
      maskCount: 0,
      maskDisplay: null,
      sidebarOpen: false,
      sidebarVisible: true,
      triggerVisible: false,
    });
});

test('mobile sidebar pathname navigation closes the panel and clears its lock', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile documentation controls only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/fluctgraph/');

  const menuButton = page.getByRole('button', { name: '菜单', exact: true });
  const sidebar = page.getByRole('complementary', {
    name: '文档导航',
    includeHidden: true,
  });

  await menuButton.click();
  await expect(sidebar).toHaveClass(/rp-doc-layout__sidebar--open/);
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(() => page.locator('body').evaluate((element) => element.style.overflow))
    .toBe('hidden');

  await sidebar.getByRole('link', { name: '快速开始', exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/fluctgraph\/quick-start(?:\.html|\/)?$/);
  await expect(sidebar).not.toHaveClass(/rp-doc-layout__sidebar--open/);
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(menuButton).not.toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const activeElement = document.activeElement;
        return !(activeElement instanceof HTMLElement && activeElement.closest('.rp-sidebar-menu'));
      }),
    )
    .toBe(true);
  await expect(page.locator('.rp-sidebar-menu__mask')).toHaveCount(0);
  await expect
    .poll(() => page.locator('body').evaluate((element) => element.style.overflow))
    .toBe('');
});

test('mobile hash navigation closes the outline but keeps the sidebar open', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile documentation controls only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/toho-image-studio/quick-start/');

  const menuButton = page.getByRole('button', { name: '菜单', exact: true });
  const outlineButton = page.getByRole('button', { name: '目录', exact: true });
  const sidebar = page.getByRole('complementary', {
    name: '文档导航',
    includeHidden: true,
  });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });
  const outlineHashLinks = outline.locator('a[href*="#"]');
  expect(await outlineHashLinks.count()).toBeGreaterThan(1);
  const sidebarHash = new URL(
    (await outlineHashLinks.last().getAttribute('href')) ?? '',
    page.url(),
  ).hash;

  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  await expect(outlineButton).toHaveAttribute('aria-expanded', 'true');
  await outlineHashLinks.first().click();
  await expect(page).toHaveURL((url) => url.hash.length > 1);
  await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
  await expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
  await expect(outlineButton).not.toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const activeElement = document.activeElement;
        return !(activeElement instanceof HTMLElement && activeElement.closest('.rp-sidebar-menu'));
      }),
    )
    .toBe(true);
  await expect(page.locator('.rp-sidebar-menu__mask')).toHaveCount(0);

  await menuButton.click();
  await expect(sidebar).toHaveClass(/rp-doc-layout__sidebar--open/);
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(() => page.locator('body').evaluate((element) => element.style.overflow))
    .toBe('hidden');

  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, sidebarHash);
  await expect(page).toHaveURL((url) => url.hash === sidebarHash);
  await expect(sidebar).toHaveClass(/rp-doc-layout__sidebar--open/);
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.rp-sidebar-menu__mask')).toHaveCount(1);
  await expect
    .poll(() => page.locator('body').evaluate((element) => element.style.overflow))
    .toBe('hidden');

  await menuButton.click();
});

test('mobile documentation panels close from the same trigger and restore content interaction', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile documentation controls only');

  await page.goto('/docs/fluctgraph/');

  const menuButton = page.getByRole('button', { name: '菜单', exact: true });
  const sidebar = page.getByRole('complementary', {
    name: '文档导航',
    includeHidden: true,
  });

  await menuButton.click();
  await expect(sidebar).toHaveClass(/rp-doc-layout__sidebar--open/);
  await expect(sidebar).toBeVisible();

  const [menuBox, firstSidebarItemBox] = await Promise.all([
    page.locator('.rp-doc-layout__menu').boundingBox(),
    sidebar.locator('.rp-sidebar-group').first().boundingBox(),
  ]);
  if (!menuBox || !firstSidebarItemBox) {
    throw new Error('Mobile document menu and first sidebar item must have layout boxes');
  }
  expect(firstSidebarItemBox.y).toBeGreaterThanOrEqual(menuBox.y + menuBox.height);

  await menuButton.click();
  await expect(sidebar).not.toHaveClass(/rp-doc-layout__sidebar--open/);
  await expect
    .poll(() =>
      sidebar.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return getComputedStyle(element).opacity === '0' && bounds.right <= 0;
      }),
    )
    .toBe(true);

  await page.getByRole('link', { name: /^下一页(?:\s|$)/ }).click();
  await expect(page).toHaveURL(/\/docs\/fluctgraph\/quick-start(?:\.html|\/)?$/);

  const outlineButton = page.getByRole('button', { name: '目录', exact: true });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });

  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  await expect(outline).toBeVisible();

  const [outlineMenuBox, firstOutlineItemBox] = await Promise.all([
    page.locator('.rp-doc-layout__menu').boundingBox(),
    outline.locator('.rp-toc-item').first().boundingBox(),
  ]);
  if (!outlineMenuBox || !firstOutlineItemBox) {
    throw new Error('Mobile document menu and first outline item must have layout boxes');
  }
  expect(firstOutlineItemBox.y).toBeGreaterThanOrEqual(outlineMenuBox.y + outlineMenuBox.height);

  await outlineButton.click();
  await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
  await expect(outline).toHaveCSS('visibility', 'hidden');

  await page.getByRole('link', { name: /^上一页(?:\s|$)/ }).click();
  await expect(page).toHaveURL(/\/docs\/fluctgraph\/(?:index\.html)?$/);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('mobile documentation panel triggers keep the sidebar and outline mutually exclusive', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile documentation controls only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/docs/fluctgraph/');

  const menuButton = page.getByRole('button', { name: '菜单', exact: true });
  const outlineButton = page.getByRole('button', { name: '目录', exact: true });
  const sidebar = page.getByRole('complementary', {
    name: '文档导航',
    includeHidden: true,
  });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });
  const visiblePanelCount = () =>
    page.evaluate(() => {
      return Array.from(
        document.querySelectorAll<HTMLElement>('.rp-doc-layout__sidebar, .rp-doc-layout__outline'),
      ).filter((element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          style.visibility !== 'hidden' &&
          Number.parseFloat(style.opacity) > 0 &&
          bounds.right > 0 &&
          bounds.bottom > 0 &&
          bounds.left < window.innerWidth &&
          bounds.top < window.innerHeight
        );
      }).length;
    });
  const bodyOverflow = () => page.locator('body').evaluate((element) => element.style.overflow);
  const horizontalOverflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const expectSidebarClosed = async () => {
    await expect(sidebar).not.toHaveClass(/rp-doc-layout__sidebar--open/);
    await expect
      .poll(() =>
        sidebar.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return getComputedStyle(element).opacity === '0' && bounds.right <= 0;
        }),
      )
      .toBe(true);
  };
  const expectOutlineClosed = async () => {
    await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
    await expect(outline).toHaveCSS('visibility', 'hidden');
  };

  await test.step('opening the outline closes an open sidebar', async () => {
    await menuButton.click();
    await expect(sidebar).toHaveClass(/rp-doc-layout__sidebar--open/);
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(bodyOverflow).toBe('hidden');

    await outlineButton.click();
    await expectSidebarClosed();
    await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(outlineButton).toHaveAttribute('aria-expanded', 'true');
    await expect(outlineButton).toBeFocused();
    await expect(menuButton).not.toBeFocused();
    await expect(outline).toBeVisible();
    await expect.poll(visiblePanelCount).toBe(1);
    await expect.poll(bodyOverflow).toBe('');
    await expect.poll(horizontalOverflow).toBeLessThanOrEqual(1);

    await outlineButton.click();
    await expectOutlineClosed();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(visiblePanelCount).toBe(0);
    await expect.poll(bodyOverflow).toBe('');

    await page.getByRole('link', { name: /^下一页(?:\s|$)/ }).click();
    await expect(page).toHaveURL(/\/docs\/fluctgraph\/quick-start(?:\.html|\/)?$/);
  });

  await test.step('opening the sidebar closes an open outline', async () => {
    await outlineButton.click();
    await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(outlineButton).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(bodyOverflow).toBe('');

    await menuButton.click();
    await expectOutlineClosed();
    await expect(sidebar).toHaveClass(/rp-doc-layout__sidebar--open/);
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
    await expect(menuButton).toBeFocused();
    await expect(outlineButton).not.toBeFocused();
    await expect(sidebar).toBeVisible();
    await expect.poll(visiblePanelCount).toBe(1);
    await expect.poll(bodyOverflow).toBe('hidden');
    await expect.poll(horizontalOverflow).toBeLessThanOrEqual(1);

    await menuButton.click();
    await expectSidebarClosed();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(outlineButton).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(visiblePanelCount).toBe(0);
    await expect.poll(bodyOverflow).toBe('');

    await page.getByRole('link', { name: /^上一页(?:\s|$)/ }).click();
    await expect(page).toHaveURL(/\/docs\/fluctgraph\/(?:index\.html)?$/);
  });
});

test('tablet documentation outline stays below its toggle and restores content interaction', async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), 'Custom tablet viewport only needs one browser project');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/docs/fluctgraph/');

  const outlineButton = page.getByRole('button', { name: '目录', exact: true });
  const outline = page.getByRole('complementary', {
    name: '页内目录',
    includeHidden: true,
  });
  const menu = page.locator('.rp-doc-layout__menu');

  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  await expect(outline).toBeVisible();

  const [menuLayer, outlineLayer, menuBox, firstOutlineItemBox] = await Promise.all([
    menu.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    outline.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    menu.boundingBox(),
    outline.locator('.rp-toc-item').first().boundingBox(),
  ]);
  expect(menuLayer).toBeGreaterThan(outlineLayer);
  if (!menuBox || !firstOutlineItemBox) {
    throw new Error('Tablet document menu and first outline item must have layout boxes');
  }
  expect(firstOutlineItemBox.y).toBeGreaterThanOrEqual(menuBox.y + menuBox.height);

  await outlineButton.click();
  await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
  await expect(outline).toHaveCSS('visibility', 'hidden');

  await page.getByRole('link', { name: /^下一页(?:\s|$)/ }).click();
  await expect(page).toHaveURL(/\/docs\/fluctgraph\/quick-start(?:\.html|\/)?$/);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('short mobile documentation panels track the sticky menu and keep internal content reachable', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Short mobile documentation panels only');
  await page.setViewportSize({ width: 390, height: 320 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/docs/toho-image-studio/quick-start/');
  await page.locator('html').evaluate((element) => {
    element.style.fontSize = '200%';
  });
  await page.evaluate(() => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.min(600, maxScroll));
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  const nav = page.locator('.rp-nav');
  const menu = page.locator('.rp-doc-layout__menu');
  await expect
    .poll(async () => {
      const [navBox, menuBox] = await Promise.all([nav.boundingBox(), menu.boundingBox()]);
      if (!navBox || !menuBox) {
        return Number.POSITIVE_INFINITY;
      }

      return Math.abs(menuBox.y - (navBox.y + navBox.height));
    })
    .toBeLessThanOrEqual(1);

  const sidebarButton = page.locator('.rp-sidebar-menu__left');
  const sidebar = page.locator('.rp-doc-layout__sidebar');
  await sidebarButton.click();
  await expect(sidebar).toHaveClass(/rp-doc-layout__sidebar--open/);
  await expectPanelAlignedWithinViewport(page, sidebar);
  await expectPanelTopVariableMatchesMenu(page);

  const sidebarScrollRange = await sidebar.evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  expect(sidebarScrollRange).toBeGreaterThan(0);
  await sidebar.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expectItemInsidePanel(
    sidebar,
    sidebar.getByRole('link', { name: '更新记录', exact: true }),
  );

  await sidebarButton.click();
  await expect(sidebar).not.toHaveClass(/rp-doc-layout__sidebar--open/);

  const outlineButton = page.locator('.rp-sidebar-menu__right');
  const outline = page.locator('.rp-doc-layout__outline');
  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
  await expectPanelAlignedWithinViewport(page, outline);
  await expectPanelTopVariableMatchesMenu(page);

  const outlineToc = outline.locator('.rp-outline__toc');
  const outlineScrollRange = await outlineToc.evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  expect(outlineScrollRange).toBeGreaterThan(0);
  await outlineToc.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => outlineToc.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expectItemInsidePanel(outlineToc, outline.locator('.rp-toc-item').last());
  await expectItemInsidePanel(outline, outline.locator('.rp-scroll-to-top'));

  await outlineButton.click();
  await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
  await expect(outline).toHaveCSS('visibility', 'hidden');

  await page.getByRole('link', { name: /^下一页(?:\s|$)/ }).click();
  await expect(page).toHaveURL(/\/docs\/toho-image-studio\/(?:index\.html)?$/);
});

test('documentation panels follow live menu reflow without leaking into desktop layout', async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), 'Custom responsive contexts only need one browser project');

  for (const scenario of [
    { width: 390, change: 'font' },
    { width: 1024, change: 'project-name' },
  ] as const) {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await page.goto('/docs/fluctgraph/');
    await expectPanelTopVariableMatchesMenu(page);

    const container = page.locator('.rp-doc-layout__container');
    const initialPanelTop = await container.evaluate(
      (element, property) => Number.parseFloat(element.style.getPropertyValue(property)),
      docPanelTopProperty,
    );

    if (scenario.change === 'font') {
      await page.locator('html').evaluate((element) => {
        element.style.fontSize = '200%';
      });
    } else {
      await page
        .getByRole('navigation', { name: '切换项目文档' })
        .locator('[aria-current="page"]')
        .evaluate((element) => {
          element.style.width = '160px';
          element.style.whiteSpace = 'normal';
          element.textContent = 'FluctGraph knowledge graph workspace '.repeat(12);
        });
    }

    await expectPanelTopVariableMatchesMenu(page);
    const updatedPanelTop = await container.evaluate(
      (element, property) => Number.parseFloat(element.style.getPropertyValue(property)),
      docPanelTopProperty,
    );
    if (scenario.change === 'project-name') {
      expect(Math.abs(updatedPanelTop - initialPanelTop)).toBeGreaterThan(5);
    }

    const outlineButton = page.locator('.rp-sidebar-menu__right');
    const outline = page.locator('.rp-doc-layout__outline');
    await outlineButton.click();
    await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);
    await expectPanelAlignedWithinViewport(page, outline);
    await outlineButton.click();
    await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
  }

  await page.setViewportSize({ width: 1280, height: 844 });
  const container = page.locator('.rp-doc-layout__container');
  await expect
    .poll(() =>
      container.evaluate(
        (element, property) => element.style.getPropertyValue(property),
        docPanelTopProperty,
      ),
    )
    .toBe('');
  await expect(page.locator('.rp-sidebar-menu')).toHaveCSS('display', 'none');
  await expect(page.locator('.rp-doc-layout__outline')).toHaveCSS('position', 'sticky');
});

test('client navigation rebinds document panel measurement when the project switcher returns', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile client navigation only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/docs/fluctgraph/');
  await expectPanelTopVariableMatchesMenu(page);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  const navigateFromMobileMenu = async (name: '关于' | '文档') => {
    await page.getByRole('button', { name: 'mobile hamburger' }).click();
    await page.locator('.rp-nav-screen').getByRole('link', { name, exact: true }).click();
  };

  await navigateFromMobileMenu('关于');
  await expect(page).toHaveURL(/\/about\/(?:index\.html)?$/);
  await expect(page.getByRole('heading', { level: 1, name: '关于 THQLLM' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '切换项目文档' })).toHaveCount(0);
  await expectPanelTopVariableMatchesMenu(page);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await navigateFromMobileMenu('文档');
  await expect(page).toHaveURL(/\/docs\/fluctgraph\/(?:index\.html)?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'FluctGraph' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '切换项目文档' })).toBeVisible();
  await expectPanelTopVariableMatchesMenu(page);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  const menu = page.locator('.rp-doc-layout__menu');
  const sidebarButton = page.locator('.rp-sidebar-menu__left');
  const sidebar = page.locator('.rp-doc-layout__sidebar');
  await sidebarButton.click();
  await expect(sidebar).toHaveClass(/rp-doc-layout__sidebar--open/);

  const [sidebarMenuBox, firstSidebarItemBox] = await Promise.all([
    menu.boundingBox(),
    sidebar.locator('.rp-sidebar-group').first().boundingBox(),
  ]);
  if (!sidebarMenuBox || !firstSidebarItemBox) {
    throw new Error('Client-returned document menu and first sidebar item need layout boxes');
  }
  expect(firstSidebarItemBox.y).toBeGreaterThanOrEqual(sidebarMenuBox.y + sidebarMenuBox.height);

  await sidebarButton.click();
  await expect(sidebar).not.toHaveClass(/rp-doc-layout__sidebar--open/);

  const outlineButton = page.locator('.rp-sidebar-menu__right');
  const outline = page.locator('.rp-doc-layout__outline');
  await outlineButton.click();
  await expect(outline).toHaveClass(/rp-doc-layout__outline--open/);

  const [outlineMenuBox, firstOutlineItemBox] = await Promise.all([
    menu.boundingBox(),
    outline.locator('.rp-toc-item').first().boundingBox(),
  ]);
  if (!outlineMenuBox || !firstOutlineItemBox) {
    throw new Error('Client-returned document menu and first outline item need layout boxes');
  }
  expect(firstOutlineItemBox.y).toBeGreaterThanOrEqual(outlineMenuBox.y + outlineMenuBox.height);

  await outlineButton.click();
  await expect(outline).not.toHaveClass(/rp-doc-layout__outline--open/);
  await expect(outline).toHaveCSS('visibility', 'hidden');
});

test('THQ API documentation has no detectable accessibility violations', async ({ page }) => {
  await page.goto('/docs/thq-api/');
  await expect(page.getByRole('heading', { level: 1, name: /THQ API/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test('client navigation from home preserves documentation accessibility', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('link', { name: /使用文档/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: /FluctGraph/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test('static documentation keeps landmarks and hidden anchors accessible', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    javaScriptEnabled: false,
  });

  try {
    const page = await context.newPage();
    await page.goto('/docs/thq-api/');

    await expect(page.locator('.rp-doc-layout__sidebar')).toHaveAttribute('aria-label', '文档导航');
    await expect(page.locator('.rp-doc-layout__outline')).toHaveAttribute('aria-label', '页内目录');

    const hiddenAnchors = page.locator('.rp-header-anchor[aria-hidden="true"]');
    expect(await hiddenAnchors.count()).toBeGreaterThan(0);
    for (const anchor of await hiddenAnchors.all()) {
      await expect(anchor).toHaveAttribute('tabindex', '-1');
    }
  } finally {
    await context.close();
  }
});

test('project switcher loads the selected documentation root', async ({ page }) => {
  await page.goto('/docs/fluctgraph/');

  const switcher = page.getByRole('navigation', { name: '切换项目文档' });
  await switcher.getByRole('link', { name: 'THQ API 文档' }).click();

  await expect(page).toHaveURL(/\/docs\/thq-api\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /THQ API/i })).toBeVisible();
  const currentTab = page
    .getByRole('navigation', { name: '切换项目文档' })
    .locator('[aria-current="page"]');
  await expect(currentTab).toHaveText('THQ API');
  await expect(currentTab).not.toHaveAttribute('href');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('project switcher keeps the active tab visible after client navigation and resize', async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), 'Custom 320px viewport only needs one browser project');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const trackedWindow = window as Window & { projectTabScrollIntoViewCalls?: number };
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    trackedWindow.projectTabScrollIntoViewCalls = 0;
    HTMLElement.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
      if (this.closest('nav[aria-label="切换项目文档"]')) {
        trackedWindow.projectTabScrollIntoViewCalls =
          (trackedWindow.projectTabScrollIntoViewCalls ?? 0) + 1;
      }

      originalScrollIntoView.call(this, options);
    };
  });
  await page.goto('/docs/fluctgraph/quick-start/');

  const target = page.getByRole('link', { name: 'Toho Image Studio 文档' });
  await page.evaluate(() => {
    const marker = document.createComment('project-switcher-client-route');
    (
      window as Window & {
        projectSwitcherDocumentMarker?: Node;
      }
    ).projectSwitcherDocumentMarker = marker;
    (
      document as Document & {
        projectSwitcherDocumentMarker?: Node;
      }
    ).projectSwitcherDocumentMarker = marker;
  });

  await target.click();
  await expect(page).toHaveURL(/\/docs\/toho-image-studio\/$/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const windowMarker = (
          window as Window & {
            projectSwitcherDocumentMarker?: Node;
          }
        ).projectSwitcherDocumentMarker;
        const documentMarker = (
          document as Document & {
            projectSwitcherDocumentMarker?: Node;
          }
        ).projectSwitcherDocumentMarker;

        return Boolean(
          windowMarker &&
            windowMarker === documentMarker &&
            windowMarker.ownerDocument === document,
        );
      }),
    )
    .toBe(true);

  await page.setViewportSize({ width: 320, height: 360 });

  const switcher = page.getByRole('navigation', { name: '切换项目文档' });
  const activeTab = switcher.locator('[aria-current="page"]');
  const tabs = activeTab.locator('..');
  await expect(activeTab).toHaveText('Toho Image Studio');
  await expect
    .poll(() =>
      tabs.evaluate((element) => {
        const containerRect = element.getBoundingClientRect();
        const activeRect = element.querySelector('[aria-current="page"]')?.getBoundingClientRect();

        return Boolean(
          activeRect &&
            activeRect.left >= containerRect.left - 1 &&
            activeRect.right <= containerRect.right + 1,
        );
      }),
    )
    .toBe(true);
  await expect.poll(() => tabs.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  const scrollLeftBeforeReflow = await tabs.evaluate((element) => element.scrollLeft);
  const fluctGraphTab = switcher.getByRole('link', { name: 'FluctGraph 文档' });
  await fluctGraphTab.evaluate((element) => {
    element.style.minWidth = `${element.getBoundingClientRect().width + 160}px`;
  });

  await expect
    .poll(() =>
      tabs.evaluate((element) => {
        const containerRect = element.getBoundingClientRect();
        const activeRect = element.querySelector('[aria-current="page"]')?.getBoundingClientRect();

        return Boolean(
          activeRect &&
            activeRect.left >= containerRect.left - 1 &&
            activeRect.right <= containerRect.right + 1,
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() => tabs.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(scrollLeftBeforeReflow);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              projectTabScrollIntoViewCalls?: number;
            }
          ).projectTabScrollIntoViewCalls ?? 0,
      ),
    )
    .toBe(0);
});

test('FluctGraph documentation desktop visual regression', async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), 'Desktop snapshot only');
  test.skip(process.platform !== 'darwin', 'Visual snapshots are reviewed on macOS only');

  await openDeterministicDocs(page, '/docs/fluctgraph/');
  await expect(page.locator('.rp-last-updated')).toBeVisible();

  await expect(page).toHaveScreenshot('docs-desktop.png', {
    animations: 'disabled',
    fullPage: true,
  });
});

test('FluctGraph documentation mobile visual regression', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile snapshot only');
  test.skip(process.platform !== 'darwin', 'Visual snapshots are reviewed on macOS only');

  await openDeterministicDocs(page, '/docs/fluctgraph/');
  await expect(page.getByText(/^最后更新于:/)).toBeVisible();

  await expect(page).toHaveScreenshot('docs-mobile.png', {
    animations: 'disabled',
    fullPage: true,
  });
});
