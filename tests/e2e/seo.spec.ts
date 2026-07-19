import { expect, test } from '@playwright/test';

const indexableRoutes = [
  ['/', 'https://thqllm.com/'],
  ['/projects/', 'https://thqllm.com/projects/'],
  ['/about/', 'https://thqllm.com/about/'],
  ['/docs/thq-api/', 'https://thqllm.com/docs/thq-api/'],
] as const;

for (const [path, canonicalUrl] of indexableRoutes) {
  test(`${path} publishes canonical metadata and JSON-LD`, async ({ page }) => {
    await page.goto(path);

    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', canonicalUrl);
    await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute(
      'content',
      canonicalUrl,
    );
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
    );

    const structuredData = page.locator('head script#thqllm-structured-data');
    await expect(structuredData).toHaveCount(1);
    await expect(structuredData).toHaveAttribute('type', 'application/ld+json');
    await expect(structuredData).not.toBeEmpty();
  });
}

test('homepage structured data identifies THQLLM as the publishing website', async ({ page }) => {
  await page.goto('/');

  const structuredData = await page.locator('head script#thqllm-structured-data').textContent();
  const parsed = JSON.parse(structuredData ?? '{}') as {
    '@graph'?: Array<{ '@type'?: string; name?: string }>;
  };

  expect(parsed['@graph']).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ '@type': 'Organization', name: 'THQLLM' }),
      expect.objectContaining({ '@type': 'WebSite', name: 'THQLLM' }),
    ]),
  );
});

test('robots and sitemap expose the canonical public crawl entry points', async ({ page }) => {
  const [robotsResponse, sitemapResponse] = await Promise.all([
    page.request.get('/robots.txt'),
    page.request.get('/sitemap.xml'),
  ]);

  expect(robotsResponse.ok()).toBe(true);
  expect(await robotsResponse.text()).toContain('Sitemap: https://thqllm.com/sitemap.xml');
  expect(sitemapResponse.ok()).toBe(true);
  expect(await sitemapResponse.text()).toContain('<loc>https://thqllm.com/</loc>');
});
