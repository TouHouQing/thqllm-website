# THQLLM Website

Pure-static project portal and documentation site for `thqllm.com`, built with Rspress 2.

## Prerequisites

- Node.js `^20.19.0 || ^22.13.0 || >=24.0.0`
- pnpm `11.7.0`

For first setup, install dependencies and Playwright's Chromium browser:

```bash
pnpm install
pnpm exec playwright install chromium
```

## Commands

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm test:e2e
pnpm verify
```

## Add a project

1. Add a validated entry to `src/data/projects.ts` with a unique `id` and `order`, an HTTPS `externalUrl`, and, when it has documentation, `docs.basePath` and `docs.sections`.
2. Add Markdown/MDX under `site/docs/<project-id>/` for the entries configured in `docs.sections`.
3. Update the registered-project count assertion in `src/data/projects.test.ts`.
4. If `featured: true`, update the homepage enumeration and count assertions in `scripts/verify-build.mjs` and `tests/e2e/home.spec.ts`, then regenerate and manually review the affected homepage visual baselines.
5. Run `pnpm verify`.

## Content boundaries

- Do not add unverified API endpoints, model names, commands, or configuration fields.
- Do not use official Touhou Project characters, logos, music, or unlicensed fan art.
- Keep the homepage title as `THQLLM`.

## Visual baselines

Playwright visual snapshots use operating-system suffixes because CJK font rasterization differs across platforms. The reviewed baselines in this repository are the macOS `-darwin.png` files.

When adding Linux or another CI platform, run `pnpm test:e2e:update` on that platform and commit the genuinely generated baselines with the corresponding suffix. Do not copy or rename PNG files from another platform.

After running `pnpm test:e2e:update`, inspect every generated PNG and confirm there is no blank media, incorrect cropping, overlapping text, hidden controls, or overflow. Then run `pnpm test:e2e` before committing.
