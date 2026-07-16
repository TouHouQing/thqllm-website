import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const rspressRequire = createRequire(import.meta.resolve('@rspress/core'));
const mdxRequire = createRequire(rspressRequire.resolve('@mdx-js/mdx'));
const rehypeRecmaRequire = createRequire(mdxRequire.resolve('rehype-recma'));
const hastUtilToEstreeEntry = pathToFileURL(rehypeRecmaRequire.resolve('hast-util-to-estree')).href;

describe('MDX style compatibility', () => {
  it('converts Shiki inline styles into JSX style objects', async () => {
    const { toEstree } = await import(/* @vite-ignore */ hastUtilToEstreeEntry);

    expect(() =>
      toEstree({
        type: 'element',
        tagName: 'span',
        properties: {
          style: 'color:var(--shiki-token-keyword)',
        },
        children: [],
      }),
    ).not.toThrow();
  });
});
