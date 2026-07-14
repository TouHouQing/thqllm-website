import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { createDanmakuFrame, DANMAKU_BULLET_PROTECTION_RADIUS } from '../../src/lib/danmaku';

const baseUrl = 'http://127.0.0.1:4173';
const responsiveViewports = [
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
] as const;
const mobileDanmakuViewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 480, height: 800 },
  { width: 640, height: 844 },
  { width: 640, height: 480 },
  { width: 640, height: 360 },
] as const;
const MOBILE_DANMAKU_BULLET_COUNT = 16;
const MOBILE_DANMAKU_ORBIT_SAMPLES = 1440;
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

interface DanmakuFramePosition {
  x: number;
  y: number;
}

interface RelativeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface DanmakuLayoutMetrics {
  canvas: {
    width: number;
    height: number;
  };
  exclusionRects: RelativeRect[];
  menuBottom: number;
  scrollHintTop: number;
  overflow: number;
}

function createMobileLayout(layout: DanmakuLayoutMetrics) {
  return {
    preset: 'mobile',
    exclusionBand: {
      menuBottom: layout.menuBottom,
      scrollHintTop: layout.scrollHintTop,
    },
  } as const;
}

function overlapsProtectedRect(bullet: DanmakuFramePosition, rect: RelativeRect): boolean {
  return (
    bullet.x + DANMAKU_BULLET_PROTECTION_RADIUS > rect.left &&
    bullet.x - DANMAKU_BULLET_PROTECTION_RADIUS < rect.right &&
    bullet.y + DANMAKU_BULLET_PROTECTION_RADIUS > rect.top &&
    bullet.y - DANMAKU_BULLET_PROTECTION_RADIUS < rect.bottom
  );
}

async function readDanmakuLayout(page: Page): Promise<DanmakuLayoutMetrics> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-danmaku-root]');
    const canvasElement = root?.querySelector('[data-testid="danmaku-canvas"]');
    const menuElements = root?.querySelectorAll('[data-danmaku-exclusion="menu"]');
    const scrollHint = root?.querySelector('[data-danmaku-exclusion="scroll-hint"]');

    if (
      !(root instanceof HTMLElement) ||
      !(canvasElement instanceof HTMLCanvasElement) ||
      !menuElements ||
      !(scrollHint instanceof HTMLElement)
    ) {
      throw new Error('Missing home danmaku root, canvas, or exclusions');
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const toRelativeRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - canvasRect.left,
        top: rect.top - canvasRect.top,
        right: rect.right - canvasRect.left,
        bottom: rect.bottom - canvasRect.top,
      };
    };
    const menuRects = Array.from(menuElements, toRelativeRect);
    const scrollHintRect = toRelativeRect(scrollHint);

    return {
      canvas: {
        width: canvasRect.width,
        height: canvasRect.height,
      },
      exclusionRects: [...menuRects, scrollHintRect],
      menuBottom: Math.max(...menuRects.map((rect) => rect.bottom)),
      scrollHintTop: scrollHintRect.top,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

function inspectCompleteMobileOrbit(layout: DanmakuLayoutMetrics) {
  let overlapCount = 0;
  let clippedCount = 0;
  let firstOverlap: { step: number; bulletIndex: number } | undefined;
  let firstClipped: { step: number; bulletIndex: number } | undefined;

  for (let step = 0; step < MOBILE_DANMAKU_ORBIT_SAMPLES; step += 1) {
    const angle = (Math.PI * 2 * step) / MOBILE_DANMAKU_ORBIT_SAMPLES;
    const frame = createDanmakuFrame(
      layout.canvas.width,
      layout.canvas.height,
      angle,
      MOBILE_DANMAKU_BULLET_COUNT,
      createMobileLayout(layout),
    );

    for (const [bulletIndex, bullet] of frame.entries()) {
      if (layout.exclusionRects.some((rect) => overlapsProtectedRect(bullet, rect))) {
        overlapCount += 1;
        firstOverlap ??= { step, bulletIndex };
      }

      if (
        bullet.x - DANMAKU_BULLET_PROTECTION_RADIUS < 0 ||
        bullet.x + DANMAKU_BULLET_PROTECTION_RADIUS > layout.canvas.width ||
        bullet.y - DANMAKU_BULLET_PROTECTION_RADIUS < 0 ||
        bullet.y + DANMAKU_BULLET_PROTECTION_RADIUS > layout.canvas.height
      ) {
        clippedCount += 1;
        firstClipped ??= { step, bulletIndex };
      }
    }
  }

  return {
    overlapCount,
    clippedCount,
    firstOverlap,
    firstClipped,
  };
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

  const canvas = page.getByTestId('danmaku-canvas');
  await expect(canvas).toHaveAttribute('data-motion', 'reduced');
  await expect(canvas).toHaveAttribute('data-danmaku-frame', /^\[/);
});

for (const viewport of mobileDanmakuViewports) {
  test(`home mobile danmaku complete orbit avoids actual controls at ${viewport.width}x${viewport.height}`, async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Mobile geometry only needs the mobile browser project');

    await page.setViewportSize(viewport);
    await openDeterministicMobileHome(page);

    const canvas = page.getByTestId('danmaku-canvas');
    const frameJson = await canvas.getAttribute('data-danmaku-frame');
    expect(frameJson).not.toBeNull();
    const frame = JSON.parse(frameJson ?? '[]') as DanmakuFramePosition[];
    const layout = await readDanmakuLayout(page);
    const expectedReducedFrame = createDanmakuFrame(
      layout.canvas.width,
      layout.canvas.height,
      0,
      MOBILE_DANMAKU_BULLET_COUNT,
      createMobileLayout(layout),
    );
    const orbit = inspectCompleteMobileOrbit(layout);

    expect(frame).toEqual(expectedReducedFrame);
    if (viewport.width === 390 && viewport.height === 844) {
      expect(frame.length).toBeGreaterThanOrEqual(12);
    } else {
      expect([0, MOBILE_DANMAKU_BULLET_COUNT]).toContain(frame.length);
    }
    expect(layout.exclusionRects).toHaveLength(5);
    expect(
      {
        overlapCount: orbit.overlapCount,
        clippedCount: orbit.clippedCount,
        overflow: layout.overflow,
      },
      `first overlap ${JSON.stringify(orbit.firstOverlap)}, first clipped ${JSON.stringify(orbit.firstClipped)}`,
    ).toEqual({
      overlapCount: 0,
      clippedCount: 0,
      overflow: 0,
    });
  });
}

test('home mobile danmaku adapts to enlarged menu text and controls', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile geometry only needs the mobile browser project');

  await page.setViewportSize({ width: 390, height: 844 });
  await openDeterministicMobileHome(page);
  await page.addStyleTag({
    content: `
      [data-danmaku-exclusion="menu"] {
        min-height: 52px !important;
      }

      [data-danmaku-exclusion="menu"] > * {
        font-size: 20px !important;
      }
    `,
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  const layout = await readDanmakuLayout(page);
  const expectedReducedFrame = createDanmakuFrame(
    layout.canvas.width,
    layout.canvas.height,
    0,
    MOBILE_DANMAKU_BULLET_COUNT,
    createMobileLayout(layout),
  );
  const orbit = inspectCompleteMobileOrbit(layout);

  await expect
    .poll(async () => {
      const frameJson = await page.getByTestId('danmaku-canvas').getAttribute('data-danmaku-frame');
      return JSON.parse(frameJson ?? '[]') as DanmakuFramePosition[];
    })
    .toEqual(expectedReducedFrame);
  expect(
    {
      overlapCount: orbit.overlapCount,
      clippedCount: orbit.clippedCount,
      overflow: layout.overflow,
    },
    `first overlap ${JSON.stringify(orbit.firstOverlap)}, first clipped ${JSON.stringify(orbit.firstClipped)}`,
  ).toEqual({
    overlapCount: 0,
    clippedCount: 0,
    overflow: 0,
  });
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
  await searchInput.click();
  await expect(searchInput).toBeFocused();
  expect(pageErrors).toEqual([]);

  await page.keyboard.press('Escape');

  await expect(searchInput).not.toBeVisible();
  await expect(searchButton).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test('custom 404 keeps the title on a single line on narrow screens without overflow', async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto('/route-that-does-not-exist/');

    const title = page.getByRole('heading', { level: 1, name: 'CONTINUE?' });
    await expect(title).toBeVisible();

    const metrics = await title.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = Array.from(range.getClientRects());
      const titleRect = element.getBoundingClientRect();

      return {
        lineCount: rects.length,
        left: titleRect.left,
        right: titleRect.right,
        top: titleRect.top,
        bottom: titleRect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });

    expect(metrics.lineCount).toBe(1);
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
    expect(metrics.overflow).toBeLessThanOrEqual(1);
  }
});

test('home mobile visual regression', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile snapshot only');
  test.skip(process.platform !== 'darwin', 'Visual snapshots are reviewed on macOS only');

  await openDeterministicMobileHome(page);

  await expect(page).toHaveScreenshot('home-mobile.png', {
    animations: 'disabled',
    fullPage: true,
  });
});
