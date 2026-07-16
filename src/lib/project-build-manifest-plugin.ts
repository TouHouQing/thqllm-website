import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { RspressPlugin, UserConfig } from '@rspress/core';

import {
  PROJECT_BUILD_MANIFEST_FILENAME,
  type ProjectBuildManifest,
  serializeProjectBuildManifest,
} from './project-build-manifest';

function resolveOutDir(config: UserConfig): string {
  if (typeof config.outDir !== 'string' || !config.outDir.trim()) {
    throw new Error('Project build manifest plugin requires an explicit Rspress outDir.');
  }

  return config.outDir;
}

export function createProjectBuildManifestPlugin(manifest: ProjectBuildManifest): RspressPlugin {
  const manifestContent = serializeProjectBuildManifest(manifest);

  return {
    name: 'thqllm-project-build-manifest',
    async beforeBuild(config, isProd) {
      if (!isProd) {
        return;
      }

      const manifestPath = path.join(resolveOutDir(config), PROJECT_BUILD_MANIFEST_FILENAME);
      await rm(manifestPath, { force: true });
    },
    async afterBuild(config, isProd) {
      if (!isProd) {
        return;
      }

      const outDir = resolveOutDir(config);
      const manifestPath = path.join(outDir, PROJECT_BUILD_MANIFEST_FILENAME);
      const temporaryPath = path.join(
        outDir,
        `.${PROJECT_BUILD_MANIFEST_FILENAME}.${process.pid}.tmp`,
      );

      await mkdir(outDir, { recursive: true });
      await rm(temporaryPath, { force: true });

      try {
        await writeFile(temporaryPath, manifestContent, {
          encoding: 'utf8',
          flag: 'wx',
        });
        await rename(temporaryPath, manifestPath);
      } catch (error) {
        await rm(temporaryPath, { force: true });
        await rm(manifestPath, { force: true });
        throw error;
      }
    },
  };
}
