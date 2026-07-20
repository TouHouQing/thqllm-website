import { projectListSchema } from './project-schema';

export const projects = projectListSchema.parse([
  {
    id: 'thq-api',
    name: 'THQ API',
    stageLabel: 'STAGE 01',
    categoryLabel: 'AI API GATEWAY',
    description:
      '面向个人开发者与团队的 AI 大模型中转站，提供企业级 API 网关、Codex、GPT、Claude 等模型接入与 OpenAI 兼容调用。',
    externalUrl: 'https://sub.thqllm.com/',
    docs: {
      basePath: '/docs/thq-api/',
      sections: [
        {
          text: '开始接入',
          items: [
            { text: '概览', slug: 'index' },
            { text: 'THQ Switch 专属 App', slug: 'thq-switch' },
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
          ],
        },
      ],
    },
    accent: 'cyan',
    tags: ['AI 大模型', '大模型中转站', 'Codex / GPT / Claude', 'OpenAI 兼容'],
    order: 1,
    featured: true,
  },
  {
    id: 'fluctgraph',
    name: 'FluctGraph',
    stageLabel: 'STAGE 02',
    categoryLabel: 'KNOWLEDGE GRAPH',
    description: '面向 AI IDE 和 Agent 工作流的私有知识图谱接入层。',
    externalUrl: 'https://graph.thqllm.com/',
    docs: {
      basePath: '/docs/fluctgraph/',
      sections: [
        {
          text: '开始',
          items: [
            { text: '概览', slug: 'index' },
            { text: '快速开始', slug: 'quick-start' },
          ],
        },
        {
          text: '参考',
          items: [{ text: '常见问题', slug: 'faq' }],
        },
      ],
    },
    accent: 'vermilion',
    tags: ['知识图谱', 'MCP', 'Agent'],
    order: 2,
    featured: true,
  },
  {
    id: 'toho-image-studio',
    name: 'Toho Image Studio',
    stageLabel: 'EXTRA STAGE',
    categoryLabel: 'IMAGE WORKSPACE',
    description: '面向图像生成与编辑工作流的浏览器创作空间。',
    externalUrl: 'https://img.thqllm.com/',
    docs: {
      basePath: '/docs/toho-image-studio/',
      sections: [
        {
          text: '开始',
          items: [
            { text: '概览', slug: 'index' },
            { text: '快速开始', slug: 'quick-start' },
          ],
        },
        {
          text: '参考',
          items: [{ text: '常见问题', slug: 'faq' }],
        },
      ],
    },
    accent: 'gold',
    tags: ['图像生成', '图像编辑', '提示词'],
    order: 3,
    featured: true,
  },
]);
