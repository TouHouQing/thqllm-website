import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { projects } from '../../src/data/projects';

const featuredProjects = projects.filter((project) => project.featured);
const firstDocumentedProject = projects
  .filter((project) => project.docs)
  .toSorted((left, right) => left.order - right.order)[0];

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

test('home exposes every featured project with its registry destination', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('project-stage')).toHaveCount(featuredProjects.length);

  for (const project of featuredProjects) {
    const external = page.getByRole('link', {
      exact: true,
      name: `进入 ${project.name}`,
    });
    await expect(external).toHaveAttribute('href', project.externalUrl);
    await expect(external).toHaveAttribute('target', '_blank');
    await expect(external).toHaveAttribute('rel', 'noreferrer noopener');
  }
});

test('the first documented registry project opens its documentation root', async ({ page }) => {
  if (!firstDocumentedProject?.docs) {
    throw new Error('Expected the project registry to include a documented project');
  }

  await page.goto('/');

  const manual = page.getByRole('region', { name: '使用文档' });
  await manual.getByRole('link', { exact: true, name: firstDocumentedProject.name }).click();
  await expect(page).toHaveURL(new RegExp(`${firstDocumentedProject.docs.basePath}$`));
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
  test.skip(process.platform !== 'darwin', 'Visual snapshots are reviewed on macOS only');

  await openDeterministicHome(page);

  await expect(page).toHaveScreenshot('home-desktop.png', {
    animations: 'disabled',
    fullPage: true,
  });
});
