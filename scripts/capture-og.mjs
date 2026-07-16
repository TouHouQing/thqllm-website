import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const sharedBuildRoot = path.join(repoRoot, 'doc_build');
const sourceConfigPath = path.join(repoRoot, 'rspress.config.ts');
const defaultOutputPath = path.join(repoRoot, 'site/public/og-cover.png');
const defaultPort = 4317;
const previewHost = '127.0.0.1';
const captureWidth = 1200;
const captureHeight = 630;
const fetchTimeoutMs = 2_000;
const shutdownTimeoutMs = 5_000;
const previewAttemptTimeoutMs = 6_000;
const previewTotalTimeoutMs = 18_000;
const previewCandidateLimit = 4;
const cleanupResourceTimeoutMs = 5_000;
const cleanupTotalTimeoutMs = 15_000;
const forceCleanupResourceTimeoutMs = 500;
const forceCleanupTotalTimeoutMs = 1_250;
const signalForceExitTimeoutMs = 1_500;
const browserLaunchTimeoutMs = 30_000;
const markerPrefix = '__thqllm-capture-marker-';
const previewRootPrefix = 'thqllm-capture-preview-';
const previewConfigPrefix = 'thqllm-capture-config-';
const requiredFonts = [
  {
    descriptor: '700 16px "Cormorant Garamond"',
    label: 'Cormorant Garamond',
    sample: 'THQLLM',
  },
  {
    descriptor: '500 16px "JetBrains Mono"',
    label: 'JetBrains Mono',
    sample: 'PROJECT',
  },
];

class PreviewRetryableError extends Error {}

class PreviewPortConflictError extends PreviewRetryableError {}

class PreviewIdentityError extends PreviewRetryableError {}

class PreviewNotReadyError extends Error {}

class PreviewStartupError extends Error {}

class PreviewRetryLimitError extends Error {}

function normalizeError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

function combineOperationAndCleanupErrors(operationError, cleanupError) {
  const primaryError = normalizeError(operationError);
  const secondaryError = normalizeError(cleanupError);
  return new AggregateError(
    [primaryError, secondaryError],
    `${primaryError.message}\nCleanup also failed: ${secondaryError.message}`,
    { cause: primaryError },
  );
}

function withTimeout(promise, timeoutMs, label) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid timeout for ${label}: ${timeoutMs}`);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

function printUsage() {
  console.log(`Usage: pnpm capture:og [options]

Options:
  --output <path>          PNG output path (default: site/public/og-cover.png)
  --port <number>          Preferred preview port (default: ${defaultPort})
  --preview-root <path>    Fixture output root to copy before previewing
  --skip-build             Reuse the existing doc_build output
  --help                   Show this help
`);
}

function parseArgs(argv) {
  const options = {
    outputPath: defaultOutputPath,
    port: defaultPort,
    previewRoot: undefined,
    skipBuild: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') {
      continue;
    }

    if (argument === '--help') {
      printUsage();
      process.exit(0);
    }

    if (argument === '--skip-build') {
      options.skipBuild = true;
      continue;
    }

    if (argument === '--output' || argument === '--port' || argument === '--preview-root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }

      if (argument === '--output') {
        options.outputPath = path.resolve(value);
      } else if (argument === '--port') {
        options.port = Number(value);
      } else {
        options.previewRoot = path.resolve(value);
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
    throw new Error(`Invalid preview port: ${options.port}`);
  }

  return options;
}

function commandName() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function commandEnvironment() {
  const { HOST: _host, PORT: _port, ...inheritedEnvironment } = process.env;
  return {
    ...inheritedEnvironment,
    CI: '1',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    TZ: 'UTC',
  };
}

function emitTestEvent(message) {
  if (process.env.THQLLM_CAPTURE_TEST_EVENTS === '1') {
    console.log(`Capture ${message}`);
  }
}

function appendOutput(target, chunk) {
  target.value += chunk.toString();
  if (target.value.length > 12_000) {
    target.value = target.value.slice(-12_000);
  }
}

function spawnManaged(command, args, options, tracker) {
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== 'win32',
  });
  tracker.addChild(child);
  return child;
}

function runCommand(command, args, tracker) {
  return new Promise((resolve, reject) => {
    const output = { value: '' };
    const child = spawnManaged(
      command,
      args,
      {
        cwd: repoRoot,
        env: commandEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
      tracker,
    );

    child.stdout.on('data', (chunk) => appendOutput(output, chunk));
    child.stderr.on('data', (chunk) => appendOutput(output, chunk));
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`${command} ${args.join(' ')} failed with ${code ?? signal}\n${output.value}`),
      );
    });
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function runTaskkill(pid) {
  return new Promise((resolve, reject) => {
    const taskkill = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    taskkill.once('error', reject);
    taskkill.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`taskkill failed for process tree ${pid} with ${code ?? signal}`));
    });
  });
}

async function stopWindowsProcessTree(child, dependencies = {}) {
  const runTaskkillImpl = dependencies.runTaskkill ?? runTaskkill;
  const waitForExitImpl = dependencies.waitForExit ?? waitForExit;
  const timeoutMs = dependencies.timeoutMs ?? shutdownTimeoutMs;

  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    await runTaskkillImpl(child.pid);
  } catch (error) {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    throw error;
  }

  if (!(await waitForExitImpl(child, timeoutMs))) {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    throw new Error(`Process tree ${child.pid} did not exit after taskkill`);
  }
}

const processTreeStops = new WeakMap();

function stopProcessTree(child) {
  if (!child || child.pid === undefined) {
    return Promise.resolve();
  }

  const existingStop = processTreeStops.get(child);
  if (existingStop) {
    return existingStop;
  }

  const stopPromise = (async () => {
    if (process.platform === 'win32') {
      await stopWindowsProcessTree(child);
      return;
    }

    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
      }
    }
    await waitForExit(child, shutdownTimeoutMs);

    try {
      process.kill(-child.pid, 0);
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
    await waitForExit(child, shutdownTimeoutMs);
  })();

  processTreeStops.set(child, stopPromise);
  return stopPromise;
}

async function forceStopProcessTree(child, timeoutMs = forceCleanupResourceTimeoutMs) {
  if (!child || child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    await stopWindowsProcessTree(child, { timeoutMs });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  }

  if (!(await waitForExit(child, timeoutMs))) {
    throw new Error(`Process tree ${child.pid} did not exit after forced termination`);
  }
}

function createResourceTracker(options = {}) {
  const resourceTimeoutMs = options.resourceTimeoutMs ?? cleanupResourceTimeoutMs;
  const totalTimeoutMs = options.cleanupTimeoutMs ?? cleanupTotalTimeoutMs;
  const forcedResourceTimeoutMs = options.forceResourceTimeoutMs ?? forceCleanupResourceTimeoutMs;
  const forcedTotalTimeoutMs = options.forceCleanupTimeoutMs ?? forceCleanupTotalTimeoutMs;
  const cleanupPhasePriority = {
    filesystem: 1,
    runtime: 2,
  };
  const resources = [];
  let registrationVersion = 0;
  let cleanupStarted = false;
  let cleanupFinished = false;
  let cleanupPromise;
  let forceCleanupPromise;

  function resourcesInCleanupOrder(candidates) {
    return candidates.toSorted((left, right) => {
      const phaseDifference = cleanupPhasePriority[right.phase] - cleanupPhasePriority[left.phase];
      return phaseDifference || right.sequence - left.sequence;
    });
  }

  function runResource(resource) {
    if (resource.promise) {
      return resource.promise;
    }

    resource.state = 'running';
    resource.promise = withTimeout(
      Promise.resolve().then(resource.cleanup),
      resource.timeoutMs,
      `${resource.label} cleanup`,
    ).then(
      () => {
        resource.state = 'completed';
      },
      (error) => {
        resource.error = error;
        resource.state = 'failed';
        throw error;
      },
    );
    return resource.promise;
  }

  function addCleanup(cleanup, options = {}) {
    if (cleanupFinished) {
      throw new Error('Cannot register cleanup after resource tracker completion');
    }

    const resource = {
      cleanup,
      blocksFilesystemOnFailure: options.blocksFilesystemOnFailure ?? false,
      error: undefined,
      forceCleanup: options.forceCleanup,
      forceTimeoutMs: options.forceTimeoutMs ?? forcedResourceTimeoutMs,
      label: options.label ?? `resource ${registrationVersion + 1}`,
      phase: options.phase ?? 'runtime',
      promise: undefined,
      sequence: registrationVersion,
      state: 'pending',
      timeoutMs: options.timeoutMs ?? resourceTimeoutMs,
    };
    if (!(resource.phase in cleanupPhasePriority)) {
      throw new Error(`Unknown cleanup phase: ${resource.phase}`);
    }
    resources.push(resource);
    registrationVersion += 1;

    return () => runResource(resource);
  }

  function nextPendingResource() {
    return resourcesInCleanupOrder(resources.filter((resource) => resource.state === 'pending'))[0];
  }

  function pendingFilesystemBlockerFailure() {
    return resources.some(
      (resource) =>
        resource.phase === 'runtime' &&
        resource.blocksFilesystemOnFailure &&
        resource.state === 'failed',
    );
  }

  function skipUnsafeFilesystemCleanup() {
    for (const resource of resources) {
      if (resource.phase === 'filesystem' && resource.state === 'pending') {
        resource.error = new Error(
          `${resource.label} was not removed because runtime cleanup failed`,
        );
        resource.state = 'failed';
      }
    }
  }

  function cleanupFailures() {
    return resources
      .filter((resource) => resource.state === 'failed')
      .map((resource) => {
        const cause =
          resource.error instanceof Error
            ? resource.error
            : new Error(String(resource.error ?? 'Unknown cleanup failure'));
        return new Error(`${resource.label}: ${cause.message}`, { cause });
      });
  }

  async function drain() {
    cleanupStarted = true;
    let quietPasses = 0;

    while (true) {
      const pending = nextPendingResource();
      if (pending) {
        quietPasses = 0;
        if (pending.phase === 'filesystem' && pendingFilesystemBlockerFailure()) {
          skipUnsafeFilesystemCleanup();
          continue;
        }
        await runResource(pending).catch(() => undefined);
        continue;
      }

      const running = resources.filter((resource) => resource.state === 'running');
      if (running.length > 0) {
        quietPasses = 0;
        await Promise.allSettled(running.map((resource) => resource.promise));
        continue;
      }

      const observedVersion = registrationVersion;
      await new Promise((resolve) => setImmediate(resolve));
      if (
        registrationVersion !== observedVersion ||
        nextPendingResource() ||
        resources.some((resource) => resource.state === 'running')
      ) {
        quietPasses = 0;
        continue;
      }

      quietPasses += 1;
      if (quietPasses < 2) {
        continue;
      }

      cleanupFinished = true;
      const failures = cleanupFailures();
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          `Resource cleanup failed: ${failures.map((error) => error.message).join('; ')}`,
        );
      }
      return;
    }
  }

  async function forceDrain() {
    const failures = [];
    let runtimeBlockerFailed = false;

    for (const resource of resourcesInCleanupOrder(
      resources.filter(
        (resource) => resource.state !== 'completed' && typeof resource.forceCleanup === 'function',
      ),
    )) {
      if (resource.phase === 'filesystem' && runtimeBlockerFailed) {
        failures.push(
          new Error(`${resource.label} was not force-cleaned because process termination failed`),
        );
        continue;
      }

      try {
        await withTimeout(
          Promise.resolve().then(resource.forceCleanup),
          resource.forceTimeoutMs,
          `${resource.label} forced cleanup`,
        );
        resource.state = 'completed';
      } catch (error) {
        const failure = normalizeError(error);
        failures.push(new Error(`${resource.label}: ${failure.message}`, { cause: failure }));
        if (resource.phase === 'runtime' && resource.blocksFilesystemOnFailure) {
          runtimeBlockerFailed = true;
        }
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Forced resource cleanup failed: ${failures.map((error) => error.message).join('; ')}`,
      );
    }
  }

  function forceCleanup() {
    forceCleanupPromise ??= withTimeout(
      forceDrain(),
      forcedTotalTimeoutMs,
      'Forced resource cleanup',
    );
    return forceCleanupPromise;
  }

  function cleanup() {
    cleanupPromise ??= withTimeout(drain(), totalTimeoutMs, 'Resource cleanup').catch(
      async (cleanupError) => {
        try {
          await forceCleanup();
        } catch (forceError) {
          throw combineOperationAndCleanupErrors(cleanupError, forceError);
        }
        throw cleanupError;
      },
    );
    return cleanupPromise;
  }

  return {
    addCleanup,
    addChild(child) {
      addCleanup(() => stopProcessTree(child), {
        blocksFilesystemOnFailure: true,
        forceCleanup: () => forceStopProcessTree(child),
        label: `process tree ${child.pid ?? 'unknown'}`,
        phase: 'runtime',
        timeoutMs: shutdownTimeoutMs * 2 + 1_000,
      });
    },
    assertActive() {
      if (cleanupStarted) {
        throw new Error('Capture cleanup has already started');
      }
    },
    trackBrowser(browserPromise) {
      const browserStepTimeoutMs = resourceTimeoutMs;
      let cleanupRequested = false;
      let closePromise;
      let resolveCleanupRequest;
      const cleanupRequestPromise = new Promise((resolve) => {
        resolveCleanupRequest = resolve;
      });
      const resolvedBrowserPromise = Promise.resolve(browserPromise).then(
        (browser) => browser,
        () => undefined,
      );
      const closeAfterCleanupRequestPromise = Promise.all([
        resolvedBrowserPromise,
        cleanupRequestPromise,
      ]).then(([browser]) => {
        if (!browser) {
          return;
        }
        closePromise ??= Promise.resolve().then(() => browser.close());
        return closePromise;
      });
      const requestBrowserCleanup = () => {
        if (!cleanupRequested) {
          cleanupRequested = true;
          resolveCleanupRequest();
        }
        return closeAfterCleanupRequestPromise;
      };

      addCleanup(
        () =>
          withTimeout(
            requestBrowserCleanup(),
            browserStepTimeoutMs,
            'Chromium browser close after launch',
          ),
        {
          blocksFilesystemOnFailure: true,
          forceCleanup: requestBrowserCleanup,
          label: 'Chromium browser',
          phase: 'runtime',
          timeoutMs: browserStepTimeoutMs + 100,
        },
      );
    },
    cleanup,
    forceCleanup,
  };
}

function installSignalHandlers(tracker) {
  let signalCleanup;
  let forceExitStarted = false;
  let initialExitCode;
  const signalConfigs = [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ];
  const handlers = [];

  for (const [signal, exitCode] of signalConfigs) {
    const handler = () => {
      if (signalCleanup) {
        if (forceExitStarted) {
          process.exit(initialExitCode ?? exitCode);
        }

        forceExitStarted = true;
        emitTestEvent(`signal cleanup forced: ${signal}`);
        const forceExitTimer = setTimeout(() => {
          process.exit(initialExitCode ?? exitCode);
        }, signalForceExitTimeoutMs);
        void tracker
          .forceCleanup()
          .catch((error) => {
            console.error(normalizeError(error).message);
          })
          .finally(() => {
            clearTimeout(forceExitTimer);
            process.exit(initialExitCode ?? exitCode);
          });
        return;
      }

      initialExitCode = exitCode;
      emitTestEvent(`signal cleanup started: ${signal}`);
      signalCleanup = tracker
        .cleanup()
        .catch((error) => {
          console.error(normalizeError(error).message);
        })
        .finally(() => {
          process.exit(exitCode);
        });
    };
    process.on(signal, handler);
    handlers.push({ handler, signal });
  }

  return () => {
    for (const { handler, signal } of handlers) {
      process.off(signal, handler);
    }
  };
}

function listen(server, port) {
  serverListenStates.set(server, 'pending');
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      serverListenStates.set(server, 'failed');
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      serverListenStates.set(server, 'listening');
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, previewHost);
  });
}

const serverListenStates = new WeakMap();
const serverClosePromises = new WeakMap();

function closeServer(server) {
  const existingClose = serverClosePromises.get(server);
  if (existingClose) {
    return existingClose;
  }

  const state = serverListenStates.get(server);
  if (state === 'failed' || state === 'closed' || state === undefined) {
    return Promise.resolve();
  }

  const closePromise = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      serverListenStates.set(server, 'closed');
      server.off('listening', closeWhenListening);
      server.off('error', finish);
      resolve();
    };
    const closeWhenListening = () => {
      try {
        server.close(finish);
      } catch {
        finish();
      }
    };

    if (server.listening) {
      closeWhenListening();
      return;
    }

    server.once('listening', closeWhenListening);
    server.once('error', finish);
  });
  serverClosePromises.set(server, closePromise);
  return closePromise;
}

function previewPortCandidates(preferredPort) {
  if (preferredPort === 0) {
    return [0, 0, 0];
  }

  return [
    preferredPort,
    ...Array.from({ length: 2 }, (_, index) => preferredPort + index + 1).filter(
      (port) => port <= 65_535,
    ),
    0,
  ];
}

async function reservePort(candidate, tracker) {
  const server = createServer();
  tracker.addCleanup(() => closeServer(server), {
    forceCleanup: () => closeServer(server),
    label: `preview port ${candidate}`,
    phase: 'runtime',
  });

  try {
    await listen(server, candidate);
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine the reserved preview port');
    }

    let released = false;
    return {
      port: address.port,
      release: async () => {
        if (released) {
          return;
        }
        released = true;
        await closeServer(server);
      },
    };
  } catch (error) {
    await closeServer(server);
    throw error;
  }
}

function isPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  return child !== parent && child.startsWith(`${parent}${path.sep}`);
}

function assertIsolatedIdentity(identity) {
  if (
    !identity ||
    typeof identity !== 'object' ||
    typeof identity.previewRoot !== 'string' ||
    typeof identity.markerFilePath !== 'string' ||
    typeof identity.markerPath !== 'string' ||
    typeof identity.marker !== 'string'
  ) {
    throw new PreviewIdentityError(
      'Preview marker identity must reference an isolated preview root',
    );
  }

  if (
    path.resolve(identity.previewRoot) === path.resolve(sharedBuildRoot) ||
    !isPathInside(identity.previewRoot, identity.markerFilePath)
  ) {
    throw new PreviewIdentityError(
      'Preview marker identity must reference an isolated preview root',
    );
  }
}

function stagePreviewMarker(previewRoot, tracker) {
  const marker = `${markerPrefix}${randomUUID()}`;
  const fileName = `${markerPrefix}${randomUUID()}.txt`;
  const markerFilePath = path.join(previewRoot, fileName);
  let writePromise = Promise.resolve();

  tracker.addCleanup(
    async () => {
      await writePromise.catch(() => undefined);
      await rm(markerFilePath, { force: true });
    },
    {
      forceCleanup: () => rm(markerFilePath, { force: true }),
      label: `preview marker ${markerFilePath}`,
      phase: 'filesystem',
    },
  );

  writePromise = writeFile(markerFilePath, `${marker}\n`, 'utf8');
  emitTestEvent(`marker staged: ${markerFilePath}`);

  return {
    marker,
    markerPath: `/${fileName}`,
    markerFilePath,
    previewRoot,
    ready: writePromise,
  };
}

async function createIsolatedPreview(sourceRoot, tracker) {
  const previewRoot = mkdtempSync(path.join(tmpdir(), previewRootPrefix));
  let copyPromise = Promise.resolve();
  let markerPromise = Promise.resolve();
  tracker.addCleanup(
    async () => {
      await copyPromise.catch(() => undefined);
      await markerPromise.catch(() => undefined);
      await rm(previewRoot, { force: true, recursive: true });
    },
    {
      forceCleanup: () => rm(previewRoot, { force: true, recursive: true }),
      label: `preview root ${previewRoot}`,
      phase: 'filesystem',
    },
  );

  emitTestEvent(`preview root: ${previewRoot}`);
  const identity = stagePreviewMarker(previewRoot, tracker);
  markerPromise = identity.ready;
  copyPromise = cp(sourceRoot, previewRoot, { recursive: true });
  await Promise.all([copyPromise, markerPromise]);
  tracker.assertActive();

  const configRoot = mkdtempSync(path.join(tmpdir(), previewConfigPrefix));
  emitTestEvent(`preview config root: ${configRoot}`);
  let configWritePromise = Promise.resolve();
  tracker.addCleanup(
    async () => {
      await configWritePromise.catch(() => undefined);
      await rm(configRoot, { force: true, recursive: true });
    },
    {
      forceCleanup: () => rm(configRoot, { force: true, recursive: true }),
      label: `preview config root ${configRoot}`,
      phase: 'filesystem',
    },
  );

  const configPath = path.join(configRoot, 'rspress.config.ts');
  const sourceConfigUrl = pathToFileURL(sourceConfigPath).href;
  configWritePromise = writeFile(
    configPath,
    [
      `import baseConfig from ${JSON.stringify(sourceConfigUrl)};`,
      `export default { ...baseConfig, outDir: ${JSON.stringify(previewRoot)} };`,
      '',
    ].join('\n'),
    'utf8',
  );
  await configWritePromise;
  tracker.assertActive();

  return {
    configPath,
    identity,
    previewRoot,
  };
}

async function fetchWithTimeout(url) {
  return fetch(url, { signal: AbortSignal.timeout(fetchTimeoutMs) });
}

async function validatePreviewReady(previewUrl, identity) {
  assertIsolatedIdentity(identity);

  let rootResponse;
  try {
    rootResponse = await fetchWithTimeout(previewUrl);
  } catch {
    throw new PreviewNotReadyError(`Preview did not respond at ${previewUrl}`);
  }

  if (!rootResponse.ok) {
    throw new PreviewIdentityError(`Preview root returned HTTP ${rootResponse.status}`);
  }

  const contentType = rootResponse.headers.get('content-type') ?? '';
  const rootBody = await rootResponse.text();
  if (!contentType.includes('text/html') || !/<title>\s*THQLLM\s*<\/title>/.test(rootBody)) {
    throw new PreviewIdentityError(`Preview root is not the THQLLM HTML page at ${previewUrl}`);
  }

  let markerResponse;
  try {
    markerResponse = await fetchWithTimeout(new URL(identity.markerPath, previewUrl));
  } catch {
    throw new PreviewIdentityError(`Preview marker did not respond at ${identity.markerPath}`);
  }

  if (!markerResponse.ok) {
    throw new PreviewIdentityError(
      `Preview marker returned HTTP ${markerResponse.status} at ${identity.markerPath}`,
    );
  }

  const returnedMarker = (await markerResponse.text()).trim();
  if (returnedMarker !== identity.marker) {
    throw new PreviewIdentityError(`Preview marker mismatch at ${identity.markerPath}`);
  }
}

function previewOutputShowsPortFallback(output, requestedPort) {
  return (
    new RegExp(`port\\s+${requestedPort}\\s+is\\s+in\\s+use`, 'i').test(output) ||
    /trying another (?:available )?port/i.test(output)
  );
}

async function waitForPreview(preview, previewUrl, identity, options) {
  const output = { value: '' };
  const appendPreviewOutput = (chunk) => appendOutput(output, chunk);
  preview.stdout?.on('data', appendPreviewOutput);
  preview.stderr?.on('data', appendPreviewOutput);

  try {
    while (Date.now() < options.deadline) {
      if (preview.exitCode !== null || preview.signalCode !== null) {
        throw new PreviewStartupError(`Preview exited before becoming ready\n${output.value}`);
      }

      if (previewOutputShowsPortFallback(output.value, options.requestedPort)) {
        throw new PreviewPortConflictError(
          `Rspress selected another port instead of ${options.requestedPort}\n${output.value}`,
        );
      }

      try {
        await validatePreviewReady(previewUrl, identity);
        return;
      } catch (error) {
        if (!(error instanceof PreviewNotReadyError)) {
          throw error;
        }
      }

      const remainingMs = options.deadline - Date.now();
      if (remainingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(100, remainingMs)));
      }
    }

    if (previewOutputShowsPortFallback(output.value, options.requestedPort)) {
      throw new PreviewPortConflictError(
        `Rspress selected another port instead of ${options.requestedPort}\n${output.value}`,
      );
    }

    throw new PreviewStartupError(
      `Preview did not become ready at ${previewUrl} within the attempt timeout\n${output.value}`,
    );
  } finally {
    preview.stdout?.off('data', appendPreviewOutput);
    preview.stderr?.off('data', appendPreviewOutput);
  }
}

async function startPreviewWithRetry({
  afterPortRelease,
  attemptTimeoutMs = previewAttemptTimeoutMs,
  identity,
  maxCandidates = previewCandidateLimit,
  preferredPort,
  previewRoot,
  configPath,
  totalTimeoutMs = previewTotalTimeoutMs,
  tracker,
}) {
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1) {
    throw new Error(`Invalid preview candidate limit: ${maxCandidates}`);
  }

  const candidates = previewPortCandidates(preferredPort).slice(0, maxCandidates);
  const totalDeadline = Date.now() + totalTimeoutMs;
  let lastError;

  for (let attempt = 0; attempt < candidates.length; attempt += 1) {
    if (Date.now() >= totalDeadline) {
      break;
    }

    let reservation;
    try {
      reservation = await reservePort(candidates[attempt], tracker);
      tracker.assertActive();
    } catch (error) {
      tracker.assertActive();
      if (error?.code === 'EADDRINUSE') {
        lastError = new PreviewPortConflictError(
          `Preview port ${candidates[attempt]} is already in use`,
          { cause: error },
        );
        continue;
      }
      throw error;
    }

    const port = reservation.port;
    await reservation.release();
    tracker.assertActive();
    await afterPortRelease?.({ attempt, identity, port });
    tracker.assertActive();

    const previewUrl = `http://${previewHost}:${port}/`;
    const preview = spawnManaged(
      commandName(),
      [
        'preview',
        previewRoot,
        '--config',
        configPath,
        '--host',
        previewHost,
        '--port',
        String(port),
      ],
      {
        cwd: repoRoot,
        env: commandEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
      tracker,
    );

    try {
      await waitForPreview(preview, previewUrl, identity, {
        deadline: Math.min(totalDeadline, Date.now() + attemptTimeoutMs),
        requestedPort: port,
      });
      tracker.assertActive();
      await new Promise((resolve) => setTimeout(resolve, 50));
      tracker.assertActive();
      if (preview.exitCode !== null || preview.signalCode !== null) {
        throw new Error('Preview exited immediately after becoming ready');
      }
      await validatePreviewReady(previewUrl, identity);
      return {
        port,
        preview,
        url: previewUrl,
      };
    } catch (error) {
      let stopError;
      try {
        await stopProcessTree(preview);
      } catch (caughtStopError) {
        stopError = caughtStopError;
      }
      tracker.assertActive();
      if (stopError) {
        throw combineOperationAndCleanupErrors(error, stopError);
      }
      if (!(error instanceof PreviewRetryableError)) {
        throw error;
      }
      lastError = error;
    }
  }

  const retryError = normalizeError(
    lastError ?? new Error(`No candidate preview port was available near ${preferredPort}`),
  );
  throw new PreviewRetryLimitError(
    `Could not start a THQLLM preview after ${candidates.length} candidate ports: ${retryError.message}`,
    { cause: retryError },
  );
}

async function waitForPageAssets(page) {
  const state = await page.evaluate(async (fontRequests) => {
    await document.fonts.ready;

    const imageFailures = [];
    for (const image of Array.from(document.images)) {
      if (!image.complete) {
        await new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }

      let decodeFailed = false;
      try {
        await image.decode();
      } catch {
        decodeFailed = true;
      }

      if (!image.complete || image.naturalWidth <= 0 || decodeFailed) {
        imageFailures.push(image.currentSrc || image.src || '<anonymous image>');
      }
    }

    const fontFailures = [];
    for (const request of fontRequests) {
      let loadedFaces = [];
      try {
        loadedFaces = await document.fonts.load(request.descriptor, request.sample);
      } catch {
        // The explicit check below reports the required font failure.
      }

      if (
        loadedFaces.length === 0 ||
        loadedFaces.some((face) => face.status !== 'loaded') ||
        !document.fonts.check(request.descriptor, request.sample)
      ) {
        fontFailures.push(request.label);
      }
    }

    return {
      fontFailures,
      imageFailures,
    };
  }, requiredFonts);

  if (state.imageFailures.length > 0) {
    throw new Error(`Required image failed to load or decode: ${state.imageFailures.join(', ')}`);
  }
  if (state.fontFailures.length > 0) {
    throw new Error(`Required font unavailable: ${state.fontFailures.join(', ')}`);
  }

  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[data-testid="danmaku-canvas"]');
    return (
      canvas instanceof HTMLCanvasElement &&
      canvas.dataset.motion === 'reduced' &&
      canvas.dataset.danmakuFrame !== undefined
    );
  });
}

async function waitForStableLayout(page) {
  let previousLayout = '';

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const layout = await page.evaluate(() => {
      const selectors = [
        '[data-danmaku-root]',
        '#thq-home-title',
        'dl[aria-label="站点信息"]',
        'nav[aria-label="首页主菜单"]',
        '[data-danmaku-exclusion="scroll-hint"]',
      ];
      return selectors
        .map((selector) => {
          const element = document.querySelector(selector);
          if (!element) {
            return `${selector}:missing`;
          }
          const rect = element.getBoundingClientRect();
          return `${selector}:${rect.x},${rect.y},${rect.width},${rect.height}`;
        })
        .join('|');
    });

    if (layout === previousLayout) {
      return;
    }

    previousLayout = layout;
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
  }

  throw new Error('Capture layout did not stabilize');
}

async function capture(options, tracker, hooks = {}) {
  const sourceRoot = options.previewRoot ?? sharedBuildRoot;
  const session = await createIsolatedPreview(sourceRoot, tracker);
  tracker.assertActive();
  const preview = await startPreviewWithRetry({
    afterPortRelease: hooks.afterPortRelease,
    configPath: session.configPath,
    identity: session.identity,
    preferredPort: options.port,
    previewRoot: session.previewRoot,
    tracker,
  });
  tracker.assertActive();
  console.log(`Preview ready at ${preview.url} marker=${session.identity.markerPath}`);

  if (
    process.env.THQLLM_CAPTURE_TEST_EVENTS === '1' &&
    process.env.THQLLM_CAPTURE_TEST_HANG_CLEANUP === '1'
  ) {
    tracker.addCleanup(() => new Promise(() => {}), {
      label: 'test pending cleanup',
      phase: 'runtime',
    });
    emitTestEvent('test cleanup pending');
    await new Promise(() => {});
  }

  const browserPromise = chromium.launch({
    headless: true,
    timeout: browserLaunchTimeoutMs,
  });
  tracker.trackBrowser(browserPromise);
  const browser = await browserPromise;
  tracker.assertActive();
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    viewport: { width: captureWidth, height: captureHeight },
  });
  tracker.assertActive();
  const page = await context.newPage();
  tracker.assertActive();
  await page.goto(preview.url, { waitUntil: 'networkidle' });
  await validatePreviewReady(preview.url, session.identity);
  await page.addStyleTag({
    content: `
      html { scroll-behavior: auto !important; }
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await waitForPageAssets(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitForStableLayout(page);
  await hooks.beforeScreenshotIdentityCheck?.({
    identity: session.identity,
    page,
    preview,
  });
  await validatePreviewReady(preview.url, session.identity);

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  const temporaryOutputPath = `${options.outputPath}.capture-${randomUUID()}.png`;
  tracker.addCleanup(() => rm(temporaryOutputPath, { force: true }), {
    forceCleanup: () => rm(temporaryOutputPath, { force: true }),
    label: `temporary capture ${temporaryOutputPath}`,
    phase: 'filesystem',
  });
  await page.screenshot({
    animations: 'disabled',
    clip: { x: 0, y: 0, width: captureWidth, height: captureHeight },
    path: temporaryOutputPath,
    scale: 'css',
    type: 'png',
  });
  await rename(temporaryOutputPath, options.outputPath);
}

async function runOperationWithCleanup(operation, tracker) {
  let operationError;
  try {
    await operation();
  } catch (error) {
    operationError = normalizeError(error);
  }

  let cleanupError;
  try {
    await tracker.cleanup();
  } catch (error) {
    cleanupError = normalizeError(error);
  }

  if (operationError && cleanupError) {
    throw combineOperationAndCleanupErrors(operationError, cleanupError);
  }
  if (operationError) {
    throw operationError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tracker = createResourceTracker();
  const testCleanupFailure = process.env.THQLLM_CAPTURE_TEST_CLEANUP_FAILURE;
  if (process.env.THQLLM_CAPTURE_TEST_EVENTS === '1' && testCleanupFailure) {
    tracker.addCleanup(
      async () => {
        throw new Error(testCleanupFailure);
      },
      {
        label: 'test cleanup failure',
        phase: 'filesystem',
      },
    );
  }
  const removeSignalHandlers = installSignalHandlers(tracker);

  try {
    await runOperationWithCleanup(async () => {
      if (!options.skipBuild) {
        await runCommand(commandName(), ['build'], tracker);
        tracker.assertActive();
      }

      await capture(options, tracker);
      console.log(
        `Captured deterministic ${captureWidth}x${captureHeight} OG PNG at ${path.relative(repoRoot, options.outputPath)}`,
      );
    }, tracker);
  } finally {
    removeSignalHandlers();
  }
}

export {
  capture,
  combineOperationAndCleanupErrors,
  createIsolatedPreview,
  createResourceTracker,
  startPreviewWithRetry,
  stopWindowsProcessTree,
  validatePreviewReady,
  waitForPageAssets,
};

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
