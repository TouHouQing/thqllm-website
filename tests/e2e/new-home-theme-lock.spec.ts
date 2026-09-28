import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const homepagePath = path.resolve(import.meta.dirname, '../../new.html');

const themeTargets = [
  '#thq-video-page',
  '.hero',
  '.models',
  '.model-card.fast',
  '.capabilities',
  '.capability',
  '.quick-start',
  '.docs-section',
  '.faq-section',
  '.faq-list details',
  '.final-cta',
  '.site-footer',
  '.button-primary',
  '.button-light',
  '.hero h1',
  '.api-panel-head > span:first-child',
  '.endpoint > span:last-child',
  '.api-code code',
  '.frame span',
  '.model-ribbon strong',
  '.model-ribbon-list span',
  '.models h2',
  '.model-card.primary h3',
  '.model-card.fast h3',
  '.model-price small',
  '.capabilities h2',
  '.capability h3',
  '.capability:nth-child(5) h3',
  '.quick-start h2',
  '.code-output code',
  '.docs-section h2',
  '.faq-section h2',
  '.faq-answer p',
  '.final-cta h2',
  '.footer-bottom span',
];

test('keeps the custom homepage palette when NewAPI enables dark mode', async ({ page }) => {
  const html = await fs.readFile(homepagePath, 'utf8');
  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  const readPalette = () =>
    page.evaluate((selectors) => {
      return Object.fromEntries(
        selectors.map((selector) => {
          const element = document.querySelector(selector);
          if (!(element instanceof HTMLElement)) {
            throw new Error(`Missing theme target: ${selector}`);
          }

          const style = getComputedStyle(element);
          const hasVisibleBorder = ['Top', 'Right', 'Bottom', 'Left'].some(
            (side) =>
              style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none' &&
              style.getPropertyValue(`border-${side.toLowerCase()}-width`) !== '0px',
          );
          return [
            selector,
            {
              backgroundColor: style.backgroundColor,
              backgroundImage: style.backgroundImage,
              borderColor: hasVisibleBorder ? style.borderColor : 'none',
              color: style.color,
            },
          ];
        }),
      );
    }, themeTargets);

  const originalPalette = await readPalette();

  await page.addStyleTag({
    content: `
      html.dark body,
      html.dark #root,
      html.dark header,
      html.dark main,
      html.dark section,
      html.dark footer,
      html.dark article,
      html.dark details,
      html.dark button,
      html.dark a,
      html.dark h1,
      html.dark h2,
      html.dark h3,
      html.dark p,
      html.dark span,
      html.dark strong,
      html.dark code,
      html.dark pre {
        color: rgb(232, 234, 237) !important;
        background-color: rgb(24, 26, 31) !important;
        border-color: rgb(64, 68, 77) !important;
      }

      html.dark body {
        --ink: rgb(232, 234, 237) !important;
        --paper: rgb(24, 26, 31) !important;
        --white: rgb(30, 33, 39) !important;
        --line: rgb(64, 68, 77) !important;
        color-scheme: dark;
      }
    `,
  });
  await page.evaluate(() => document.documentElement.classList.add('dark'));

  await expect.poll(readPalette).toEqual(originalPalette);
});

test('uses only the NewAPI header when the homepage is mounted in its shadow root', async ({
  page,
}) => {
  const html = await fs.readFile(homepagePath, 'utf8');
  await page.setContent(
    `
      <style>
        html, body { margin: 0; }
        #newapi-global-header {
          position: fixed;
          inset: 0 0 auto;
          z-index: 50;
          height: 64px;
        }
      </style>
      <header id="newapi-global-header">
        <nav>
          <a href="/">Home</a>
          <a href="/dashboard">Console</a>
          <a href="/pricing">Model Square</a>
        </nav>
      </header>
      <div class="custom-home-content"></div>
    `,
    { waitUntil: 'domcontentloaded' },
  );

  await page.evaluate((homepageHtml) => {
    const host = document.querySelector('.custom-home-content');
    if (!(host instanceof HTMLElement)) {
      throw new Error('Missing custom homepage host');
    }

    const parsedHomepage = new DOMParser().parseFromString(homepageHtml, 'text/html');
    const shadowRoot = host.attachShadow({ mode: 'open' });

    parsedHomepage.head.querySelectorAll('style').forEach((style) => {
      shadowRoot.append(style.cloneNode(true));
    });

    parsedHomepage.body.childNodes.forEach((node) => {
      if (!(node instanceof HTMLScriptElement)) {
        shadowRoot.append(node.cloneNode(true));
      }
    });
  }, html);

  const embeddingState = await page.locator('.custom-home-content').evaluate((host) => {
    const shadowRoot = host.shadowRoot;
    const homepage = shadowRoot?.querySelector('#thq-video-page');
    const hero = shadowRoot?.querySelector('.hero');

    if (!shadowRoot || !(homepage instanceof HTMLElement) || !(hero instanceof HTMLElement)) {
      throw new Error('Custom homepage failed to mount in the shadow root');
    }

    return {
      customHeaderCount: shadowRoot.querySelectorAll('.site-header').length,
      heroTop: hero.getBoundingClientRect().top,
      backgroundImage: getComputedStyle(homepage).backgroundImage,
      paddingTop: getComputedStyle(homepage).paddingTop,
    };
  });

  await expect(page.locator('#newapi-global-header')).toBeVisible();
  expect(embeddingState).toEqual({
    customHeaderCount: 0,
    heroTop: 64,
    backgroundImage: 'none',
    paddingTop: '64px',
  });
});

test('keeps the NewAPI header visible above the shadow-root homepage', async ({ page }) => {
  const html = await fs.readFile(homepagePath, 'utf8');
  await page.setContent(
    `
      <style>
        html, body { margin: 0; }
        #newapi-global-header {
          position: fixed;
          inset: 0 0 auto;
          z-index: 50;
          height: 64px;
        }
      </style>
      <header id="newapi-global-header">
        <nav>
          <a href="/">Home</a>
          <a href="/dashboard">Console</a>
          <a href="/pricing">Model Square</a>
        </nav>
      </header>
      <div class="custom-home-content"></div>
    `,
    { waitUntil: 'domcontentloaded' },
  );

  await page.evaluate((homepageHtml) => {
    const host = document.querySelector('.custom-home-content');
    if (!(host instanceof HTMLElement)) {
      throw new Error('Missing custom homepage host');
    }

    const parsedHomepage = new DOMParser().parseFromString(homepageHtml, 'text/html');
    const shadowRoot = host.attachShadow({ mode: 'open' });

    parsedHomepage.head.querySelectorAll('style').forEach((style) => {
      shadowRoot.append(style.cloneNode(true));
    });

    parsedHomepage.body.childNodes.forEach((node) => {
      if (!(node instanceof HTMLScriptElement)) {
        shadowRoot.append(node.cloneNode(true));
      }
    });
  }, html);

  const headers = await page.locator('.custom-home-content').evaluate((host) => ({
    newApiHeaderBottom: document.querySelector('#newapi-global-header')?.getBoundingClientRect()
      .bottom,
    homepageHeaderCount: host.shadowRoot?.querySelectorAll('header').length,
    heroTop: host.shadowRoot?.querySelector('.hero')?.getBoundingClientRect().top,
  }));

  expect(headers).toEqual({
    newApiHeaderBottom: 64,
    homepageHeaderCount: 0,
    heroTop: 64,
  });
});

test('provides a dark backing strip for the NewAPI header in dark mode', async ({ page }) => {
  const html = await fs.readFile(homepagePath, 'utf8');
  await page.setContent('<div class="custom-home-content"></div>', {
    waitUntil: 'domcontentloaded',
  });
  await page.evaluate(() => document.documentElement.classList.add('dark'));

  await page.evaluate((homepageHtml) => {
    const host = document.querySelector('.custom-home-content');
    if (!(host instanceof HTMLElement)) {
      throw new Error('Missing custom homepage host');
    }

    const parsedHomepage = new DOMParser().parseFromString(homepageHtml, 'text/html');
    const shadowRoot = host.attachShadow({ mode: 'open' });

    parsedHomepage.head.querySelectorAll('style').forEach((style) => {
      shadowRoot.append(style.cloneNode(true));
    });

    parsedHomepage.body.childNodes.forEach((node) => {
      if (!(node instanceof HTMLScriptElement)) {
        shadowRoot.append(node.cloneNode(true));
      }
    });
  }, html);

  const homepageBackground = await page.locator('.custom-home-content').evaluate((host) => {
    const homepage = host.shadowRoot?.querySelector('#thq-video-page');
    if (!(homepage instanceof HTMLElement)) {
      throw new Error('Custom homepage failed to mount in the shadow root');
    }

    const style = getComputedStyle(homepage);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      paddingTop: style.paddingTop,
    };
  });

  expect(homepageBackground.backgroundColor).toBe('rgb(247, 248, 246)');
  expect(homepageBackground.backgroundImage).toContain('rgb(17, 20, 27)');
  expect(homepageBackground.paddingTop).toBe('64px');
});
