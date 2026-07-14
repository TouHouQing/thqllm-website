import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

const documentationRoots = [
  { path: '/docs/fluctgraph/', projectName: 'FluctGraph' },
  { path: '/docs/thq-api/', projectName: 'THQ API' },
  { path: '/docs/toho-image-studio/', projectName: 'Toho Image Studio' },
] as const;
const docPanelTopProperty = '--thq-doc-panel-top';

async function openDeterministicDocs(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
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

for (const documentationRoot of documentationRoots) {
  test(`${documentationRoot.projectName} documentation has its own root and project switcher`, async ({
    page,
  }) => {
    await page.goto(documentationRoot.path);

    await expect(
      page.getByRole('heading', { level: 1, name: new RegExp(documentationRoot.projectName, 'i') }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: '切换项目文档' })).toBeVisible();
  });
}

test('FluctGraph full-text search finds the Toho Image Studio overview', async ({ page }) => {
  await page.goto('/docs/fluctgraph/');

  await page.keyboard.press('ControlOrMeta+k');
  const searchInput = page.getByLabel('SearchPanelInput');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('Toho Image Studio');

  await expect(page.getByText(/Toho Image Studio 概览/).first()).toBeVisible();
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
        .locator('strong')
        .evaluate((element) => {
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

test('project switcher loads the selected documentation root', async ({ page, isMobile }) => {
  await page.goto('/docs/fluctgraph/');

  const mobileSwitcher = page.getByRole('combobox', { name: '切换当前项目文档' });
  if (isMobile) {
    await mobileSwitcher.selectOption('thq-api');
  } else {
    await page.getByRole('link', { name: 'THQ API 文档' }).click();
  }

  await expect(page).toHaveURL(/\/docs\/thq-api\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /THQ API/i })).toBeVisible();
  if (isMobile) {
    await expect(mobileSwitcher).toHaveValue('thq-api');
  } else {
    await expect(
      page.getByRole('navigation', { name: '切换项目文档' }).locator('strong'),
    ).toHaveText('THQ API');
  }

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
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
