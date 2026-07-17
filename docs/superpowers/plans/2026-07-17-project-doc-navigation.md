# Project Documentation Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the low-emphasis desktop links and mobile select with one direct, horizontally scrollable project documentation tab bar.

**Architecture:** `ProjectDocSwitcher` continues to derive the current project from the pathname and the available documentation roots from the project registry. It renders one semantic navigation row for every viewport, while the CSS module owns active styling, contained horizontal scrolling, and responsive spacing.

**Tech Stack:** React 19, Rspress runtime and Link, CSS Modules, Vitest, Testing Library, Playwright.

---

### Task 1: Define The Direct Project Tab Contract

**Files:**
- Modify: `theme/tests/ProjectDocSwitcher.test.tsx`
- Modify: `tests/e2e/docs.spec.ts`

- [ ] **Step 1: Write failing component tests**

Assert that the switcher renders all three project names, marks `THQ API` with
`aria-current="page"`, exposes the other two projects as links to their documentation roots, and
does not render the old `切换当前项目文档` combobox.

- [ ] **Step 2: Write the failing cross-viewport E2E expectation**

Update `project switcher loads the selected documentation root` so both browser projects click the
`THQ API 文档` link and assert that the destination marks `THQ API` as current.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run theme/tests/ProjectDocSwitcher.test.tsx
pnpm exec playwright test tests/e2e/docs.spec.ts --grep "project switcher loads"
```

Expected: failures caused by the current mobile select and missing active tab semantics.

### Task 2: Implement The Shared Project Tab Bar

**Files:**
- Modify: `theme/components/ProjectDocSwitcher.tsx`
- Modify: `theme/components/DocsChrome.module.css`

- [ ] **Step 1: Render registry-ordered direct tabs**

Remove `useNavigate` and the select control. Render the current project as a non-link element with
`aria-current="page"` and render every other documented project as a `Link` with the existing
`<project> 文档` accessible name.

- [ ] **Step 2: Keep the active project visible**

Attach a ref to the tab list and, after pathname changes, call `scrollIntoView` with
`behavior: "auto"`, `block: "nearest"`, and `inline: "center"` on the current tab.

- [ ] **Step 3: Apply responsive tab styling**

Use one non-wrapping tab row with contained `overflow-x: auto`, stable minimum heights, full project
names, active background and underline, visible focus styling, and mobile edge padding.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run theme/tests/ProjectDocSwitcher.test.tsx
pnpm exec playwright test tests/e2e/docs.spec.ts --grep "project switcher loads"
```

Expected: all focused tests pass.

### Task 3: Verify Layout And Update Snapshots

**Files:**
- Modify: `tests/e2e/docs.spec.ts-snapshots/docs-desktop-desktop-chromium-darwin.png`
- Modify: `tests/e2e/docs.spec.ts-snapshots/docs-mobile-mobile-chromium-darwin.png`

- [ ] **Step 1: Update documentation snapshots**

Run:

```bash
pnpm exec playwright test tests/e2e/docs.spec.ts --grep "visual regression" --update-snapshots
```

Expected: desktop and mobile snapshots show the new direct tab row.

- [ ] **Step 2: Verify responsive behavior**

Run the project switcher and documentation overflow/accessibility tests. Confirm the tab row scrolls
internally at 360px and 390px widths and does not increase document width.

- [ ] **Step 3: Run the complete verification sequence**

Run `pnpm check`, `pnpm typecheck`, `pnpm test`, then run `pnpm build && pnpm verify:build`, followed
by the focused Playwright documentation tests.

- [ ] **Step 4: Commit and push**

Commit the implementation and push `HEAD:main` so Cloudflare can deploy the updated navigation.

