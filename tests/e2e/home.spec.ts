import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

async function openDeterministicHome(page: Page) {
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

test('home presents the THQLLM portal without forbidden copy', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'THQLLM' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('智能结界');
  await expect(page.locator('body')).not.toContainText('结界');
});

test('home exposes exactly three project stages and the FluctGraph destination', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByTestId('project-stage')).toHaveCount(3);
  await expect(page.getByRole('link', { name: '进入 FluctGraph' })).toHaveAttribute(
    'href',
    'https://graph.tohoqing.com/',
  );
});

test('the first 使用文档 link opens the FluctGraph documentation root', async ({ page }) => {
  await page.goto('/');

  await page
    .getByRole('link', { name: /使用文档/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/docs\/fluctgraph\/$/);
});

test('keyboard navigation reaches the project selection item in the home menu', async ({
  page,
}) => {
  await page.goto('/');

  const projectSelection = page
    .getByRole('navigation', { name: '首页主菜单' })
    .getByRole('link', { name: /项目选择/ });
  await expect(projectSelection).toBeVisible();

  let reachedProjectSelection = false;
  for (let tabCount = 0; tabCount < 20; tabCount += 1) {
    await page.keyboard.press('Tab');
    if (await projectSelection.evaluate((element) => element === document.activeElement)) {
      reachedProjectSelection = true;
      break;
    }
  }

  expect(reachedProjectSelection).toBe(true);
});

test('home has no detectable accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'THQLLM' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test('home desktop visual regression', async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), 'Desktop snapshot only');

  await openDeterministicHome(page);

  await expect(page).toHaveScreenshot('home-desktop.png', {
    animations: 'disabled',
    fullPage: true,
  });
});
