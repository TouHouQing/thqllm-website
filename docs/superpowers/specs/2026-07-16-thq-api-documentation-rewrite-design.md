# THQ API 文档重构设计

## 背景

THQ API 当前只有概览、快速开始、常见问题和更新记录四个简略页面，无法覆盖账号接入、客户端配置、端点选择、计费核对和错误排查等常见任务。

本次重构参考 `https://docs.wegoo.site/guide/` 的信息组织方式和使用场景，但不复制其品牌文案、价格、分组名称、活动规则、服务承诺或仅适用于 Wegoo 的产品能力。所有内容必须围绕 THQ API 重新撰写，并以 `sub.thqllm.com` 可公开确认的实际配置为准。

## 目标

- 为首次使用者提供从注册到完成首个请求的连续路径。
- 为常见 AI 编程和聊天客户端提供可直接操作的配置指南。
- 明确不同协议使用的 Base URL，避免路径后缀填写错误。
- 将动态信息和静态指南分离，价格、模型、额度与可用分组以控制台为准。
- 保持 THQLLM 官网现有视觉语言、文档组件和静态构建方式。
- 让所有新增页面可被侧边栏、站内搜索、站点地图和 LLM 文档索引发现。

## 非目标

- 不复制参考站点的原文或完整页面。
- 不复刻 Wegoo 的分组体系、价格、邀请活动、返利规则或质保承诺。
- 不替 THQ API 控制台实现登录、充值、密钥管理或请求代理功能。
- 不在仓库中保存真实 API Key、账户余额、订单号、用户邮箱或其他敏感信息。
- 不猜测无法公开确认的控制台深层 URL、按钮名称或后台能力。

## 地址规则

文档必须区分控制台地址与 API Base URL：

| 场景 | 地址 |
| --- | --- |
| 控制台、注册、登录、密钥、额度与使用记录 | `https://sub.thqllm.com` |
| OpenAI 兼容接口、Codex、OpenCode、OpenClaw、Cherry Studio 等 | `https://api.thqllm.com/v1` |
| Gemini CLI | `https://api.thqllm.com/v1beta` |
| Claude Code | `https://api.thqllm.com` |

代码示例中的密钥统一使用 `YOUR_THQ_API_KEY` 或环境变量占位符。模型名称使用控制台可选模型占位符，或明确提醒用户从控制台复制，避免把动态模型列表写死。

## 信息架构

### 1. 概览

路径：`/docs/thq-api/`

说明 THQ API 的用途、适用场景、三类 Base URL、文档导航和安全原则。概览不承担完整教程职责。

### 2. 开始接入

路径：`/docs/thq-api/quick-start/`

覆盖注册与登录、确认服务条款、获取额度、创建 API Key、选择模型、使用 `curl` 完成最小请求、查看使用记录和下一步入口。

### 3. 客户端总览

路径：`/docs/thq-api/clients/`

按客户端列出所用协议、Base URL、配置方式和对应详细文档。解释 Base URL、API Key、模型名称之间的关系。

### 4. AI 编程客户端

新增以下独立页面：

- `/docs/thq-api/clients/codex/`
- `/docs/thq-api/clients/claude-code/`
- `/docs/thq-api/clients/gemini-cli/`
- `/docs/thq-api/clients/vscode/`
- `/docs/thq-api/clients/opencode/`
- `/docs/thq-api/clients/openclaw/`

每页采用统一结构：

1. 适用场景
2. 前置条件
3. 安装或打开客户端
4. 配置项与 Base URL
5. 配置示例
6. 验证方法
7. 常见错误
8. 安全提醒

涉及第三方客户端安装、配置文件位置和字段名称时，以其官方文档为事实来源。无法稳定确认的版本相关 UI 不写死。

### 5. 聊天客户端

路径：`/docs/thq-api/clients/cherry-studio/`

介绍 OpenAI 兼容提供商配置、Base URL、API Key、模型添加与连接测试。仅描述稳定配置概念，不照搬参考站截图。

### 6. 手动配置与端点

新增：

- `/docs/thq-api/configuration/`
- `/docs/thq-api/endpoints/`

手动配置页提供环境变量、`curl`、JSON 配置片段和常见字段模板。端点页集中解释 OpenAI 兼容、Claude 和 Gemini 三类地址规则，以及何时需要或不需要 `/v1`、`/v1beta`。

### 7. 账户、计费与使用记录

路径：`/docs/thq-api/account/`

说明余额、额度、扣费和使用记录的核对方法。所有费率、兑换比例、有效期、退款和活动规则均指向控制台当前展示，不写入未经确认的固定数字。

### 8. 常见问题与排错

路径：`/docs/thq-api/faq/`

按症状组织：

- 401：密钥无效、认证头错误或密钥被禁用。
- 403：账户、策略或服务条款限制。
- 404：Base URL、路径后缀、模型名称或协议不匹配。
- 429：额度、速率、并发或上游限制。
- 5xx：网关、渠道或上游服务异常。
- 客户端无响应：配置未重载、代理、证书或网络问题。

排错流程先验证地址，再验证 Key，再验证模型，最后检查控制台使用记录和服务状态。

### 9. 更新记录

路径：`/docs/thq-api/changelog/`

记录本次文档体系重构及后续重要文档变化，不伪造产品发布时间或功能历史。

## 截图策略

- 仅使用从 `sub.thqllm.com` 获取的公开页面截图，或用户已授权且不含敏感信息的登录后页面截图。
- 截图必须隐藏或裁掉邮箱、账户 ID、余额、订单、邀请信息、完整 API Key 和其他个人数据。
- 无法从 THQ API 获取等价截图时，删除参考站截图，改用步骤、表格或代码示例。
- 不下载、不重新发布 Wegoo 的品牌截图。
- 截图不是完成文档的前置条件；准确、可维护的文字说明优先。

## 导航与构建集成

- 扩展 THQ API 的侧边栏，使新增页面按“开始接入、客户端、配置与端点、账户与排错”分组展示。
- 保持其他项目文档的导航不变。
- 新增页面必须进入 Rspress 静态输出、Sitemap、站内搜索、`llms.txt` 和 Markdown 输出。
- 更新项目构建清单和验证测试，确保所有配置路由生成对应 `index.html`。
- 所有内部链接使用站内绝对路径，外部控制台链接使用 HTTPS。

## 内容风格

- 使用简体中文，句子直接、步骤明确。
- 先给推荐配置，再解释原因和替代方案。
- 使用表格呈现客户端、协议和 Base URL 的对应关系。
- 配置示例必须可复制，但不包含真实凭据。
- 动态信息统一写为“以控制台当前显示为准”，避免频繁过期。
- 每页只保留对完成任务有帮助的安全提示，不重复堆叠免责声明。

## 验证标准

- 所有 THQ API 页面构建成功且无死链。
- 实际发布的 THQ API 页面中不存在 `wegoo.site`、`ai.wegoo.site`、Wegoo 品牌名或其图片地址；设计说明可保留参考来源记录。
- 控制台链接统一指向 `https://sub.thqllm.com`。
- OpenAI 兼容示例统一使用 `https://api.thqllm.com/v1`。
- Gemini CLI 示例统一使用 `https://api.thqllm.com/v1beta`。
- Claude Code 示例统一使用 `https://api.thqllm.com`，不附加 `/v1`。
- 仓库中不存在疑似真实 API Key。
- 新增页面在桌面和移动端均可通过侧边栏访问。
- `pnpm check`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm verify:build` 和相关 Playwright 测试通过。

## 实施边界

实施按独立任务推进：

1. 建立页面清单、导航与构建契约。
2. 重写概览、快速开始、账户与 FAQ。
3. 编写客户端总览、Codex、Claude Code 与 Gemini CLI。
4. 编写 VS Code、OpenCode、OpenClaw 与 Cherry Studio。
5. 编写手动配置、端点和更新记录。
6. 处理允许使用的 THQ API 截图；没有合适截图则保持纯文本。
7. 完成静态构建、链接、内容、响应式与浏览器验收。
