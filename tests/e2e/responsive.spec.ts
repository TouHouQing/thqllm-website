import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const baseUrl = 'http://127.0.0.1:4173';
const responsiveViewports = [
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
] as const;
const responsivePaths = ['/', '/projects/', '/docs/fluctgraph/'] as const;
const topLevelRoutes = [
  { path: '/projects/', heading: '项目' },
  { path: '/notes/', heading: '开发札记' },
  { path: '/about/', heading: '关于 THQLLM' },
  { path: '/route-that-does-not-exist/', heading: 'CONTINUE?' },
] as const;

async function openDeterministicMobileHome(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, async (image) => {
        if (!image.complete) {
          await new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          });
        }

        await image.decode().catch(() => undefined);
      }),
    );
  });
}

for (const viewport of responsiveViewports) {
  for (const path of responsivePaths) {
    test(`${path} has no horizontal overflow at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(path);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );

      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
}

for (const route of topLevelRoutes) {
  test(`${route.path} has no detectable accessibility violations`, async ({ page }) => {
    await page.goto(route.path);
    await expect(
      page.getByRole('heading', { level: 1, name: route.heading, exact: true }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('home canvas honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.getByTestId('danmaku-canvas')).toHaveAttribute('data-motion', 'reduced');
});

test('home remains navigable when hero images fail', async ({ page }) => {
  await page.route('**/assets/hero/*.webp', (route) => route.abort());
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'THQLLM' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: '首页主菜单' }).getByRole('link', { name: /项目选择/ }),
  ).toBeVisible();
});

test('home remains useful without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: baseUrl,
    javaScriptEnabled: false,
    viewport: { width: 1024, height: 768 },
  });

  try {
    const page = await context.newPage();
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'THQLLM' })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: '首页主菜单' }).getByRole('link', { name: /项目选择/ }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: '进入 FluctGraph' })).toBeVisible();

    await page
      .getByRole('link', { name: /使用文档/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/docs\/fluctgraph\/$/);
    await expect(page.getByRole('heading', { level: 1, name: /FluctGraph/i })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('mobile pages keep core navigation available without JavaScript', async ({
  browser,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), 'Custom mobile context only needs one browser project');

  const context = await browser.newContext({
    baseURL: baseUrl,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });

  try {
    const page = await context.newPage();
    await page.goto('/docs/fluctgraph/');

    const initialOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(initialOverflow).toBeLessThanOrEqual(1);

    const fallbackNavigation = page.getByRole('navigation', {
      name: '无 JavaScript 导航',
    });
    await expect(fallbackNavigation).toBeVisible();
    await fallbackNavigation.getByRole('link', { name: 'THQ API 文档' }).click();
    await expect(page).toHaveURL(/\/docs\/thq-api\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'THQ API' })).toBeVisible();

    await page.goto('/about/');
    await fallbackNavigation.getByRole('link', { name: '项目', exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/$/);
    await expect(page.getByRole('heading', { level: 1, name: '项目', exact: true })).toBeVisible();

    const finalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(finalOverflow).toBeLessThanOrEqual(1);
  } finally {
    await context.close();
  }
});

test('custom 404 offers working recovery actions', async ({ page }) => {
  await page.goto('/route-that-does-not-exist/');

  await expect(page.getByRole('heading', { level: 1, name: 'CONTINUE?' })).toBeVisible();
  const recoveryNavigation = page.getByRole('navigation', { name: '错误页恢复操作' });
  await expect(recoveryNavigation).toBeVisible();

  await expect(recoveryNavigation.getByRole('link', { name: '返回首页' })).toHaveAttribute(
    'href',
    '/',
  );
  await expect(recoveryNavigation.getByRole('link', { name: '查看项目' })).toHaveAttribute(
    'href',
    '/projects/',
  );
  const searchRegion = recoveryNavigation.getByRole('search', { name: '错误页站点搜索' });
  const searchForm = searchRegion.locator('form');
  await expect(searchForm).toHaveAttribute('action', '/docs/fluctgraph/');
  await expect(searchForm).toHaveAttribute('method', 'get');
  await expect(searchRegion.getByRole('button', { name: '搜索文档' })).toHaveAttribute(
    'type',
    'submit',
  );

  await recoveryNavigation.getByRole('link', { name: '查看项目' }).click();
  await expect(page).toHaveURL(/\/projects\/$/);
});

test('custom 404 opens the site search panel from the recovery button', async ({ page }) => {
  await page.goto('/route-that-does-not-exist/');

  const searchButton = page
    .getByRole('navigation', { name: '错误页恢复操作' })
    .getByRole('button', { name: '搜索文档' });
  await expect(searchButton).toBeVisible();

  await searchButton.click();

  await expect(page.getByLabel('SearchPanelInput')).toBeVisible();
});

test('static 404 keeps search recovery working without JavaScript', async ({
  browser,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), 'Custom no-JS context only needs one browser project');

  const context = await browser.newContext({
    baseURL: baseUrl,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });

  try {
    const page = await context.newPage();
    await page.goto('/404.html');

    const searchButton = page.getByRole('button', { name: '搜索文档' });
    await expect(searchButton).toBeVisible();

    await searchButton.click();

    await expect(page).toHaveURL((url) => url.pathname === '/docs/fluctgraph/');
    await expect(page.getByRole('heading', { level: 1, name: /FluctGraph/i })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('custom 404 Enter key opens search without page errors and Escape restores focus', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error);
  });

  await page.goto('/route-that-does-not-exist/');

  const searchButton = page
    .getByRole('navigation', { name: '错误页恢复操作' })
    .getByRole('button', { name: '搜索文档' });

  await searchButton.focus();
  await expect(searchButton).toBeFocused();

  await page.keyboard.press('Enter');

  const searchInput = page.getByLabel('SearchPanelInput');
  await expect(searchInput).toBeVisible();
  expect(pageErrors).toEqual([]);

  await page.keyboard.press('Escape');

  await expect(searchInput).not.toBeVisible();
  await expect(searchButton).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test('home mobile visual regression', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile snapshot only');

  await openDeterministicMobileHome(page);

  await expect(page).toHaveScreenshot('home-mobile.png', {
    animations: 'disabled',
    fullPage: true,
  });
});
