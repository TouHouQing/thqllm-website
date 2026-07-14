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

1. Add a validated entry to `src/data/projects.ts` with a unique `id` and `order` and an HTTPS `externalUrl`.
2. For every new project, update the registered-project count in `src/data/projects.test.ts` and the visible project-name summary in `theme/components/HomeBands.tsx`.
3. Regenerate and manually review the homepage desktop and mobile visual baselines because both the Hero node count and Manual list change.
4. If the project has `docs`, configure `docs.basePath` and `docs.sections`, add matching Markdown/MDX under `site/docs/<project-id>/`, and keep them aligned.
5. For a documented project, update the sidebar enumeration in `src/lib/projects.test.ts`, the documentation-root enumeration in `tests/e2e/docs.spec.ts`, and the relevant `requiredOutputs` and URL expectations in `scripts/verify-build.mjs`; regenerate and manually review the documentation desktop visual baseline because the project switcher changes.
6. If `featured: true`, update `theme/tests/ProjectStageGrid.test.tsx` and the homepage featured count and project enumeration in `tests/e2e/home.spec.ts` and `scripts/verify-build.mjs`.
7. Run `pnpm verify`.

## Content boundaries

- Do not add unverified API endpoints, model names, commands, or configuration fields.
- Do not use official Touhou Project characters, logos, music, or unlicensed fan art.
- Keep the homepage title as `THQLLM`.

## Visual baselines

Playwright visual snapshots use operating-system suffixes because CJK font rasterization differs across platforms. The reviewed baselines in this repository are the macOS `-darwin.png` files.

When adding Linux or another CI platform, run `pnpm test:e2e:update` on that platform and commit the genuinely generated baselines with the corresponding suffix. Do not copy or rename PNG files from another platform.

After running `pnpm test:e2e:update`, inspect every generated PNG and confirm there is no blank media, incorrect cropping, overlapping text, hidden controls, or overflow. Then run `pnpm test:e2e` before committing.
