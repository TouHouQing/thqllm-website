import { describe, expect, it } from 'vitest';

import { createProjectDocRoutePath } from './project-doc-routes';

describe('project documentation routes', () => {
  it.each([
    ['index', '/docs/documented/'],
    ['clients/index', '/docs/documented/clients/'],
    ['clients/codex', '/docs/documented/clients/codex'],
    ['quick-start', '/docs/documented/quick-start'],
  ])('maps the "%s" slug to its public route', (slug, expectedRoutePath) => {
    expect(createProjectDocRoutePath('/docs/documented/', slug)).toBe(expectedRoutePath);
  });
});
