import { describe, expect, it } from 'vitest';
import { projects } from '../data/projects';
import {
  createSiteSeo,
  normalizeCanonicalPath,
  SITE_ORIGIN,
  serializeStructuredData,
} from './site-seo';

describe('site SEO metadata', () => {
  it.each([
    ['/', '/'],
    ['/projects', '/projects/'],
    ['/projects/index.html', '/projects/'],
    ['/docs/thq-api/', '/docs/thq-api/'],
    ['/docs/thq-api/index.html', '/docs/thq-api/'],
    ['/docs/thq-api/clients/codex.html', '/docs/thq-api/clients/codex'],
  ])('normalizes %s to its canonical route %s', (pathname, expectedPath) => {
    expect(normalizeCanonicalPath(pathname)).toBe(expectedPath);
  });

  it('publishes an indexable homepage with organization and website data', () => {
    const seo = createSiteSeo('/');

    expect(seo.canonicalUrl).toBe(`${SITE_ORIGIN}/`);
    expect(seo.robots).toBe(
      'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
    );
    expect(seo.structuredData['@context']).toBe('https://schema.org');
    expect(seo.structuredData['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@id': `${SITE_ORIGIN}/#organization`,
          '@type': 'Organization',
          name: 'THQLLM',
        }),
        expect.objectContaining({
          '@id': `${SITE_ORIGIN}/#website`,
          '@type': 'WebSite',
          url: `${SITE_ORIGIN}/`,
        }),
      ]),
    );
  });

  it('publishes the project directory as ordered web applications', () => {
    const seo = createSiteSeo('/projects/');
    const itemList = seo.structuredData['@graph'].find((item) => item['@type'] === 'ItemList');

    expect(itemList).toEqual(
      expect.objectContaining({
        itemListElement: projects.map((project, index) =>
          expect.objectContaining({
            position: index + 1,
            item: expect.objectContaining({
              '@type': 'WebApplication',
              description: project.description,
              name: project.name,
              url: project.externalUrl,
            }),
          }),
        ),
      }),
    );
  });

  it('marks unknown routes as noindex', () => {
    const seo = createSiteSeo('/route-that-does-not-exist/');

    expect(seo.robots).toBe('noindex,nofollow');
  });

  it('serializes JSON-LD without allowing an HTML script terminator', () => {
    const serialized = serializeStructuredData({
      '@context': 'https://schema.org',
      name: '</script><script>alert(1)</script>',
    });

    expect(serialized).not.toContain('</script>');
    expect(JSON.parse(serialized)).toEqual({
      '@context': 'https://schema.org',
      name: '</script><script>alert(1)</script>',
    });
  });
});
