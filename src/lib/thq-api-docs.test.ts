import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projects } from '../data/projects';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const docsRoot = path.join(repoRoot, 'site/docs/thq-api');
const thqApiProject = projects.find((project) => project.id === 'thq-api');

if (!thqApiProject?.docs) {
  throw new Error('Missing THQ API documentation registry');
}

const docFiles = thqApiProject.docs.sections.flatMap((section) =>
  section.items.map((item) => `${item.slug}.mdx`),
);

type DocFile = string;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasExactConfigLine(content: string, expectedLine: string) {
  const flexibleWhitespace = expectedLine.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
  const exactLine = new RegExp(`^\\s*${flexibleWhitespace}\\s*$`, 'm');

  return exactLine.test(content);
}

function hasShellAssignment(content: string, name: string, expectedValue: string) {
  const escapedName = escapeRegExp(name);
  const escapedValue = escapeRegExp(expectedValue);
  const assignment = new RegExp(
    `^\\s*(?:export\\s+)?${escapedName}\\s*=\\s*(?:"${escapedValue}"|'${escapedValue}'|${escapedValue})\\s*$`,
    'm',
  );

  return assignment.test(content);
}

type FencedCodeBlock = {
  info: string;
  content: string;
  startLine: number;
};

function parseFencedCodeBlocks(content: string): FencedCodeBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: FencedCodeBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index]?.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);

    if (opening === null || opening === undefined) {
      continue;
    }

    const marker = opening[1];
    const markerCharacter = marker[0];
    const closing = new RegExp(`^ {0,3}${escapeRegExp(markerCharacter)}{${marker.length},}\\s*$`);
    const blockLines: string[] = [];
    const contentStartLine = index + 2;

    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index] ?? '';

      if (closing.test(line)) {
        break;
      }

      blockLines.push(line);
    }

    blocks.push({
      info: (opening[2] ?? '').trim(),
      content: blockLines.join('\n'),
      startLine: contentStartLine,
    });
  }

  return blocks;
}

function findFencedCodeBlock(content: string, exactInfo: string) {
  return parseFencedCodeBlocks(content).find(({ info }) => info === exactInfo);
}

function recommendedConfigMatches(
  content: string,
  exactInfo: string,
  matcher: (block: FencedCodeBlock) => boolean,
) {
  const block = findFencedCodeBlock(content, exactInfo);

  return block !== undefined && matcher(block);
}

type CredentialViolation = {
  line: number;
  name: string;
};

const credentialVariableNames = [
  'THQ_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
] as const;
const credentialVariablePattern = credentialVariableNames.map(escapeRegExp).join('|');
const allowedCredentialReference =
  /YOUR_THQ_API_KEY|\$(?:THQ_API_KEY|\{THQ_API_KEY\})|\{env:THQ_API_KEY\}|process\.env\.THQ_API_KEY/;

function findCredentialViolations(content: string): CredentialViolation[] {
  return parseFencedCodeBlocks(content).flatMap((block) =>
    block.content.split(/\r?\n/).flatMap((line, lineIndex) => {
      const shellAssignment = line.match(
        new RegExp(`^\\s*(?:export\\s+)?(${credentialVariablePattern})\\s*=\\s*(.+?)\\s*$`),
      );
      const fieldAssignment = line.match(
        /^\s*(?:[{,]\s*)?["']?(apiKey|api_key)["']?\s*[:=]\s*(.+?)\s*(?:[,}]\s*)?$/,
      );
      const assignment = shellAssignment ?? fieldAssignment;

      if (!assignment || allowedCredentialReference.test(assignment[2] ?? '')) {
        return [];
      }

      return [
        {
          line: block.startLine + lineIndex,
          name: assignment[1] ?? 'credential',
        },
      ];
    }),
  );
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function collectMdxFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        return collectMdxFiles(path.join(directory, entry.name), relativePath);
      }

      return entry.isFile() && entry.name.endsWith('.mdx') ? [relativePath] : [];
    }),
  );

  return files.flat().toSorted();
}

async function docExists(relativePath: DocFile) {
  try {
    await access(path.join(docsRoot, relativePath));
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

async function readDocIfPresent(relativePath: DocFile) {
  try {
    return await readFile(path.join(docsRoot, relativePath), 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function readExistingDocs() {
  const actualFiles = await collectMdxFiles(docsRoot);
  const docs = await Promise.all(
    actualFiles.map(async (relativePath) => ({
      relativePath,
      content: await readDocIfPresent(relativePath),
    })),
  );

  return docs.filter(
    (doc): doc is { relativePath: DocFile; content: string } => doc.content !== undefined,
  );
}

describe('THQ API endpoint contract matchers', () => {
  it('does not find a recommended configuration when only an error example exists', () => {
    const content = [
      '```toml title="错误示例"',
      'base_url = "https://api.thqllm.com/v1"',
      '```',
    ].join('\n');

    expect(findFencedCodeBlock(content, 'toml title="推荐配置"')).toBeUndefined();
  });

  it('validates endpoint contracts only against the recommended configuration block', () => {
    const content = [
      '```toml title="错误示例"',
      'base_url = "https://api.thqllm.com/v1"',
      '```',
      '',
      '```toml title="推荐配置"',
      'base_url = "https://api.thqllm.com/v1beta"',
      '```',
    ].join('\n');

    expect(
      recommendedConfigMatches(content, 'toml title="推荐配置"', (block) =>
        hasExactConfigLine(block.content, 'base_url = "https://api.thqllm.com/v1"'),
      ),
    ).toBe(false);
  });

  it('accepts the exact Codex v1 base URL configuration line', () => {
    const validCodexConfig = '  base_url   =   "https://api.thqllm.com/v1"  ';

    expect(hasExactConfigLine(validCodexConfig, 'base_url = "https://api.thqllm.com/v1"')).toBe(
      true,
    );
  });

  it('does not accept a Codex v1beta base URL as the v1 configuration', () => {
    const invalidCodexConfig = 'base_url = "https://api.thqllm.com/v1beta"';

    expect(hasExactConfigLine(invalidCodexConfig, 'base_url = "https://api.thqllm.com/v1"')).toBe(
      false,
    );
  });

  it('accepts quoted or exported shell assignments with the exact value', () => {
    expect(
      hasShellAssignment(
        'export GOOGLE_GEMINI_BASE_URL="https://api.thqllm.com"',
        'GOOGLE_GEMINI_BASE_URL',
        'https://api.thqllm.com',
      ),
    ).toBe(true);
    expect(
      hasShellAssignment("GOOGLE_GENAI_API_VERSION='v1beta'", 'GOOGLE_GENAI_API_VERSION', 'v1beta'),
    ).toBe(true);
  });

  it('does not accept a Gemini base host that already includes the API version', () => {
    expect(
      hasShellAssignment(
        'GOOGLE_GEMINI_BASE_URL=https://api.thqllm.com/v1beta',
        'GOOGLE_GEMINI_BASE_URL',
        'https://api.thqllm.com',
      ),
    ).toBe(false);
  });

  it('allows placeholders, environment references, and env_key declarations', () => {
    const content = [
      '```bash',
      'export THQ_API_KEY="YOUR_THQ_API_KEY"',
      'OPENAI_API_KEY=$THQ_API_KEY',
      'ANTHROPIC_AUTH_TOKEN=$' + '{THQ_API_KEY}',
      'ANTHROPIC_API_KEY={env:THQ_API_KEY}',
      '```',
      '```toml',
      'env_key = "THQ_API_KEY"',
      'api_key = "$' + '{THQ_API_KEY}"',
      '```',
      '```json',
      '{ "apiKey": "{env:THQ_API_KEY}" }',
      '```',
    ].join('\n');

    expect(findCredentialViolations(content)).toEqual([]);
  });

  it('reports literal credentials with their source lines', () => {
    const content = [
      '# Example',
      '```bash',
      'GEMINI_API_KEY=demo-secret',
      '```',
      '```json',
      '{ "apiKey": "sk-1234567890abcdefghijkl" }',
      '```',
    ].join('\n');

    expect(findCredentialViolations(content)).toEqual([
      { line: 3, name: 'GEMINI_API_KEY' },
      { line: 6, name: 'apiKey' },
    ]);
  });
});

describe('THQ API documentation contract', () => {
  it('publishes exactly the pages registered for THQ API', async () => {
    expect(await collectMdxFiles(docsRoot)).toEqual([...docFiles].toSorted());
  });

  it.each(docFiles)('publishes %s', async (relativePath) => {
    expect(
      await docExists(relativePath),
      `${relativePath} must exist under site/docs/thq-api`,
    ).toBe(true);
  });

  it('contains no deprecated Wegoo branding in published documents', async () => {
    const violations = (await readExistingDocs())
      .filter(({ content }) => /wegoo/i.test(content))
      .map(({ relativePath }) => relativePath);

    expect(violations, `Deprecated Wegoo branding found in: ${violations.join(', ')}`).toEqual([]);
  });

  it('contains no Markdown or HTML images in published documents', async () => {
    const markdownImage = /!\[[^\]]*]/i;
    const htmlImage = /<img\b/i;
    const violations = (await readExistingDocs())
      .filter(({ content }) => markdownImage.test(content) || htmlImage.test(content))
      .map(({ relativePath }) => relativePath);

    expect(violations, `Markdown or HTML images found in: ${violations.join(', ')}`).toEqual([]);
  });

  it('contains no remote PNG, JPEG, or WebP URLs in published documents', async () => {
    const remoteRasterImage = /https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|webp)(?:[?#][^\s"'<>]*)?/i;
    const violations = (await readExistingDocs())
      .filter(({ content }) => remoteRasterImage.test(content))
      .map(({ relativePath }) => relativePath);

    expect(violations, `Remote raster image URLs found in: ${violations.join(', ')}`).toEqual([]);
  });

  it('contains no API keys that resemble real sk- credentials', async () => {
    const suspiciousApiKey = /\bsk-[a-z0-9_-]{16,}\b/i;
    const violations = (await readExistingDocs())
      .filter(({ content }) => suspiciousApiKey.test(content))
      .map(({ relativePath }) => relativePath);

    expect(violations, `Possible real sk- API keys found in: ${violations.join(', ')}`).toEqual([]);
  });

  it('uses only placeholders or environment references in credential examples', async () => {
    const violations = (await readExistingDocs()).flatMap(({ content, relativePath }) =>
      findCredentialViolations(content).map((violation) => ({
        ...violation,
        relativePath,
      })),
    );

    expect(
      violations,
      `Literal credentials found in code blocks: ${violations
        .map(({ line, name, relativePath }) => `${relativePath}:${line} (${name})`)
        .join(', ')}`,
    ).toEqual([]);
  });

  it('uses the canonical API key placeholder', async () => {
    const combinedContent = (await readExistingDocs()).map(({ content }) => content).join('\n');

    expect(
      combinedContent,
      'The THQ API documentation must include the placeholder YOUR_THQ_API_KEY',
    ).toContain('YOUR_THQ_API_KEY');
  });

  it('uses the Codex API endpoint in the Codex client guide', async () => {
    const content = await readDocIfPresent('clients/codex.mdx');

    if (content === undefined) {
      return;
    }

    expect(
      recommendedConfigMatches(content, 'toml title="推荐配置"', (block) => {
        return (
          hasExactConfigLine(block.content, 'base_url = "https://api.thqllm.com/v1"') &&
          hasExactConfigLine(block.content, 'wire_api = "responses"')
        );
      }),
    ).toBe(true);
  });

  it('uses the Gemini v1beta endpoint in the Gemini CLI guide', async () => {
    const content = await readDocIfPresent('clients/gemini-cli.mdx');

    if (content === undefined) {
      return;
    }

    expect(
      recommendedConfigMatches(content, 'bash title="推荐配置"', (block) => {
        return (
          hasShellAssignment(block.content, 'GOOGLE_GEMINI_BASE_URL', 'https://api.thqllm.com') &&
          hasShellAssignment(block.content, 'GOOGLE_GENAI_API_VERSION', 'v1beta')
        );
      }),
    ).toBe(true);
    expect(content).toContain('https://api.thqllm.com/v1beta');
  });

  it('uses the unversioned API origin in the Claude Code guide', async () => {
    const content = await readDocIfPresent('clients/claude-code.mdx');

    if (content === undefined) {
      return;
    }

    expect(
      recommendedConfigMatches(content, 'bash title="推荐配置"', (block) =>
        hasShellAssignment(block.content, 'ANTHROPIC_BASE_URL', 'https://api.thqllm.com'),
      ),
    ).toBe(true);
  });

  it('links the subscription console from the overview, quick start, or account guide', async () => {
    const combinedContent = (
      await Promise.all(
        (['index.mdx', 'quick-start.mdx', 'account.mdx'] as const).map(readDocIfPresent),
      )
    )
      .filter((content): content is string => content !== undefined)
      .join('\n');

    expect(combinedContent).toContain('https://sub.thqllm.com');
  });
});
