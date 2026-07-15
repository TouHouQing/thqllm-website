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
const enlargedTextViewports = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 320, height: 568 },
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

async function enlargeDocumentText(page: Page, selector: string, normalFontSize: number) {
  await page.locator('html').evaluate((element) => {
    element.style.fontSize = '200%';
  });
  await page.waitForFunction(
    ({ targetSelector, expectedMinimum }) => {
      const target = document.querySelector(targetSelector);
      return (
        target instanceof HTMLElement &&
        Number.parseFloat(getComputedStyle(target).fontSize) >= expectedMinimum
      );
    },
    {
      targetSelector: selector,
      expectedMinimum: normalFontSize * 1.9,
    },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

interface TextStyleMetrics {
  fontSize: number;
  letterSpacing: number;
  transform: string;
}

function expectTextApproximatelyDoubles(
  normal: TextStyleMetrics,
  enlarged: TextStyleMetrics,
  evidence: string,
) {
  const ratio = enlarged.fontSize / normal.fontSize;

  expect.soft(ratio, evidence).toBeGreaterThanOrEqual(1.9);
  expect.soft(ratio, evidence).toBeLessThanOrEqual(2.1);
  expect.soft(normal.letterSpacing, evidence).toBe(0);
  expect.soft(enlarged.letterSpacing, evidence).toBe(0);
  expect.soft(normal.transform, evidence).toBe('none');
  expect.soft(enlarged.transform, evidence).toBe('none');
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

test('home preserves enlarged text geometry and navigation at narrow mobile sizes', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile text-resize geometry only');

  for (const viewport of enlargedTextViewports) {
    await page.setViewportSize(viewport);
    await openDeterministicMobileHome(page);
    const normalMetrics = await page.evaluate(() => {
      const title = document.getElementById('thq-home-title');
      const menuText = document.querySelector('nav[aria-label="首页主菜单"] a:last-child strong');
      const coreCopy = title?.parentElement?.querySelector('p');
      const scrollHint = document.querySelector('[data-danmaku-exclusion="scroll-hint"]');

      if (
        !(title instanceof HTMLHeadingElement) ||
        !(menuText instanceof HTMLElement) ||
        !(coreCopy instanceof HTMLParagraphElement) ||
        !(scrollHint instanceof HTMLAnchorElement)
      ) {
        throw new Error('Missing normal home text-resize target');
      }

      const textStyle = (element: Element) => {
        const style = getComputedStyle(element);
        const letterSpacing = style.letterSpacing;
        return {
          fontSize: Number.parseFloat(style.fontSize),
          letterSpacing: letterSpacing === 'normal' ? 0 : Number.parseFloat(letterSpacing),
          transform: style.transform,
        };
      };
      const range = document.createRange();
      range.selectNodeContents(title);

      return {
        title: textStyle(title),
        menu: textStyle(menuText),
        coreCopy: textStyle(coreCopy),
        scrollHint: textStyle(scrollHint),
        titleLineCount: Array.from(range.getClientRects()).filter(
          (rect) => rect.width > 0 && rect.height > 0,
        ).length,
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    await enlargeDocumentText(page, '#thq-home-title', normalMetrics.title.fontSize);

    const metrics = await page.evaluate(() => {
      const hero = document.querySelector('[data-danmaku-root]');
      const title = document.getElementById('thq-home-title');
      const menu = document.querySelector('nav[aria-label="首页主菜单"]');
      const scrollHint = document.querySelector('[data-danmaku-exclusion="scroll-hint"]');
      const projects = document.getElementById('projects');

      if (
        !(hero instanceof HTMLElement) ||
        !(title instanceof HTMLHeadingElement) ||
        !(menu instanceof HTMLElement) ||
        !(scrollHint instanceof HTMLAnchorElement) ||
        !(projects instanceof HTMLElement)
      ) {
        throw new Error('Missing enlarged-text home geometry target');
      }

      const textRects = (element: Element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return Array.from(range.getClientRects()).filter(
          (rect) => rect.width > 0 && rect.height > 0,
        );
      };
      const unionRect = (rects: DOMRect[]) => {
        const first = rects[0];
        if (!first) {
          throw new Error('Expected rendered text rect');
        }

        return rects.slice(1).reduce(
          (union, rect) => ({
            left: Math.min(union.left, rect.left),
            top: Math.min(union.top, rect.top),
            right: Math.max(union.right, rect.right),
            bottom: Math.max(union.bottom, rect.bottom),
          }),
          {
            left: first.left,
            top: first.top,
            right: first.right,
            bottom: first.bottom,
          },
        );
      };
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const horizontalOverflow = (rect: DOMRect | ReturnType<typeof unionRect>) =>
        Math.max(0, -rect.left, rect.right - viewportWidth);
      const horizontalContainmentOverflow = (
        inner: DOMRect | ReturnType<typeof unionRect>,
        outer: DOMRect | ReturnType<typeof unionRect>,
      ) => Math.max(0, outer.left - inner.left, inner.right - outer.right);
      const containmentOverflow = (
        inner: DOMRect | ReturnType<typeof unionRect>,
        outer: DOMRect | ReturnType<typeof unionRect>,
      ) =>
        Math.max(
          0,
          outer.left - inner.left,
          inner.right - outer.right,
          outer.top - inner.top,
          inner.bottom - outer.bottom,
        );
      const overlap = (
        first: DOMRect | ReturnType<typeof unionRect>,
        second: DOMRect | ReturnType<typeof unionRect>,
      ) =>
        Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) *
        Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));

      const heroRect = hero.getBoundingClientRect();
      const lockup = title.parentElement?.parentElement;
      const titleRangeRects = textRects(title);
      const titleTextRect = unionRect(titleRangeRects);
      const titleRect = title.getBoundingClientRect();
      const titleLineOverlap = titleRangeRects.reduce((maximum, rect, index) => {
        return titleRangeRects
          .slice(index + 1)
          .reduce(
            (pairMaximum, otherRect) => Math.max(pairMaximum, overlap(rect, otherRect)),
            maximum,
          );
      }, 0);
      const menuLinks = Array.from(menu.querySelectorAll('a'));
      const controlElements = [...menuLinks, scrollHint];
      const controlRects = controlElements.map((element) => element.getBoundingClientRect());
      const menuTextElements = menuLinks.flatMap((link) =>
        Array.from(link.querySelectorAll('span, strong, small')),
      );
      const coreCopyElements = Array.from(title.parentElement?.querySelectorAll('p') ?? []);
      const textContainerOverflow = [...menuTextElements, ...coreCopyElements, scrollHint].reduce(
        (maximum, element) => {
          const container =
            element === scrollHint
              ? scrollHint.getBoundingClientRect()
              : (element.parentElement?.getBoundingClientRect() ?? element.getBoundingClientRect());
          return textRects(element).reduce(
            (textMaximum, rect) =>
              Math.max(textMaximum, horizontalContainmentOverflow(rect, container)),
            maximum,
          );
        },
        0,
      );
      const adjacentControlOverlap = controlRects.reduce((maximum, rect, index) => {
        const nextRect = controlRects[index + 1];
        return nextRect ? Math.max(maximum, overlap(rect, nextRect)) : maximum;
      }, 0);
      const focusFailures = controlElements.reduce((count, element) => {
        element.focus({ preventScroll: true });
        return count + (document.activeElement === element ? 0 : 1);
      }, 0);
      const representativeMenuText = menuLinks.at(-1)?.querySelector('strong');
      const representativeCoreCopy = coreCopyElements[0];
      if (
        !(representativeMenuText instanceof HTMLElement) ||
        !(representativeCoreCopy instanceof HTMLElement)
      ) {
        throw new Error('Missing representative enlarged home text');
      }
      const textStyle = (element: Element) => {
        const style = getComputedStyle(element);
        const letterSpacing = style.letterSpacing;
        return {
          fontSize: Number.parseFloat(style.fontSize),
          letterSpacing: letterSpacing === 'normal' ? 0 : Number.parseFloat(letterSpacing),
          transform: style.transform,
        };
      };

      return {
        viewportWidth,
        viewportHeight,
        innerWidth: window.innerWidth,
        rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        textStyles: {
          title: textStyle(title),
          menu: textStyle(representativeMenuText),
          coreCopy: textStyle(representativeCoreCopy),
          scrollHint: textStyle(scrollHint),
        },
        titleLineCount: titleRangeRects.length,
        titleLineRects: titleRangeRects.map((rect) => ({
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        })),
        titleLineOverlap,
        titleViewportOverflow: titleRangeRects.reduce(
          (maximum, rect) => Math.max(maximum, horizontalOverflow(rect)),
          0,
        ),
        titleContainerOverflow: titleRangeRects.reduce(
          (maximum, rect) => Math.max(maximum, horizontalContainmentOverflow(rect, titleRect)),
          0,
        ),
        titleHeroOverflow: containmentOverflow(titleTextRect, heroRect),
        documentOverflow: document.documentElement.scrollWidth - viewportWidth,
        controlViewportOverflow: controlRects.reduce(
          (maximum, rect) => Math.max(maximum, horizontalOverflow(rect)),
          0,
        ),
        controlHeroOverflow: controlRects.reduce(
          (maximum, rect) => Math.max(maximum, containmentOverflow(rect, heroRect)),
          0,
        ),
        coreCopyHeroOverflow: coreCopyElements.reduce((maximum, element) => {
          return textRects(element).reduce(
            (textMaximum, rect) => Math.max(textMaximum, containmentOverflow(rect, heroRect)),
            maximum,
          );
        }, 0),
        coreCopyRectCount: coreCopyElements.reduce(
          (count, element) => count + textRects(element).length,
          0,
        ),
        textContainerOverflow,
        adjacentControlOverlap,
        lockupMenuOverlap:
          lockup instanceof HTMLElement
            ? overlap(lockup.getBoundingClientRect(), menu.getBoundingClientRect())
            : 0,
        menuScrollHintOverlap: overlap(
          menu.getBoundingClientRect(),
          scrollHint.getBoundingClientRect(),
        ),
        focusFailures,
        projectsGap: Math.abs(projects.getBoundingClientRect().top - heroRect.bottom),
      };
    });
    const evidence = `${viewport.width}x${viewport.height} home text-resize metrics: normal=${JSON.stringify(normalMetrics)} enlarged=${JSON.stringify(metrics)}`;

    expect.soft(normalMetrics.titleLineCount, evidence).toBe(1);
    expect.soft(normalMetrics.documentOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.viewportWidth, evidence).toBe(viewport.width);
    expect.soft(metrics.viewportHeight, evidence).toBe(viewport.height);
    expect.soft(metrics.rootFontSize, evidence).toBe(32);
    expect.soft(metrics.titleLineCount, evidence).toBeGreaterThanOrEqual(1);
    expect.soft(metrics.titleLineOverlap, evidence).toBe(0);
    expect.soft(metrics.titleViewportOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.titleContainerOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.titleHeroOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.documentOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.controlViewportOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.controlHeroOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.coreCopyHeroOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.coreCopyRectCount, evidence).toBeGreaterThanOrEqual(2);
    expect.soft(metrics.textContainerOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.adjacentControlOverlap, evidence).toBe(0);
    expect.soft(metrics.lockupMenuOverlap, evidence).toBe(0);
    expect.soft(metrics.menuScrollHintOverlap, evidence).toBe(0);
    expect.soft(metrics.focusFailures, evidence).toBe(0);
    expect.soft(metrics.projectsGap, evidence).toBeLessThanOrEqual(1);
    expectTextApproximatelyDoubles(normalMetrics.title, metrics.textStyles.title, evidence);
    expectTextApproximatelyDoubles(normalMetrics.menu, metrics.textStyles.menu, evidence);
    expectTextApproximatelyDoubles(normalMetrics.coreCopy, metrics.textStyles.coreCopy, evidence);
    expectTextApproximatelyDoubles(
      normalMetrics.scrollHint,
      metrics.textStyles.scrollHint,
      evidence,
    );

    const homeNavigation = page.getByRole('navigation', { name: '首页主菜单' });
    const scrollHint = page.getByRole('link', { name: '进入项目选择' });
    const homeControls = [...(await homeNavigation.getByRole('link').all()), scrollHint];
    for (const control of homeControls) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
      expect(
        await control.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hitTarget = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return hitTarget === element || element.contains(hitTarget);
        }),
        evidence,
      ).toBe(true);
      await control.focus();
      await expect(control).toBeFocused();
    }

    await scrollHint.click();
    await expect(page).toHaveURL(/#projects$/);
    await expect(page.getByRole('heading', { level: 2, name: '项目选择' })).toBeInViewport();
  }
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

test('custom 404 preserves enlarged title and recovery actions at narrow mobile sizes', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile text-resize geometry only');

  for (const viewport of enlargedTextViewports) {
    await page.setViewportSize(viewport);
    await page.goto('/route-that-does-not-exist/');
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const normalMetrics = await page.evaluate(() => {
      const title = document.querySelector('main h1');
      const description = title?.nextElementSibling;
      const action = document.querySelector('nav[aria-label="错误页恢复操作"] button');

      if (
        !(title instanceof HTMLHeadingElement) ||
        !(description instanceof HTMLParagraphElement) ||
        !(action instanceof HTMLButtonElement)
      ) {
        throw new Error('Missing normal 404 text-resize target');
      }

      const textStyle = (element: Element) => {
        const style = getComputedStyle(element);
        const letterSpacing = style.letterSpacing;
        return {
          fontSize: Number.parseFloat(style.fontSize),
          letterSpacing: letterSpacing === 'normal' ? 0 : Number.parseFloat(letterSpacing),
          transform: style.transform,
        };
      };
      const range = document.createRange();
      range.selectNodeContents(title);

      return {
        title: textStyle(title),
        description: textStyle(description),
        action: textStyle(action),
        titleLineCount: Array.from(range.getClientRects()).filter(
          (rect) => rect.width > 0 && rect.height > 0,
        ).length,
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    await enlargeDocumentText(page, 'main h1', normalMetrics.title.fontSize);

    const metrics = await page.evaluate(() => {
      const title = document.querySelector('main h1');
      const pageRoot = title?.closest('main');
      const status = document.querySelector('main p');
      const description = title?.nextElementSibling;
      const actions = document.querySelector('nav[aria-label="错误页恢复操作"]');

      if (
        !(pageRoot instanceof HTMLElement) ||
        !(title instanceof HTMLHeadingElement) ||
        !(status instanceof HTMLParagraphElement) ||
        !(description instanceof HTMLParagraphElement) ||
        !(actions instanceof HTMLElement)
      ) {
        throw new Error('Missing enlarged-text 404 geometry target');
      }

      const textRects = (element: Element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return Array.from(range.getClientRects()).filter(
          (rect) => rect.width > 0 && rect.height > 0,
        );
      };
      const unionRect = (rects: DOMRect[]) => {
        const first = rects[0];
        if (!first) {
          throw new Error('Expected rendered text rect');
        }

        return rects.slice(1).reduce(
          (union, rect) => ({
            left: Math.min(union.left, rect.left),
            top: Math.min(union.top, rect.top),
            right: Math.max(union.right, rect.right),
            bottom: Math.max(union.bottom, rect.bottom),
          }),
          {
            left: first.left,
            top: first.top,
            right: first.right,
            bottom: first.bottom,
          },
        );
      };
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const horizontalOverflow = (rect: DOMRect | ReturnType<typeof unionRect>) =>
        Math.max(0, -rect.left, rect.right - viewportWidth);
      const horizontalContainmentOverflow = (
        inner: DOMRect | ReturnType<typeof unionRect>,
        outer: DOMRect | ReturnType<typeof unionRect>,
      ) => Math.max(0, outer.left - inner.left, inner.right - outer.right);
      const containmentOverflow = (
        inner: DOMRect | ReturnType<typeof unionRect>,
        outer: DOMRect | ReturnType<typeof unionRect>,
      ) =>
        Math.max(
          0,
          outer.left - inner.left,
          inner.right - outer.right,
          outer.top - inner.top,
          inner.bottom - outer.bottom,
        );
      const overlap = (
        first: DOMRect | ReturnType<typeof unionRect>,
        second: DOMRect | ReturnType<typeof unionRect>,
      ) =>
        Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) *
        Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));

      const pageRect = pageRoot.getBoundingClientRect();
      const titleTextRects = textRects(title);
      const titleTextRect = unionRect(titleTextRects);
      const titleRect = title.getBoundingClientRect();
      const titleLineOverlap = titleTextRects.reduce((maximum, rect, index) => {
        return titleTextRects
          .slice(index + 1)
          .reduce(
            (pairMaximum, otherRect) => Math.max(pairMaximum, overlap(rect, otherRect)),
            maximum,
          );
      }, 0);
      const statusTextRect = unionRect(textRects(status));
      const descriptionTextRect = unionRect(textRects(description));
      const actionElements = Array.from(actions.querySelectorAll('a, button')).filter(
        (element): element is HTMLAnchorElement | HTMLButtonElement =>
          element instanceof HTMLAnchorElement || element instanceof HTMLButtonElement,
      );
      const actionRects = actionElements.map((element) => element.getBoundingClientRect());
      const actionTextOverflow = actionElements.reduce((maximum, element) => {
        const controlRect = element.getBoundingClientRect();
        return textRects(element).reduce(
          (textMaximum, rect) => Math.max(textMaximum, containmentOverflow(rect, controlRect)),
          maximum,
        );
      }, 0);
      const actionOverlap = actionRects.reduce((maximum, rect, index) => {
        return actionRects
          .slice(index + 1)
          .reduce(
            (pairMaximum, otherRect) => Math.max(pairMaximum, overlap(rect, otherRect)),
            maximum,
          );
      }, 0);
      const focusFailures = actionElements.reduce((count, element) => {
        element.focus({ preventScroll: true });
        return count + (document.activeElement === element ? 0 : 1);
      }, 0);
      const representativeAction = actionElements.at(-1);
      if (!(representativeAction instanceof HTMLElement)) {
        throw new Error('Missing representative enlarged 404 action');
      }
      const textStyle = (element: Element) => {
        const style = getComputedStyle(element);
        const letterSpacing = style.letterSpacing;
        return {
          fontSize: Number.parseFloat(style.fontSize),
          letterSpacing: letterSpacing === 'normal' ? 0 : Number.parseFloat(letterSpacing),
          transform: style.transform,
        };
      };

      return {
        viewportWidth,
        viewportHeight,
        innerWidth: window.innerWidth,
        rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        textStyles: {
          title: textStyle(title),
          description: textStyle(description),
          action: textStyle(representativeAction),
        },
        titleLineCount: titleTextRects.length,
        titleLineRects: titleTextRects.map((rect) => ({
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        })),
        titleLineOverlap,
        titleViewportOverflow: titleTextRects.reduce(
          (maximum, rect) => Math.max(maximum, horizontalOverflow(rect)),
          0,
        ),
        titleContainerOverflow: titleTextRects.reduce(
          (maximum, rect) => Math.max(maximum, horizontalContainmentOverflow(rect, titleRect)),
          0,
        ),
        titlePageOverflow: containmentOverflow(titleTextRect, pageRect),
        descriptionViewportOverflow: textRects(description).reduce(
          (maximum, rect) => Math.max(maximum, horizontalOverflow(rect)),
          0,
        ),
        descriptionPageOverflow: containmentOverflow(descriptionTextRect, pageRect),
        documentOverflow: document.documentElement.scrollWidth - viewportWidth,
        actionViewportOverflow: actionRects.reduce(
          (maximum, rect) => Math.max(maximum, horizontalOverflow(rect)),
          0,
        ),
        actionPageOverflow: actionRects.reduce(
          (maximum, rect) => Math.max(maximum, containmentOverflow(rect, pageRect)),
          0,
        ),
        actionTextOverflow,
        actionOverlap,
        statusTitleOverlap: overlap(statusTextRect, titleTextRect),
        titleDescriptionOverlap: overlap(titleTextRect, descriptionTextRect),
        descriptionActionsOverlap: overlap(descriptionTextRect, actions.getBoundingClientRect()),
        focusFailures,
        pageScrollRange: document.documentElement.scrollHeight - viewportHeight,
        finalActionBottom: actionRects.at(-1)?.bottom ?? 0,
        documentBottom: document.documentElement.scrollHeight,
      };
    });
    const evidence = `${viewport.width}x${viewport.height} 404 text-resize metrics: normal=${JSON.stringify(normalMetrics)} enlarged=${JSON.stringify(metrics)}`;

    expect.soft(normalMetrics.titleLineCount, evidence).toBe(1);
    expect.soft(normalMetrics.documentOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.viewportWidth, evidence).toBe(viewport.width);
    expect.soft(metrics.viewportHeight, evidence).toBe(viewport.height);
    expect.soft(metrics.rootFontSize, evidence).toBe(32);
    expect.soft(metrics.titleLineCount, evidence).toBeGreaterThanOrEqual(1);
    expect.soft(metrics.titleLineOverlap, evidence).toBe(0);
    expect.soft(metrics.titleViewportOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.titleContainerOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.titlePageOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.descriptionViewportOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.descriptionPageOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.documentOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.actionViewportOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.actionPageOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.actionTextOverflow, evidence).toBeLessThanOrEqual(1);
    expect.soft(metrics.actionOverlap, evidence).toBe(0);
    expect.soft(metrics.statusTitleOverlap, evidence).toBe(0);
    expect.soft(metrics.titleDescriptionOverlap, evidence).toBe(0);
    expect.soft(metrics.descriptionActionsOverlap, evidence).toBe(0);
    expect.soft(metrics.focusFailures, evidence).toBe(0);
    expect
      .soft(Math.max(0, metrics.finalActionBottom - metrics.documentBottom), evidence)
      .toBeLessThanOrEqual(1);
    expectTextApproximatelyDoubles(normalMetrics.title, metrics.textStyles.title, evidence);
    expectTextApproximatelyDoubles(
      normalMetrics.description,
      metrics.textStyles.description,
      evidence,
    );
    expectTextApproximatelyDoubles(normalMetrics.action, metrics.textStyles.action, evidence);
    expect.soft(metrics.pageScrollRange, evidence).toBeGreaterThanOrEqual(0);

    const recoveryNavigation = page.getByRole('navigation', { name: '错误页恢复操作' });
    for (const action of [
      recoveryNavigation.getByRole('link', { name: '返回首页' }),
      recoveryNavigation.getByRole('link', { name: '查看项目' }),
      recoveryNavigation.getByRole('button', { name: '搜索文档' }),
    ]) {
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport();
      expect(
        await action.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hitTarget = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return hitTarget === element || element.contains(hitTarget);
        }),
        evidence,
      ).toBe(true);
      await action.focus();
      await expect(action).toBeFocused();
    }
  }
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
