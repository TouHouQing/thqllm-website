import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const manifestPath = path.join(repoRoot, 'doc_build/project-registry.json');

export async function runBuildWithManifestCleanup(manifestOutputPath, executeBuild) {
  await rm(manifestOutputPath, { force: true });

  try {
    const exitCode = await executeBuild();

    if (exitCode !== 0) {
      await rm(manifestOutputPath, { force: true });
    }

    return exitCode;
  } catch (error) {
    await rm(manifestOutputPath, { force: true });
    throw error;
  }
}

function executeRspressBuild(args) {
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

  return new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand, ['exec', 'rspress', 'build', ...args], {
      cwd: repoRoot,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const exitCode = await runBuildWithManifestCleanup(manifestPath, () =>
    executeRspressBuild(process.argv.slice(2)),
  );

  process.exitCode = exitCode;
}
