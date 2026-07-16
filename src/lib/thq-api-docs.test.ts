import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const docsRoot = path.join(repoRoot, 'site/docs/thq-api');
const docFiles = [
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

type DocFile = (typeof docFiles)[number];

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

function isMissingFileError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
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
  const docs = await Promise.all(
    docFiles.map(async (relativePath) => ({
      relativePath,
      content: await readDocIfPresent(relativePath),
    })),
  );

  return docs.filter(
    (doc): doc is { relativePath: DocFile; content: string } => doc.content !== undefined,
  );
}

describe('THQ API endpoint contract matchers', () => {
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
});

describe('THQ API documentation contract', () => {
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

    expect(hasExactConfigLine(content, 'base_url = "https://api.thqllm.com/v1"')).toBe(true);
    expect(hasExactConfigLine(content, 'wire_api = "responses"')).toBe(true);
  });

  it('uses the Gemini v1beta endpoint in the Gemini CLI guide', async () => {
    const content = await readDocIfPresent('clients/gemini-cli.mdx');

    if (content === undefined) {
      return;
    }

    expect(hasShellAssignment(content, 'GOOGLE_GEMINI_BASE_URL', 'https://api.thqllm.com')).toBe(
      true,
    );
    expect(hasShellAssignment(content, 'GOOGLE_GENAI_API_VERSION', 'v1beta')).toBe(true);
    expect(content).toContain('https://api.thqllm.com/v1beta');
  });

  it('uses the unversioned API origin in the Claude Code guide', async () => {
    const content = await readDocIfPresent('clients/claude-code.mdx');

    if (content === undefined) {
      return;
    }

    expect(content).toContain('https://api.thqllm.com');
    expect(content).not.toMatch(/https:\/\/api\.thqllm\.com\/v1(?:beta)?(?:\b|\/)/i);
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
