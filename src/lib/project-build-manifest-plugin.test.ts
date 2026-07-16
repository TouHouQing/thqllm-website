import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { projects } from '../data/projects';
import {
  createProjectBuildManifest,
  serializeProjectBuildManifest,
} from './project-build-manifest';
import { createProjectBuildManifestPlugin } from './project-build-manifest-plugin';

const temporaryDirectories = new Set<string>();

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'thqllm-project-manifest-'));
  temporaryDirectories.add(directory);
  return directory;
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

describe('project build manifest plugin', () => {
  it('removes stale output before build and atomically writes the current manifest after build', async () => {
    const outDir = await createTemporaryDirectory();
    const manifest = createProjectBuildManifest(projects);
    const plugin = createProjectBuildManifestPlugin(manifest);
    const manifestPath = path.join(outDir, 'project-registry.json');

    await writeFile(manifestPath, '{"stale":true}\n');
    await plugin.beforeBuild?.({ outDir }, true);

    await expect(readFile(manifestPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    await plugin.afterBuild?.({ outDir }, true);

    expect(await readFile(manifestPath, 'utf8')).toBe(serializeProjectBuildManifest(manifest));
    expect(await readdir(outDir)).toEqual(['project-registry.json']);
  });

  it('rejects a production build without an explicit output directory', async () => {
    const plugin = createProjectBuildManifestPlugin(createProjectBuildManifest(projects));

    await expect(plugin.afterBuild?.({}, true)).rejects.toThrow(
      'Project build manifest plugin requires an explicit Rspress outDir.',
    );
  });
});
