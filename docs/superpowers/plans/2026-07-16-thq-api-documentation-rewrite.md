# THQ API Documentation Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal THQ API manual with a complete, original Chinese documentation set covering onboarding, supported client configuration, endpoint selection, account usage, and troubleshooting.

**Architecture:** Keep project documentation routes registry-driven. Extend the existing relative doc slug model to support nested paths and directory indexes, then derive sidebar links and build-manifest routes from one shared route helper. Add filesystem-based content contract tests before writing the pages so endpoint rules, source-brand removal, page coverage, and credential safety remain enforced as the documentation evolves.

**Tech Stack:** Rspress 2, MDX, TypeScript, Zod, Vitest, Playwright, pnpm

---

## File Map

### Registry and routing

- Modify `src/data/project-schema.ts`
  - Accept nested relative document slugs such as `clients/codex` and `clients/index`.
  - Continue rejecting absolute paths, traversal, empty path segments, and malformed segment names.
- Create `src/lib/project-doc-routes.ts`
  - Convert a project docs base path plus a relative slug into the canonical public route.
  - Map root `index` and nested `*/index` slugs to directory routes.
- Create `src/lib/project-doc-routes.test.ts`
  - Lock canonical route behavior and path rejection.
- Modify `src/lib/projects.ts`
  - Use the shared route helper when creating sidebar links.
- Modify `src/lib/project-build-manifest.ts`
  - Use the same helper when creating static output routes.
- Modify `src/data/projects.ts`
  - Register every new THQ API document and section.
- Modify `src/data/projects.test.ts`
  - Verify the complete THQ API page registry.
- Modify `src/lib/projects.test.ts`
  - Verify nested THQ API sidebar links.
- Modify `src/lib/project-build-manifest.test.ts`
  - Verify directory-index and nested static outputs.

### Documentation contracts

- Create `src/lib/thq-api-docs.test.ts`
  - Verify the exact THQ API page set exists.
  - Reject Wegoo branding and source URLs from published pages.
  - Reject screenshots and remote image references.
  - Verify control-panel and protocol-specific Base URLs.
  - Reject likely real API credentials.

### THQ API content

- Replace `site/docs/thq-api/index.mdx`
- Replace `site/docs/thq-api/quick-start.mdx`
- Create `site/docs/thq-api/clients/index.mdx`
- Create `site/docs/thq-api/clients/codex.mdx`
- Create `site/docs/thq-api/clients/claude-code.mdx`
- Create `site/docs/thq-api/clients/gemini-cli.mdx`
- Create `site/docs/thq-api/clients/vscode.mdx`
- Create `site/docs/thq-api/clients/opencode.mdx`
- Create `site/docs/thq-api/clients/openclaw.mdx`
- Create `site/docs/thq-api/clients/cherry-studio.mdx`
- Create `site/docs/thq-api/configuration.mdx`
- Create `site/docs/thq-api/endpoints.mdx`
- Create `site/docs/thq-api/account.mdx`
- Replace `site/docs/thq-api/faq.mdx`
- Replace `site/docs/thq-api/changelog.mdx`

### Browser verification

- Modify `tests/e2e/docs.spec.ts`
  - Visit every registered THQ API page.
  - Verify the nested sidebar route and endpoint guidance.
  - Verify search can find a newly added client page.
- Modify `tests/e2e/responsive.spec.ts`
  - Add a representative long THQ API page to overflow and accessibility coverage.

## Source and Safety Rules

Every writing task must follow these rules:

1. Use `https://docs.wegoo.site/guide/` only as an information-architecture and scenario reference.
2. Rewrite all prose from scratch for THQ API.
3. Do not include Wegoo names, domains, images, prices, group names, promotions, refunds, warranties, or service promises.
4. Use `https://sub.thqllm.com` for console, account, key, balance, and usage-record actions.
5. Use `https://api.thqllm.com/v1` for OpenAI-compatible clients, Codex, OpenCode, OpenClaw, Cherry Studio, and generic OpenAI examples.
6. Use `https://api.thqllm.com/v1beta` for Gemini CLI.
7. Use `https://api.thqllm.com` for Claude Code without `/v1`.
8. Use `YOUR_THQ_API_KEY` or an environment-variable reference in every credential example.
9. Do not add screenshots. The user explicitly allows source screenshots to be removed when equivalent THQ API screenshots are unavailable.
10. Treat model availability, pricing, balance conversion, quota, groups, and rate limits as dynamic control-panel data.
11. For third-party client field names and configuration locations, verify current behavior against the client's official documentation before finalizing the page.

---

### Task 1: Support Nested Registry-Driven Documentation Routes

**Files:**
- Create: `src/lib/project-doc-routes.ts`
- Create: `src/lib/project-doc-routes.test.ts`
- Modify: `src/data/project-schema.ts`
- Modify: `src/data/projects.test.ts`
- Modify: `src/lib/projects.ts`
- Modify: `src/lib/projects.test.ts`
- Modify: `src/lib/project-build-manifest.ts`
- Modify: `src/lib/project-build-manifest.test.ts`

- [ ] **Step 1: Write failing tests for nested document slugs**

Add these cases to `src/data/projects.test.ts`:

```ts
it.each([
  'clients/codex',
  'clients/claude-code',
  'clients/index',
])('accepts a safe nested document slug: %s', (slug) => {
  const fixture = structuredClone(validProject);
  fixture.docs.sections[0].items.push({ text: '嵌套页面', slug });

  expect(() => projectListSchema.parse([fixture])).not.toThrow();
});

it.each([
  '/clients/codex',
  'clients/',
  'clients//codex',
  'clients/../codex',
  '../clients/codex',
  'clients/Codex',
  'clients/codex.md',
])('rejects an unsafe nested document slug: %s', (slug) => {
  const fixture = structuredClone(validProject);
  fixture.docs.sections[0].items.push({ text: '错误页面', slug });

  expect(() => projectListSchema.parse([fixture])).toThrow();
});
```

- [ ] **Step 2: Run the schema tests and confirm RED**

Run:

```bash
pnpm vitest run src/data/projects.test.ts
```

Expected: the safe nested slug cases fail because `slugSchema` only accepts one segment.

- [ ] **Step 3: Add failing route-helper tests**

Create `src/lib/project-doc-routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createProjectDocRoutePath } from './project-doc-routes';

describe('project document routes', () => {
  it.each([
    ['index', '/docs/thq-api/'],
    ['quick-start', '/docs/thq-api/quick-start'],
    ['clients/index', '/docs/thq-api/clients/'],
    ['clients/codex', '/docs/thq-api/clients/codex'],
  ])('maps %s to %s', (slug, expected) => {
    expect(createProjectDocRoutePath('/docs/thq-api/', slug)).toBe(expected);
  });
});
```

- [ ] **Step 4: Run the helper test and confirm RED**

Run:

```bash
pnpm vitest run src/lib/project-doc-routes.test.ts
```

Expected: FAIL because `project-doc-routes.ts` does not exist.

- [ ] **Step 5: Implement the nested slug schema and canonical route helper**

In `src/data/project-schema.ts`, replace the single-segment `slugFormatSchema` with:

```ts
const slugSegmentPattern = '[a-z0-9]+(?:-[a-z0-9]+)*';
const slugFormatSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^${slugSegmentPattern}(?:/${slugSegmentPattern})*$`));
```

Create `src/lib/project-doc-routes.ts`:

```ts
export function createProjectDocRoutePath(basePath: string, slug: string): string {
  if (slug === 'index') {
    return basePath;
  }

  if (slug.endsWith('/index')) {
    return `${basePath}${slug.slice(0, -'index'.length)}`;
  }

  return `${basePath}${slug}`;
}
```

- [ ] **Step 6: Route sidebars and build manifests through the helper**

In `src/lib/projects.ts`, import `createProjectDocRoutePath` and replace the inline link expression with:

```ts
link: createProjectDocRoutePath(docs.basePath, item.slug),
```

In `src/lib/project-build-manifest.ts`, import the same helper and replace the inline route expression with:

```ts
const routePath = createProjectDocRoutePath(docs.basePath, item.slug);
```

- [ ] **Step 7: Add nested sidebar and build-manifest assertions**

Extend `src/lib/projects.test.ts` with a fixture containing `clients/index` and `clients/codex`, then assert:

```ts
expect(sidebars['/docs/thq-api/']).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      items: expect.arrayContaining([
        {
          text: '客户端总览',
          link: '/docs/thq-api/clients/',
        },
        {
          text: 'Codex',
          link: '/docs/thq-api/clients/codex',
        },
      ]),
    }),
  ]),
);
```

Extend `src/lib/project-build-manifest.test.ts` with the same nested items and assert:

```ts
expect(manifest.routes).toEqual(
  expect.arrayContaining([
    {
      routePath: '/docs/documented/clients/',
      htmlPath: 'docs/documented/clients/index.html',
      markdownPath: 'docs/documented/clients/index.md',
      llms: { txt: true, full: true },
    },
    {
      routePath: '/docs/documented/clients/codex',
      htmlPath: 'docs/documented/clients/codex.html',
      markdownPath: 'docs/documented/clients/codex.md',
      llms: { txt: true, full: true },
    },
  ]),
);
```

- [ ] **Step 8: Run focused tests and confirm GREEN**

Run:

```bash
pnpm vitest run \
  src/data/projects.test.ts \
  src/lib/project-doc-routes.test.ts \
  src/lib/projects.test.ts \
  src/lib/project-build-manifest.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 9: Commit the routing capability**

```bash
git add \
  src/data/project-schema.ts \
  src/data/projects.test.ts \
  src/lib/project-doc-routes.ts \
  src/lib/project-doc-routes.test.ts \
  src/lib/projects.ts \
  src/lib/projects.test.ts \
  src/lib/project-build-manifest.ts \
  src/lib/project-build-manifest.test.ts
git commit -m "feat: support nested project documentation routes"
```

---

### Task 2: Register the Complete THQ API Documentation Set

**Files:**
- Modify: `src/data/projects.ts`
- Modify: `src/data/projects.test.ts`
- Create: `src/lib/thq-api-docs.test.ts`

- [ ] **Step 1: Write the failing registry expectation**

Add to `src/data/projects.test.ts`:

```ts
it('registers the complete THQ API documentation set', () => {
  const thqApi = projects.find((project) => project.id === 'thq-api');

  expect(thqApi?.docs?.sections).toEqual([
    {
      text: '开始接入',
      items: [
        { text: '概览', slug: 'index' },
        { text: '快速开始', slug: 'quick-start' },
      ],
    },
    {
      text: '客户端',
      items: [
        { text: '客户端总览', slug: 'clients/index' },
        { text: 'Codex', slug: 'clients/codex' },
        { text: 'Claude Code', slug: 'clients/claude-code' },
        { text: 'Gemini CLI', slug: 'clients/gemini-cli' },
        { text: 'VS Code', slug: 'clients/vscode' },
        { text: 'OpenCode', slug: 'clients/opencode' },
        { text: 'OpenClaw', slug: 'clients/openclaw' },
        { text: 'Cherry Studio', slug: 'clients/cherry-studio' },
      ],
    },
    {
      text: '配置与端点',
      items: [
        { text: '手动配置', slug: 'configuration' },
        { text: '端点说明', slug: 'endpoints' },
      ],
    },
    {
      text: '账户与排错',
      items: [
        { text: '账户与用量', slug: 'account' },
        { text: '常见问题', slug: 'faq' },
        { text: '更新记录', slug: 'changelog' },
      ],
    },
  ]);
});
```

- [ ] **Step 2: Run the registry test and confirm RED**

Run:

```bash
pnpm vitest run src/data/projects.test.ts
```

Expected: FAIL because the registry still contains four THQ API pages.

- [ ] **Step 3: Replace the THQ API docs registry**

Update only the `thq-api` project's `docs.sections` in `src/data/projects.ts` to exactly match the expectation from Step 1.

- [ ] **Step 4: Add failing filesystem and content-contract tests**

Create `src/lib/thq-api-docs.test.ts` with:

```ts
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const docsRoot = path.join(repoRoot, 'site/docs/thq-api');
const expectedFiles = [
  'index.mdx',
  'quick-start.mdx',
  'clients/index.mdx',
  'clients/codex.mdx',
  'clients/claude-code.mdx',
  'clients/gemini-cli.mdx',
  'clients/vscode.mdx',
  'clients/opencode.mdx',
  'clients/openclaw.mdx',
  'clients/cherry-studio.mdx',
  'configuration.mdx',
  'endpoints.mdx',
  'account.mdx',
  'faq.mdx',
  'changelog.mdx',
] as const;

async function readDoc(relativePath: (typeof expectedFiles)[number]): Promise<string> {
  return readFile(path.join(docsRoot, relativePath), 'utf8');
}

describe('THQ API documentation contracts', () => {
  it('contains the complete page set', async () => {
    await expect(Promise.all(expectedFiles.map(readDoc))).resolves.toHaveLength(
      expectedFiles.length,
    );
  });

  it('contains no source-site branding, URLs, or screenshots', async () => {
    const content = (await Promise.all(expectedFiles.map(readDoc))).join('\n');

    expect(content).not.toMatch(/Wegoo|wegoo\.site|ai\.wegoo\.site/i);
    expect(content).not.toMatch(/!\[[^\]]*]\(|<img\b|https?:\/\/[^\s)"']+\.(?:png|jpe?g|webp)/i);
  });

  it('uses only placeholder credentials', async () => {
    const content = (await Promise.all(expectedFiles.map(readDoc))).join('\n');

    expect(content).not.toMatch(/\bsk-[A-Za-z0-9_-]{16,}\b/);
    expect(content).toContain('YOUR_THQ_API_KEY');
  });

  it('locks protocol-specific Base URLs', async () => {
    const codex = await readDoc('clients/codex.mdx');
    const claude = await readDoc('clients/claude-code.mdx');
    const gemini = await readDoc('clients/gemini-cli.mdx');

    expect(codex).toContain('https://api.thqllm.com/v1');
    expect(gemini).toContain('https://api.thqllm.com/v1beta');
    expect(claude).toContain('https://api.thqllm.com');
    expect(claude).not.toContain('https://api.thqllm.com/v1');
    expect(claude).not.toContain('https://api.thqllm.com/v1beta');
  });

  it('uses the THQ API control panel for account actions', async () => {
    const content = [
      await readDoc('index.mdx'),
      await readDoc('quick-start.mdx'),
      await readDoc('account.mdx'),
    ].join('\n');

    expect(content).toContain('https://sub.thqllm.com');
  });
});
```

- [ ] **Step 5: Run the contract tests and confirm RED**

Run:

```bash
pnpm vitest run src/data/projects.test.ts src/lib/thq-api-docs.test.ts
```

Expected: registry assertions pass after Step 3, while the document contract suite fails because the new files do not exist and old pages do not satisfy the content rules.

- [ ] **Step 6: Commit registry and failing content contracts**

```bash
git add src/data/projects.ts src/data/projects.test.ts src/lib/thq-api-docs.test.ts
git commit -m "test: define THQ API documentation contracts"
```

---

### Task 3: Rewrite Onboarding, Account, FAQ, and Changelog Pages

**Files:**
- Replace: `site/docs/thq-api/index.mdx`
- Replace: `site/docs/thq-api/quick-start.mdx`
- Create: `site/docs/thq-api/account.mdx`
- Replace: `site/docs/thq-api/faq.mdx`
- Replace: `site/docs/thq-api/changelog.mdx`

- [ ] **Step 1: Rewrite the overview**

`site/docs/thq-api/index.mdx` must contain:

```mdx
---
title: THQ API 使用文档
description: THQ API 控制台、模型端点和常见客户端的完整接入指南。
---

# THQ API

THQ API 是面向 AI 编程、聊天与自动化工具的 API 网关。你可以在控制台管理账户、API Key、额度和使用记录，再把密钥配置到支持 OpenAI、Claude 或 Gemini 接口的客户端中。

<ProjectLink href="https://sub.thqllm.com">打开 THQ API 控制台</ProjectLink>

## 地址速查

| 用途 | Base URL |
| --- | --- |
| 控制台与账户管理 | `https://sub.thqllm.com` |
| OpenAI 兼容接口 | `https://api.thqllm.com/v1` |
| Gemini CLI | `https://api.thqllm.com/v1beta` |
| Claude Code | `https://api.thqllm.com` |

## 从这里开始

- [首次接入](/docs/thq-api/quick-start)：注册、创建 API Key 并完成第一个请求。
- [客户端总览](/docs/thq-api/clients/)：按工具选择正确的协议与配置方式。
- [端点说明](/docs/thq-api/endpoints)：确认 `/v1`、`/v1beta` 和无后缀地址的区别。
- [常见问题](/docs/thq-api/faq)：排查认证、模型、额度和网络错误。

## 使用前注意

- API Key 仅保存在可信设备、服务端或本地环境变量中。
- 模型、价格、额度、分组和速率限制以控制台当前显示为准。
- 不要在网页前端、公开仓库、聊天记录或截图中暴露完整密钥。
- 使用服务前阅读控制台中的现行服务条款，不要提交敏感或受监管数据。
```

- [ ] **Step 2: Rewrite quick start as a complete first-request flow**

Write `site/docs/thq-api/quick-start.mdx` with these exact sections:

```md
# 快速开始
## 1. 打开控制台
## 2. 注册或登录
## 3. 确认可用额度
## 4. 创建 API Key
## 5. 选择模型与接口
## 6. 发起最小请求
## 7. 查看使用记录
## 下一步
```

The minimal request must be:

```bash
export THQ_API_KEY="YOUR_THQ_API_KEY"

curl https://api.thqllm.com/v1/chat/completions \
  -H "Authorization: Bearer $THQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "CONTROL_PANEL_MODEL_ID",
    "messages": [
      {
        "role": "user",
        "content": "请只回复：THQ API 连接成功"
      }
    ]
  }'
```

Explain that `CONTROL_PANEL_MODEL_ID` must be replaced with a model identifier currently available in the control panel.

- [ ] **Step 3: Write the account and usage page**

Write `site/docs/thq-api/account.mdx` with:

```md
# 账户、额度与使用记录
## 账户页面能做什么
## 额度与扣费
## 查看使用记录
## 控制成本
## 限制与撤销 API Key
## 充值或账单异常
## 提交排查信息
```

Require a support checklist containing request time, client name and version, model identifier, HTTP status code, request ID when available, and a redacted error message. Explicitly forbid sending a full API Key.

- [ ] **Step 4: Rewrite the troubleshooting page**

Write `site/docs/thq-api/faq.mdx` with:

```md
# 常见问题与错误排查
## 最快排查顺序
## 401：认证失败
## 403：请求被拒绝
## 404：端点或模型不匹配
## 429：额度、速率或并发受限
## 5xx：网关或上游服务异常
## 客户端保存配置后仍不生效
## 可以把 API Key 写进前端吗
## 仍未解决
```

The fastest sequence must be: verify Base URL, verify API Key, verify model identifier, run the minimal `curl` request, inspect control-panel usage records, then collect redacted diagnostic information.

- [ ] **Step 5: Rewrite the changelog**

Write `site/docs/thq-api/changelog.mdx` with one dated entry:

```md
## 2026-07-16

- 重构 THQ API 文档导航和页面结构。
- 增加 Codex、Claude Code、Gemini CLI、VS Code、OpenCode、OpenClaw 与 Cherry Studio 接入指南。
- 增加端点、手动配置、账户用量和错误排查文档。
- 明确 OpenAI 兼容、Gemini CLI 与 Claude Code 使用不同 Base URL。
- 删除不属于 THQ API 的品牌文案和截图依赖。
```

- [ ] **Step 6: Run focused content tests**

Run:

```bash
pnpm vitest run src/lib/thq-api-docs.test.ts
```

Expected: still FAIL because client, endpoint, and configuration files are not yet present; the five files written in this task no longer produce content-rule failures.

- [ ] **Step 7: Commit the foundational documentation**

```bash
git add \
  site/docs/thq-api/index.mdx \
  site/docs/thq-api/quick-start.mdx \
  site/docs/thq-api/account.mdx \
  site/docs/thq-api/faq.mdx \
  site/docs/thq-api/changelog.mdx
git commit -m "docs: rewrite THQ API onboarding and support guides"
```

---

### Task 4: Add Core Client Guides

**Files:**
- Create: `site/docs/thq-api/clients/index.mdx`
- Create: `site/docs/thq-api/clients/codex.mdx`
- Create: `site/docs/thq-api/clients/claude-code.mdx`
- Create: `site/docs/thq-api/clients/gemini-cli.mdx`

- [ ] **Step 1: Write the client overview**

Create `site/docs/thq-api/clients/index.mdx` with:

```md
# 客户端接入总览
## 选择客户端
## Base URL 怎么填
## API Key 与模型名称
## 配置后如何验证
## 通用排查顺序
```

Include this mapping table:

| 客户端 | 协议 | Base URL |
| --- | --- | --- |
| Codex | OpenAI 兼容 | `https://api.thqllm.com/v1` |
| Claude Code | Claude | `https://api.thqllm.com` |
| Gemini CLI | Gemini | `https://api.thqllm.com/v1beta` |
| VS Code 中的 Codex 类扩展 | OpenAI 兼容 | `https://api.thqllm.com/v1` |
| OpenCode | OpenAI 兼容 | `https://api.thqllm.com/v1` |
| OpenClaw | OpenAI 兼容 | `https://api.thqllm.com/v1` |
| Cherry Studio | OpenAI 兼容 | `https://api.thqllm.com/v1` |

- [ ] **Step 2: Write the Codex guide**

Create `site/docs/thq-api/clients/codex.mdx` with:

```md
# Codex 接入
## 配置前准备
## 安装或更新 Codex
## 配置 THQ API 提供商
## 选择模型
## 验证连接
## 常见问题
## 密钥安全
```

Use `https://api.thqllm.com/v1`, `YOUR_THQ_API_KEY`, and a clearly marked control-panel model placeholder. Link to current official OpenAI Codex configuration documentation for version-specific file names and fields instead of asserting an unverified UI path.

- [ ] **Step 3: Write the Claude Code guide**

Create `site/docs/thq-api/clients/claude-code.mdx` with:

```md
# Claude Code 接入
## 配置前准备
## 安装 Claude Code
## 设置环境变量
## 启动并验证
## 模型与能力
## 常见问题
## 密钥安全
```

The guide must state:

```bash
export ANTHROPIC_BASE_URL="https://api.thqllm.com"
export ANTHROPIC_AUTH_TOKEN="YOUR_THQ_API_KEY"
```

Add a prominent note that the Base URL has no `/v1` suffix. Verify the current authentication variable name against official Claude Code documentation during implementation; if the installed client version requires another official variable, document the supported alternative without changing the Base URL.

- [ ] **Step 4: Write the Gemini CLI guide**

Create `site/docs/thq-api/clients/gemini-cli.mdx` with:

```md
# Gemini CLI 接入
## 配置前准备
## 安装 Gemini CLI
## 配置自定义端点
## 选择模型
## 验证连接
## 常见问题
## 密钥安全
```

The guide must use:

```text
https://api.thqllm.com/v1beta
```

Add a prominent note that `/v1beta` is required for Gemini CLI and must not be replaced by `/v1`.

- [ ] **Step 5: Run endpoint and page-set contract tests**

Run:

```bash
pnpm vitest run src/lib/thq-api-docs.test.ts
```

Expected: protocol-specific Base URL assertions pass; the suite still fails only for the client pages and configuration pages that Task 5 has not created.

- [ ] **Step 6: Commit the core client guides**

```bash
git add \
  site/docs/thq-api/clients/index.mdx \
  site/docs/thq-api/clients/codex.mdx \
  site/docs/thq-api/clients/claude-code.mdx \
  site/docs/thq-api/clients/gemini-cli.mdx
git commit -m "docs: add core THQ API client guides"
```

---

### Task 5: Add Remaining Clients, Manual Configuration, and Endpoint Reference

**Files:**
- Create: `site/docs/thq-api/clients/vscode.mdx`
- Create: `site/docs/thq-api/clients/opencode.mdx`
- Create: `site/docs/thq-api/clients/openclaw.mdx`
- Create: `site/docs/thq-api/clients/cherry-studio.mdx`
- Create: `site/docs/thq-api/configuration.mdx`
- Create: `site/docs/thq-api/endpoints.mdx`

- [ ] **Step 1: Write the VS Code guide**

Create `site/docs/thq-api/clients/vscode.mdx` with:

```md
# VS Code 接入
## 先确认扩展使用的协议
## OpenAI 兼容扩展
## Claude Code 扩展
## 保存并重新加载窗口
## 验证
## 常见问题
```

Do not claim every VS Code AI extension accepts a custom endpoint. Direct users to the extension's official settings and use either the OpenAI-compatible or Claude Code guide according to the protocol.

- [ ] **Step 2: Write OpenCode and OpenClaw guides**

Each page must contain:

```md
## 配置前准备
## 添加 OpenAI 兼容提供商
## 配置模型
## 验证
## 常见问题
## 密钥安全
```

Use `https://api.thqllm.com/v1` and `YOUR_THQ_API_KEY`. Keep version-sensitive configuration-file names behind links to the respective official documentation.

- [ ] **Step 3: Write the Cherry Studio guide**

Create `site/docs/thq-api/clients/cherry-studio.mdx` with:

```md
# Cherry Studio 接入
## 添加自定义提供商
## 填写连接信息
## 添加模型
## 连接检查
## 常见问题
## 密钥安全
```

Use `https://api.thqllm.com/v1` and explain that the model identifier must exactly match the control panel.

- [ ] **Step 4: Write manual configuration templates**

Create `site/docs/thq-api/configuration.mdx` with:

```md
# 手动配置
## 通用 OpenAI 兼容参数
## 环境变量
## curl 验证
## JSON 配置模板
## Claude Code
## Gemini CLI
## 配置保存与重载
## 安全检查
```

Include:

```bash
export OPENAI_API_KEY="YOUR_THQ_API_KEY"
export OPENAI_BASE_URL="https://api.thqllm.com/v1"
```

Include a generic JSON template:

```json
{
  "baseURL": "https://api.thqllm.com/v1",
  "apiKey": "YOUR_THQ_API_KEY",
  "model": "CONTROL_PANEL_MODEL_ID"
}
```

Explain that actual key names vary by client.

- [ ] **Step 5: Write the endpoint reference**

Create `site/docs/thq-api/endpoints.mdx` with:

```md
# 端点说明
## 地址速查
## OpenAI 兼容接口
## Claude Code
## Gemini CLI
## 为什么后缀不同
## 常见填写错误
## 如何确认模型
```

The page must explicitly reject these combinations:

| 错误配置 | 正确配置 |
| --- | --- |
| Claude Code 使用 `https://api.thqllm.com/v1` | `https://api.thqllm.com` |
| Gemini CLI 使用 `https://api.thqllm.com/v1` | `https://api.thqllm.com/v1beta` |
| OpenAI 兼容客户端只填 `https://api.thqllm.com` | `https://api.thqllm.com/v1` |
| 把控制台地址当作 API Base URL | 使用对应的 `api.thqllm.com` 地址 |

- [ ] **Step 6: Run all documentation contract tests and confirm GREEN**

Run:

```bash
pnpm vitest run \
  src/data/projects.test.ts \
  src/lib/project-doc-routes.test.ts \
  src/lib/projects.test.ts \
  src/lib/project-build-manifest.test.ts \
  src/lib/thq-api-docs.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit the remaining documentation**

```bash
git add \
  site/docs/thq-api/clients/vscode.mdx \
  site/docs/thq-api/clients/opencode.mdx \
  site/docs/thq-api/clients/openclaw.mdx \
  site/docs/thq-api/clients/cherry-studio.mdx \
  site/docs/thq-api/configuration.mdx \
  site/docs/thq-api/endpoints.mdx
git commit -m "docs: complete THQ API client and endpoint guides"
```

---

### Task 6: Add Browser Coverage for the Expanded Manual

**Files:**
- Modify: `tests/e2e/docs.spec.ts`
- Modify: `tests/e2e/responsive.spec.ts`

- [ ] **Step 1: Write a failing route-coverage test**

In `tests/e2e/docs.spec.ts`, derive all THQ API routes from the registry:

```ts
import { createProjectDocRoutePath } from '../../src/lib/project-doc-routes';

const thqApiProject = projects.find((project) => project.id === 'thq-api');

if (!thqApiProject?.docs) {
  throw new Error('Missing THQ API documentation registry');
}

const thqApiDocumentationRoutes = thqApiProject.docs.sections.flatMap((section) =>
  section.items.map((item) => ({
    path: createProjectDocRoutePath(thqApiProject.docs!.basePath, item.slug),
    title: item.text,
  })),
);
```

Add:

```ts
for (const route of thqApiDocumentationRoutes) {
  test(`THQ API route ${route.path} is published and linked`, async ({ page }) => {
    await page.goto(route.path);

    await expect(page.locator('main h1')).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: '文档导航' })
        .getByRole('link', { name: route.title, exact: true }),
    ).toHaveAttribute('href');
  });
}
```

- [ ] **Step 2: Add endpoint and search assertions**

Add tests that:

```ts
test('THQ API endpoint reference distinguishes all protocols', async ({ page }) => {
  await page.goto('/docs/thq-api/endpoints');

  await expect(page.getByText('https://api.thqllm.com/v1', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('https://api.thqllm.com/v1beta', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('https://api.thqllm.com', { exact: true }).first()).toBeVisible();
});

test('documentation search finds the Claude Code guide', async ({ page }) => {
  await page.goto('/docs/thq-api/');
  await page.keyboard.press('ControlOrMeta+k');

  const searchInput = page.getByLabel('SearchPanelInput');
  await searchInput.fill('Claude Code 接入');

  await expect(page.getByText(/Claude Code 接入/).first()).toBeVisible();
});
```

- [ ] **Step 3: Add representative responsive and accessibility coverage**

In `tests/e2e/responsive.spec.ts`, add `/docs/thq-api/clients/codex` to `responsivePaths`.

Add:

```ts
test('THQ API Codex guide has no detectable accessibility violations', async ({ page }) => {
  await page.goto('/docs/thq-api/clients/codex');
  await expect(page.getByRole('heading', { level: 1, name: 'Codex 接入' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 4: Run the focused browser tests**

Run:

```bash
pnpm playwright test tests/e2e/docs.spec.ts tests/e2e/responsive.spec.ts
```

Expected: all desktop and mobile tests pass.

- [ ] **Step 5: Commit browser coverage**

```bash
git add tests/e2e/docs.spec.ts tests/e2e/responsive.spec.ts
git commit -m "test: cover expanded THQ API documentation"
```

---

### Task 7: Final Build and Content Verification

**Files:**
- Modify only files required to fix verification failures discovered in this task.

- [ ] **Step 1: Scan the published documentation source**

Run:

```bash
rg -n -i \
  'Wegoo|wegoo\.site|ai\.wegoo\.site|!\[[^]]*]\(|<img\b' \
  site/docs/thq-api
```

Expected: no matches.

- [ ] **Step 2: Scan endpoint usage**

Run:

```bash
rg -n 'https://(?:sub|api)\.thqllm\.com' site/docs/thq-api
```

Expected:

- account and console actions use `sub.thqllm.com`;
- OpenAI-compatible pages use `/v1`;
- Gemini CLI uses `/v1beta`;
- Claude Code uses the bare API origin.

- [ ] **Step 3: Run static checks and unit tests**

Run:

```bash
pnpm check
pnpm typecheck
pnpm test
```

Expected: all commands exit `0`.

- [ ] **Step 4: Build and verify every registered output**

Run:

```bash
pnpm build
pnpm verify:build
```

Expected:

- Rspress exits `0`;
- every registered THQ API route produces HTML and Markdown;
- sitemap, `llms.txt`, and `llms-full.txt` include the new routes;
- build verification exits `0`.

- [ ] **Step 5: Run the full browser suite**

Run:

```bash
pnpm test:e2e
```

Expected: all applicable desktop and mobile Playwright tests pass with zero failures.

- [ ] **Step 6: Inspect representative pages**

Start the local server:

```bash
pnpm dev --host 127.0.0.1 --port 51782
```

Inspect:

```text
http://127.0.0.1:51782/docs/thq-api/
http://127.0.0.1:51782/docs/thq-api/quick-start
http://127.0.0.1:51782/docs/thq-api/clients/codex
http://127.0.0.1:51782/docs/thq-api/clients/claude-code
http://127.0.0.1:51782/docs/thq-api/clients/gemini-cli
http://127.0.0.1:51782/docs/thq-api/endpoints
http://127.0.0.1:51782/docs/thq-api/faq
```

Confirm desktop and mobile layouts have no horizontal overflow, code blocks remain readable, sidebar items are reachable, and external links point to the intended THQ API domains.

- [ ] **Step 7: Commit final verification corrections**

If verification required changes, stage only the documentation-rewrite files:

```bash
git add \
  site/docs/thq-api \
  src/data/project-schema.ts \
  src/data/projects.ts \
  src/data/projects.test.ts \
  src/lib/project-doc-routes.ts \
  src/lib/project-doc-routes.test.ts \
  src/lib/projects.ts \
  src/lib/projects.test.ts \
  src/lib/project-build-manifest.ts \
  src/lib/project-build-manifest.test.ts \
  src/lib/thq-api-docs.test.ts \
  tests/e2e/docs.spec.ts \
  tests/e2e/responsive.spec.ts
git commit -m "fix: finalize THQ API documentation verification"
```

If no changes were needed, do not create an empty commit.
