import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const manifestPath = path.join(repoRoot, 'doc_build/project-registry.json');
const shutdownGracePeriodMs = 500;
const shutdownForcePeriodMs = 1_500;
const shutdownPollIntervalMs = 20;

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

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const finish = (didExit) => {
      clearTimeout(timer);
      child.off('exit', handleExit);
      resolve(didExit);
    };
    const handleExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);

    child.once('exit', handleExit);
  });
}

function isProcessGroupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') {
      return false;
    }
    if (error?.code === 'EPERM') {
      return true;
    }
    throw error;
  }
}

async function waitForProcessGroupExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessGroupAlive(pid)) {
      return true;
    }
    await delay(shutdownPollIntervalMs);
  }

  return !isProcessGroupAlive(pid);
}

function signalProcessGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }
}

function runTaskkill(pid) {
  return new Promise((resolve, reject) => {
    const taskkill = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const timeout = setTimeout(() => {
      taskkill.kill();
      finish(reject, new Error(`taskkill timed out while stopping process tree ${pid}`));
    }, shutdownForcePeriodMs);

    taskkill.once('error', (error) => finish(reject, error));
    taskkill.once('exit', (code, signal) => {
      if (code === 0) {
        finish(resolve);
        return;
      }
      finish(reject, new Error(`taskkill failed for process tree ${pid} with ${code ?? signal}`));
    });
  });
}

async function stopProcessTree(child) {
  if (!child?.pid) {
    return;
  }

  if (process.platform === 'win32') {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    try {
      await runTaskkill(child.pid);
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) {
        throw error;
      }
    }

    if (!(await waitForChildExit(child, shutdownForcePeriodMs))) {
      throw new Error(`Process tree ${child.pid} did not exit after taskkill`);
    }
    return;
  }

  signalProcessGroup(child, 'SIGTERM');
  if (!(await waitForProcessGroupExit(child.pid, shutdownGracePeriodMs))) {
    signalProcessGroup(child, 'SIGKILL');
  }

  const [childExited, processGroupExited] = await Promise.all([
    waitForChildExit(child, shutdownForcePeriodMs),
    waitForProcessGroupExit(child.pid, shutdownForcePeriodMs),
  ]);

  if (!childExited || !processGroupExited) {
    throw new Error(`Process tree ${child.pid} did not exit after forced termination`);
  }
}

function spawnRspressBuild(args) {
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const child = spawn(pnpmCommand, ['exec', 'rspress', 'build', ...args], {
    cwd: repoRoot,
    detached: process.platform !== 'win32',
    stdio: 'inherit',
  });
  const completion = new Promise((resolve) => {
    let settled = false;
    const finish = (outcome) => {
      if (!settled) {
        settled = true;
        resolve(outcome);
      }
    };

    child.once('error', (error) => finish({ error }));
    child.once('exit', (code) => finish({ exitCode: code ?? 1 }));
  });

  return { child, completion };
}

function listenForShutdownSignal() {
  let requestedSignal;
  let resolveSignal;
  const signalPromise = new Promise((resolve) => {
    resolveSignal = resolve;
  });
  const signalConfigs = [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ];
  const handlers = signalConfigs.map(([signal, exitCode]) => {
    const handler = () => {
      if (!requestedSignal) {
        requestedSignal = { exitCode, signal };
        resolveSignal(requestedSignal);
      }
    };

    process.on(signal, handler);
    return { handler, signal };
  });

  return {
    dispose() {
      for (const { handler, signal } of handlers) {
        process.off(signal, handler);
      }
    },
    get requestedSignal() {
      return requestedSignal;
    },
    signalPromise,
  };
}

async function runRspressBuild(args, manifestOutputPath) {
  const shutdown = listenForShutdownSignal();

  try {
    await rm(manifestOutputPath, { force: true });
    if (shutdown.requestedSignal) {
      await rm(manifestOutputPath, { force: true });
      process.exit(shutdown.requestedSignal.exitCode);
    }

    const build = spawnRspressBuild(args);
    const outcome = await Promise.race([
      build.completion.then((result) => ({ result, type: 'build' })),
      shutdown.signalPromise.then((signal) => ({ signal, type: 'signal' })),
    ]);

    if (outcome.type === 'signal') {
      await stopProcessTree(build.child);
      await build.completion;
      await rm(manifestOutputPath, { force: true });
      process.exit(outcome.signal.exitCode);
    }

    shutdown.dispose();
    if (outcome.result.error) {
      throw outcome.result.error;
    }
    if (outcome.result.exitCode !== 0) {
      await rm(manifestOutputPath, { force: true });
    }
    return outcome.result.exitCode;
  } catch (error) {
    await rm(manifestOutputPath, { force: true });
    throw error;
  } finally {
    shutdown.dispose();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const exitCode = await runRspressBuild(process.argv.slice(2), manifestPath);

  process.exitCode = exitCode;
}
