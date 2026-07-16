import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runBuildWithManifestCleanup } from './build.mjs';

const temporaryDirectories = new Set();

async function createManifestFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'thqllm-build-wrapper-'));
  const manifestPath = path.join(root, 'doc_build/project-registry.json');
  temporaryDirectories.add(root);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, '{"stale":true}\n');
  return manifestPath;
}

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
  temporaryDirectories.clear();
});

describe('Rspress build manifest cleanup wrapper', () => {
  it('removes stale output before build and preserves the new manifest after success', async () => {
    const manifestPath = await createManifestFixture();

    const exitCode = await runBuildWithManifestCleanup(manifestPath, async () => {
      await expect(readFile(manifestPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await writeFile(manifestPath, '{"current":true}\n');
      return 0;
    });

    expect(exitCode).toBe(0);
    expect(await readFile(manifestPath, 'utf8')).toBe('{"current":true}\n');
  });

  it('removes a partially generated manifest when the build fails', async () => {
    const manifestPath = await createManifestFixture();

    const exitCode = await runBuildWithManifestCleanup(manifestPath, async () => {
      await expect(readFile(manifestPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await writeFile(manifestPath, '{"partial":true}\n');
      return 1;
    });

    expect(exitCode).toBe(1);
    await expect(readFile(manifestPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes a partially generated manifest when the build throws', async () => {
    const manifestPath = await createManifestFixture();

    await expect(
      runBuildWithManifestCleanup(manifestPath, async () => {
        await writeFile(manifestPath, '{"partial":true}\n');
        throw new Error('synthetic build failure');
      }),
    ).rejects.toThrow('synthetic build failure');

    await expect(readFile(manifestPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
