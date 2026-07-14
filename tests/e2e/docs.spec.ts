import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const documentationRoots = [
  { path: '/docs/fluctgraph/', projectName: 'FluctGraph' },
  { path: '/docs/thq-api/', projectName: 'THQ API' },
  { path: '/docs/toho-image-studio/', projectName: 'Toho Image Studio' },
] as const;

async function openDeterministicDocs(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
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

test('FluctGraph documentation uses the Chinese Rspress shell', async ({ page, isMobile }) => {
  await page.goto('/docs/fluctgraph/');

  await expect(page.getByText(/^最后更新于:/)).toBeVisible();
  await expect(page.getByRole('link', { name: /^下一页(?:\s|$)/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');

  if (isMobile) {
    await expect(page.getByRole('button', { name: '菜单', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '目录', exact: true })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+k');
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
