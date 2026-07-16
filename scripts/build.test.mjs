import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';

import { runBuildWithManifestCleanup } from './build.mjs';

const buildScriptSource = path.join(import.meta.dirname, 'build.mjs');
const temporaryDirectories = new Set();

async function createManifestFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'thqllm-build-wrapper-'));
  const manifestPath = path.join(root, 'doc_build/project-registry.json');
  temporaryDirectories.add(root);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, '{"stale":true}\n');
  return manifestPath;
}

async function waitForFile(filePath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await stat(filePath);
      return;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    await delay(20);
  }

  throw new Error(`Timed out waiting for fixture file: ${filePath}`);
}

function collectOutput(stream) {
  let output = '';
  stream.on('data', (chunk) => {
    output += chunk.toString();
  });
  return () => output;
}

async function waitForExit(child, timeoutMs = 10_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }

  return Promise.race([
    once(child, 'exit').then(([code, signal]) => ({ code, signal })),
    delay(timeoutMs).then(() => {
      throw new Error('Timed out waiting for build wrapper exit');
    }),
  ]);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessGone(pid, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }

    await delay(20);
  }

  return !isProcessAlive(pid);
}

async function terminateProcessTree(pid) {
  if (!pid || !isProcessAlive(pid)) {
    return;
  }

  if (process.platform === 'win32') {
    const taskkill = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    await once(taskkill, 'exit').catch(() => undefined);
    return;
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // The fixture process may have exited while cleanup was requested.
  }
}

async function createSignalFixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'thqllm-build-signal-')));
  const scriptsDirectory = path.join(root, 'scripts');
  const binDirectory = path.join(root, 'bin');
  const buildScript = path.join(scriptsDirectory, 'build.mjs');
  const fakePnpmScript = path.join(scriptsDirectory, 'fake-pnpm.mjs');
  const writerScript = path.join(scriptsDirectory, 'delayed-writer.mjs');
  const manifestPath = path.join(root, 'doc_build/project-registry.json');
  const childPidPath = path.join(root, 'child.pid');
  const writerPidPath = path.join(root, 'writer.pid');
  const signalSentPath = path.join(root, 'signal-sent');
  const wrapperPidPath = path.join(root, 'wrapper.pid');
  const writerArmedPath = path.join(root, 'writer-armed');
  const writerStartedPath = path.join(root, 'writer-started');
  const writerCompletedPath = path.join(root, 'writer-completed');
  const writeDelayMs = 300;

  temporaryDirectories.add(root);
  await mkdir(scriptsDirectory, { recursive: true });
  await mkdir(binDirectory, { recursive: true });
  await copyFile(buildScriptSource, buildScript);
  await writeFile(
    writerScript,
    `
      import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
      import * as path from 'node:path';
      import { setTimeout as delay } from 'node:timers/promises';

      await writeFile(process.env.THQLLM_WRITER_STARTED_PATH, String(process.pid));
      let wrapperPid;
      while (wrapperPid === undefined) {
        try {
          wrapperPid = Number(await readFile(process.env.THQLLM_WRAPPER_PID_PATH, 'utf8'));
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            throw error;
          }
          await delay(10);
        }
      }
      await writeFile(process.env.THQLLM_WRITER_ARMED_PATH, 'armed\\n');
      while (true) {
        try {
          await stat(process.env.THQLLM_SIGNAL_SENT_PATH);
          break;
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            throw error;
          }
        }
        await delay(10);
      }
      while (true) {
        try {
          process.kill(wrapperPid, 0);
          await delay(10);
        } catch {
          break;
        }
      }
      await delay(Number(process.env.THQLLM_WRITER_DELAY_MS));
      await mkdir(path.dirname(process.env.THQLLM_MANIFEST_PATH), { recursive: true });
      await writeFile(process.env.THQLLM_MANIFEST_PATH, '{"late":true}\\n');
      await writeFile(process.env.THQLLM_WRITER_COMPLETED_PATH, 'completed\\n');
    `,
  );
  await writeFile(
    fakePnpmScript,
    `
      import { spawn } from 'node:child_process';
      import { writeFile } from 'node:fs/promises';

      await writeFile(process.env.THQLLM_CHILD_PID_PATH, String(process.pid));
      const writer = spawn(process.execPath, [process.env.THQLLM_WRITER_SCRIPT], {
        env: process.env,
        stdio: 'ignore',
      });
      await writeFile(process.env.THQLLM_WRITER_PID_PATH, String(writer.pid));
      const { code, signal } = await new Promise((resolve, reject) => {
        writer.once('error', reject);
        writer.once('exit', (code, signal) => resolve({ code, signal }));
      });
      process.exitCode = code ?? (signal ? 1 : 0);
    `,
  );

  if (process.platform === 'win32') {
    await writeFile(
      path.join(binDirectory, 'pnpm.cmd'),
      `@"${process.execPath}" "${fakePnpmScript}" %*\r\n`,
    );
  } else {
    const fakePnpmCommand = path.join(binDirectory, 'pnpm');
    await writeFile(
      fakePnpmCommand,
      `#!/bin/sh\nexec "${process.execPath}" "${fakePnpmScript}" "$@"\n`,
    );
    await chmod(fakePnpmCommand, 0o755);
  }

  return {
    buildScript,
    childPidPath,
    env: {
      ...process.env,
      PATH: `${binDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
      THQLLM_CHILD_PID_PATH: childPidPath,
      THQLLM_MANIFEST_PATH: manifestPath,
      THQLLM_SIGNAL_SENT_PATH: signalSentPath,
      THQLLM_WRITER_COMPLETED_PATH: writerCompletedPath,
      THQLLM_WRITER_DELAY_MS: String(writeDelayMs),
      THQLLM_WRITER_ARMED_PATH: writerArmedPath,
      THQLLM_WRITER_PID_PATH: writerPidPath,
      THQLLM_WRITER_SCRIPT: writerScript,
      THQLLM_WRITER_STARTED_PATH: writerStartedPath,
      THQLLM_WRAPPER_PID_PATH: wrapperPidPath,
    },
    manifestPath,
    root,
    signalSentPath,
    writeDelayMs,
    writerCompletedPath,
    writerArmedPath,
    writerPidPath,
    writerStartedPath,
    wrapperPidPath,
  };
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

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])(
    'stops the real build process tree and removes late manifest writes on %s',
    async (signal, expectedExitCode) => {
      const fixture = await createSignalFixture();
      const wrapper = spawn(process.execPath, [fixture.buildScript], {
        cwd: fixture.root,
        env: fixture.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const readStdout = collectOutput(wrapper.stdout);
      const readStderr = collectOutput(wrapper.stderr);
      let childPid;
      let writerPid;

      try {
        await writeFile(fixture.wrapperPidPath, String(wrapper.pid));
        try {
          await waitForFile(fixture.writerArmedPath);
        } catch (error) {
          throw new Error(`${error.message}\nstdout:\n${readStdout()}\nstderr:\n${readStderr()}`);
        }
        childPid = Number(await readFile(fixture.childPidPath, 'utf8'));
        writerPid = Number(await readFile(fixture.writerPidPath, 'utf8'));

        await writeFile(fixture.signalSentPath, 'signal\n');
        wrapper.kill(signal);
        await delay(25);
        wrapper.kill(signal);

        const result = await waitForExit(wrapper);
        expect(result, `stdout:\n${readStdout()}\nstderr:\n${readStderr()}`).toEqual({
          code: expectedExitCode,
          signal: null,
        });
        expect.soft(await waitForProcessGone(childPid)).toBe(true);
        expect.soft(await waitForProcessGone(writerPid)).toBe(true);

        await delay(fixture.writeDelayMs + 300);

        await expect(readFile(fixture.manifestPath, 'utf8')).rejects.toMatchObject({
          code: 'ENOENT',
        });
        await expect(readFile(fixture.writerCompletedPath, 'utf8')).rejects.toMatchObject({
          code: 'ENOENT',
        });
      } finally {
        if (wrapper.exitCode === null && wrapper.signalCode === null) {
          wrapper.kill('SIGKILL');
          await waitForExit(wrapper).catch(() => undefined);
        }
        await terminateProcessTree(childPid);
        await terminateProcessTree(writerPid);
      }
    },
    20_000,
  );
});
