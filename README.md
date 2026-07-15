# THQLLM Website

Pure-static project portal and documentation site for `thqllm.com`, built with Rspress 2.

## Prerequisites

- Node.js `^20.19.0 || ^22.13.0 || >=24.0.0`
- pnpm `11.7.0`

Run pnpm commands from the repository root without `--ignore-workspace`. The root `pnpm-workspace.yaml` carries the required Rspress patched dependency configuration; ignoring the workspace makes `pnpm install --frozen-lockfile` fail with a configuration mismatch.

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
pnpm capture:og
pnpm verify
```

`pnpm capture:og` builds a deterministic 1200x630, DPR 1, reduced-motion PNG at
`site/public/og-cover.png`. It starts and cleans up its own local preview. Use
`pnpm capture:og -- --output /tmp/thqllm-og.png --port 4318` for another output
path or port, and add `--skip-build` when reusing an existing `doc_build`.

## Add a project

1. Add one validated entry to `src/data/projects.ts` with a unique `id` and `order` and an HTTPS `externalUrl`.
2. If the project has documentation, configure matching `docs.sections` with an `index` entry and add the corresponding Markdown/MDX under `site/docs/<project-id>/`.
3. Run `pnpm verify`.

Project counts, homepage summaries, sidebars, and verification expectations are derived from the registry. When a registry or content change intentionally changes rendered pages, regenerate the relevant macOS visual snapshots and manually review the generated PNGs before committing.

## Content boundaries

- Do not add unverified API endpoints, model names, commands, or configuration fields.
- Do not use official Touhou Project characters, logos, music, or unlicensed fan art.
- Keep the homepage title as `THQLLM`.

## Visual baselines

Playwright visual snapshots are maintained and executed only on macOS/Darwin. The reviewed baselines in this repository are the `-darwin.png` files.

On Linux, `pnpm test:e2e` and `pnpm verify` still run behavior, responsive, and accessibility coverage; visual cases skip themselves. Do not generate, copy, rename, or commit `*-linux.png` baselines.

On macOS, after running `pnpm test:e2e:update`, inspect every changed PNG and confirm there is no blank media, incorrect cropping, overlapping text, hidden controls, or horizontal overflow. Then run `pnpm test:e2e` before committing.
