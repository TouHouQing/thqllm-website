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

test('THQ API documentation has no detectable accessibility violations', async ({ page }) => {
  await page.goto('/docs/thq-api/');
  await expect(page.getByRole('heading', { level: 1, name: /THQ API/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test('FluctGraph documentation desktop visual regression', async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), 'Desktop snapshot only');

  await openDeterministicDocs(page, '/docs/fluctgraph/');

  await expect(page).toHaveScreenshot('docs-desktop.png', {
    animations: 'disabled',
    fullPage: true,
  });
});
