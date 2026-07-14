# THQLLM Website

Pure-static project portal and documentation site for `thqllm.com`, built with Rspress 2.

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

1. Add one validated project entry to `src/data/projects.ts`.
2. Add Markdown/MDX under `site/docs/<project-id>/`.
3. Run `pnpm verify`.

## Content boundaries

- Do not add unverified API endpoints, model names, commands, or configuration fields.
- Do not use official Touhou Project characters, logos, music, or unlicensed fan art.
- Keep the homepage title as `THQLLM`.

## Visual baselines

Playwright visual snapshots use operating-system suffixes because CJK font rasterization differs across platforms. The reviewed baselines in this repository are the macOS `-darwin.png` files.

When adding Linux or another CI platform, run `pnpm test:e2e:update` on that platform and commit the genuinely generated baselines with the corresponding suffix. Do not copy or rename PNG files from another platform.
