import { projectListSchema } from './project-schema';

export const projects = projectListSchema.parse([
  {
    id: 'fluctgraph',
    name: 'FluctGraph',
    stageLabel: 'STAGE 01',
    categoryLabel: 'KNOWLEDGE GRAPH',
    description: '面向 AI IDE 和 Agent 工作流的私有知识图谱接入层。',
    externalUrl: 'https://graph.tohoqing.com/',
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
          items: [
            { text: '常见问题', slug: 'faq' },
            { text: '更新记录', slug: 'changelog' },
          ],
        },
      ],
    },
    accent: 'vermilion',
    tags: ['知识图谱', 'MCP', 'Agent'],
    order: 1,
    featured: true,
  },
  {
    id: 'thq-api',
    name: 'THQ API',
    stageLabel: 'STAGE 02',
    categoryLabel: 'AI API GATEWAY',
    description: '统一连接多种模型能力的 AI API Gateway 与中转服务。',
    externalUrl: 'https://sub.thqllm.com/',
    docs: {
      basePath: '/docs/thq-api/',
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
          items: [
            { text: '常见问题', slug: 'faq' },
            { text: '更新记录', slug: 'changelog' },
          ],
        },
      ],
    },
    accent: 'cyan',
    tags: ['模型中转', 'API', 'OpenAI 兼容'],
    order: 2,
    featured: true,
  },
  {
    id: 'toho-image-studio',
    name: 'Toho Image Studio',
    stageLabel: 'EXTRA STAGE',
    categoryLabel: 'IMAGE WORKSPACE',
    description: '面向图像生成与编辑工作流的浏览器创作空间。',
    externalUrl: 'https://img.tohoqing.com/',
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
          items: [
            { text: '常见问题', slug: 'faq' },
            { text: '更新记录', slug: 'changelog' },
          ],
        },
      ],
    },
    accent: 'gold',
    tags: ['图像生成', '图像编辑', '提示词'],
    order: 3,
    featured: true,
  },
]);
