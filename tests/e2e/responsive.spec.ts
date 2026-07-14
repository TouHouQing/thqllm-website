import { expect, type Page, test } from '@playwright/test';

const baseUrl = 'http://127.0.0.1:4173';
const responsiveViewports = [
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
] as const;
const responsivePaths = ['/', '/projects/', '/docs/fluctgraph/'] as const;

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
  await expect(recoveryNavigation.getByRole('link', { name: '搜索文档' })).toHaveAttribute(
    'href',
    '/docs/fluctgraph/',
  );

  await recoveryNavigation.getByRole('link', { name: '查看项目' }).click();
  await expect(page).toHaveURL(/\/projects\/$/);
});

test('home mobile visual regression', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile snapshot only');

  await openDeterministicMobileHome(page);

  await expect(page).toHaveScreenshot('home-mobile.png', {
    animations: 'disabled',
    fullPage: true,
  });
});
