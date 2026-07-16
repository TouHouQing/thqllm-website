import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import { cp, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as captureOg from './capture-og.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const captureScript = path.join(import.meta.dirname, 'capture-og.mjs');
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const sharedBuildRoot = path.join(repoRoot, 'doc_build');

const { validatePreviewReady, waitForPageAssets } = captureOg;
const signalIt = process.platform === 'win32' ? it.skip : it;

async function startServer(port, handler) {
  const server = createServer(handler);
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected an IPv4 test server address');
  }

  return { port: address.port, server };
}

async function closeServer(server) {
  if (!server.listening) {
    return;
  }

  server.close();
  await once(server, 'close');
}

async function getAvailablePorts(count) {
  const fixtures = await Promise.all(
    Array.from({ length: count }, () =>
      startServer(0, (_request, response) => {
        response.end();
      }),
    ),
  );
  const ports = fixtures.map((fixture) => fixture.port);
  await Promise.all(fixtures.map((fixture) => closeServer(fixture.server)));
  return ports;
}

async function getAvailablePort() {
  return (await getAvailablePorts(1))[0];
}

function spawnCapture(outputPath, port, extraArgs = [], env = {}) {
  const child = spawn(
    process.execPath,
    [captureScript, '--output', outputPath, '--port', String(port), ...extraArgs],
    {
      cwd: repoRoot,
      detached: process.platform !== 'win32',
      env: { ...process.env, CI: '1', TZ: 'UTC', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  return {
    child,
    get output() {
      return { stdout, stderr };
    },
  };
}

async function waitForExit(child, timeoutMs = 20_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }

  return new Promise((resolve, reject) => {
    const onExit = (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    };
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      reject(new Error('Timed out waiting for capture process'));
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

async function terminateCapture(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    const taskkill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    await once(taskkill, 'exit').catch(() => undefined);
    await waitForExit(child, 2_000).catch(() => undefined);
    return;
  }

  const processTarget = -child.pid;
  try {
    process.kill(processTarget, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      return;
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 50));
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(processTarget, 'SIGTERM');
    } catch {
      // The child may have exited between the state check and the signal.
    }
  }

  try {
    await waitForExit(child, 5_000);
  } catch {
    try {
      process.kill(processTarget, 'SIGKILL');
    } catch {
      // The child may have exited while the timeout was handled.
    }
    await waitForExit(child, 2_000).catch(() => undefined);
  }
}

async function runCapture(outputPath, port, extraArgs = []) {
  const processHandle = spawnCapture(outputPath, port, extraArgs);
  let result;
  try {
    result = await waitForExit(processHandle.child, 120_000);
  } catch (error) {
    await terminateCapture(processHandle.child);
    throw error;
  }
  if (result.code !== 0) {
    const { stdout, stderr } = processHandle.output;
    throw new Error(`capture-og failed with ${result.code ?? result.signal}\n${stdout}\n${stderr}`);
  }

  return processHandle.output;
}

async function runCaptureFailure(outputPath, port, extraArgs = [], env = {}) {
  const processHandle = spawnCapture(outputPath, port, extraArgs, env);
  let result;
  try {
    result = await waitForExit(processHandle.child, 120_000);
  } catch (error) {
    await terminateCapture(processHandle.child);
    throw error;
  }
  return {
    ...result,
    output: processHandle.output,
  };
}

async function waitForOutput(processHandle, pattern, timeoutMs = 30_000) {
  const existingMatch = processHandle.output.stdout.match(pattern);
  if (existingMatch) {
    return existingMatch;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for output matching ${pattern}`));
    }, timeoutMs);
    const onData = () => {
      const match = processHandle.output.stdout.match(pattern);
      if (match) {
        clearTimeout(timer);
        processHandle.child.stdout.off('data', onData);
        resolve(match);
      }
    };
    processHandle.child.stdout.on('data', onData);
  });
}

async function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (listening) => {
      socket.destroy();
      resolve(listening);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function waitForPortState(port, expectedListening, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await isPortListening(port)) === expectedListening) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Port ${port} did not reach listening=${expectedListening}`);
}

async function runBuild() {
  const child = spawn(packageManager, ['build'], {
    cwd: repoRoot,
    env: { ...process.env, CI: '1', TZ: 'UTC' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const [code, signal] = await once(child, 'exit');
  if (code !== 0) {
    throw new Error(`Build failed with ${code ?? signal}\n${output}`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('capture-og', () => {
  beforeAll(runBuild, 120_000);

  it('clears the waitForExit timeout after a normal child exit', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;

    try {
      const exitPromise = waitForExit(child, 1_000);
      child.exitCode = 0;
      child.emit('exit', 0, null);

      await expect(exitPromise).resolves.toEqual({ code: 0, signal: null });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the operation error first in combined cleanup error metadata', () => {
    const operationError = new Error(
      'Required image failed to load or decode: /assets/hero/broken.webp',
    );
    const cleanupError = new AggregateError(
      [new Error('cleanup sentinel')],
      'Resource cleanup failed: cleanup sentinel',
    );

    const combinedError = captureOg.combineOperationAndCleanupErrors(operationError, cleanupError);

    expect(combinedError).toBeInstanceOf(AggregateError);
    expect(combinedError.message.startsWith(operationError.message)).toBe(true);
    expect(combinedError.message).toContain(cleanupError.message);
    expect(combinedError.cause).toBe(operationError);
    expect(combinedError.errors).toEqual([operationError, cleanupError]);
  });

  it('captures deterministic 1200x630 output and uses an independent port per run', async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-capture-og-'));
    const firstOutput = path.join(fixtureRoot, 'first.png');
    const secondOutput = path.join(fixtureRoot, 'second.png');
    const [firstPort, secondPort] = await getAvailablePorts(2);

    try {
      await runCapture(firstOutput, firstPort);
      await runCapture(secondOutput, secondPort, ['--', '--skip-build']);

      const firstBytes = await readFile(firstOutput);
      const secondBytes = await readFile(secondOutput);
      const metadata = await sharp(firstBytes).metadata();

      expect(sha256(firstBytes)).toBe(sha256(secondBytes));
      expect(firstBytes.equals(secondBytes)).toBe(true);
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(1200);
      expect(metadata.height).toBe(630);
      expect((await stat(firstOutput)).size).toBeGreaterThan(0);
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  }, 120_000);

  it('does not accept a fake 2xx server occupying the requested port', async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-capture-fake-'));
    const outputPath = path.join(fixtureRoot, 'capture.png');
    const preferredPort = await getAvailablePort();
    const fake = await startServer(preferredPort, (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html><title>Offline placeholder</title><body>not THQLLM</body></html>');
    });

    try {
      const result = await runCapture(outputPath, preferredPort, ['--skip-build']);
      const readyMatch = result.stdout.match(/Preview ready at http:\/\/127\.0\.0\.1:(\d+)/);

      expect(readyMatch).not.toBeNull();
      expect(Number(readyMatch?.[1])).not.toBe(preferredPort);
      expect(await (await fetch(`http://127.0.0.1:${preferredPort}/`)).text()).toContain(
        'not THQLLM',
      );
    } finally {
      await closeServer(fake.server);
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  }, 120_000);

  it('rejects an exact THQLLM page when its isolated run marker endpoint is missing', async () => {
    const previewRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-capture-marker-missing-'));
    const markerPath = '/__thqllm-capture-marker-missing.txt';
    const fake = await startServer(0, (request, response) => {
      if (request.url === '/') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<html><head><title>THQLLM</title></head><body>THQLLM</body></html>');
        return;
      }

      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('missing marker');
    });

    try {
      await expect(
        validatePreviewReady(`http://127.0.0.1:${fake.port}`, {
          marker: 'isolated-run-marker',
          markerFilePath: path.join(previewRoot, markerPath.slice(1)),
          markerPath,
          previewRoot,
        }),
      ).rejects.toThrow(/marker returned HTTP 404/i);
    } finally {
      await closeServer(fake.server);
      await rm(previewRoot, { force: true, recursive: true });
    }
  });

  it('rejects a legacy shared marker identity even when the fake page has the exact THQLLM title', async () => {
    const markerName = '__thqllm-capture-marker-shared.txt';
    const markerToken = 'shared-marker-token';
    const markerPath = path.join(sharedBuildRoot, markerName);
    await writeFile(markerPath, `${markerToken}\n`, 'utf8');
    const fake = await startServer(0, async (request, response) => {
      if (request.url === '/') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<html><head><title>THQLLM</title></head><body>fake</body></html>');
        return;
      }

      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end(await readFile(markerPath, 'utf8'));
    });

    try {
      await expect(
        validatePreviewReady(`http://127.0.0.1:${fake.port}`, {
          marker: markerToken,
          markerFilePath: markerPath,
          markerPath: `/${markerName}`,
          previewRoot: sharedBuildRoot,
        }),
      ).rejects.toThrow(/isolated/i);
    } finally {
      await closeServer(fake.server);
      await rm(markerPath, { force: true });
    }
  });

  it('retries a preview when a fake THQLLM page takes the released preferred port', async () => {
    const tracker = captureOg.createResourceTracker();
    const preferredPort = await getAvailablePort();
    const sharedMarkerPath = path.join(sharedBuildRoot, '__thqllm-capture-marker-old-shared.txt');
    let fake;

    try {
      await writeFile(sharedMarkerPath, 'old-shared-token\n', 'utf8');
      const session = await captureOg.createIsolatedPreview(sharedBuildRoot, tracker);
      const preview = await captureOg.startPreviewWithRetry({
        configPath: session.configPath,
        identity: session.identity,
        preferredPort,
        previewRoot: session.previewRoot,
        tracker,
        afterPortRelease: async ({ attempt, port }) => {
          if (attempt !== 0) {
            return;
          }

          fake = await startServer(port, async (request, response) => {
            if (request.url === '/') {
              response.writeHead(200, { 'content-type': 'text/html' });
              response.end('<html><head><title>THQLLM</title></head><body>fake</body></html>');
              return;
            }

            response.writeHead(200, { 'content-type': 'text/plain' });
            response.end(await readFile(sharedMarkerPath, 'utf8'));
          });
        },
      });

      expect(preview.port).not.toBe(preferredPort);
      expect(session.previewRoot).not.toBe(sharedBuildRoot);
      expect(session.identity.markerFilePath.startsWith(`${session.previewRoot}${path.sep}`)).toBe(
        true,
      );
      await expect(
        captureOg.validatePreviewReady(preview.url, session.identity),
      ).resolves.toBeUndefined();
    } finally {
      if (fake) {
        await closeServer(fake.server);
      }
      await tracker.cleanup();
      await rm(sharedMarkerPath, { force: true });
    }
  });

  it('fails fast instead of traversing candidates for a persistent 404 service', async () => {
    const tracker = captureOg.createResourceTracker();
    const session = await captureOg.createIsolatedPreview(sharedBuildRoot, tracker);
    const fakeServers = [];
    let attempts = 0;
    const startedAt = Date.now();
    const operation = captureOg.startPreviewWithRetry({
      attemptTimeoutMs: 250,
      configPath: session.configPath,
      identity: session.identity,
      maxCandidates: 4,
      preferredPort: await getAvailablePort(),
      previewRoot: session.previewRoot,
      totalTimeoutMs: 1_500,
      tracker,
      afterPortRelease: async ({ port }) => {
        attempts += 1;
        fakeServers.push(
          await startServer(port, (_request, response) => {
            response.writeHead(404, { 'content-type': 'text/plain' });
            response.end('persistent broken preview');
          }),
        );
      },
    });

    try {
      const outcome = await Promise.race([
        operation.then(
          () => ({ status: 'resolved' }),
          (error) => ({ status: 'rejected', error }),
        ),
        new Promise((resolve) => setTimeout(() => resolve({ status: 'pending' }), 2_500)),
      ]);

      expect(outcome.status).toBe('rejected');
      expect(Date.now() - startedAt).toBeLessThan(2_500);
      expect(attempts).toBeLessThanOrEqual(4);
      expect(outcome.error.message).toMatch(/404|identity|retry/i);
    } finally {
      await tracker.cleanup().catch(() => undefined);
      await operation.catch(() => undefined);
      await Promise.all(fakeServers.map(({ server }) => closeServer(server)));
    }
  }, 10_000);

  it('does not retry a preview that exits from a broken config', async () => {
    const tracker = captureOg.createResourceTracker();
    const session = await captureOg.createIsolatedPreview(sharedBuildRoot, tracker);
    let attempts = 0;
    const startedAt = Date.now();
    const operation = captureOg.startPreviewWithRetry({
      attemptTimeoutMs: 1_500,
      configPath: path.join(session.previewRoot, 'missing-rspress.config.ts'),
      identity: session.identity,
      maxCandidates: 4,
      preferredPort: 0,
      previewRoot: session.previewRoot,
      totalTimeoutMs: 2_000,
      tracker,
      afterPortRelease: () => {
        attempts += 1;
      },
    });

    try {
      const outcome = await Promise.race([
        operation.then(
          () => ({ status: 'resolved' }),
          (error) => ({ status: 'rejected', error }),
        ),
        new Promise((resolve) => setTimeout(() => resolve({ status: 'pending' }), 2_500)),
      ]);

      expect(outcome.status).toBe('rejected');
      expect(Date.now() - startedAt).toBeLessThan(2_500);
      expect(attempts).toBe(1);
      expect(outcome.error.message).toMatch(/preview exited|config/i);
    } finally {
      await tracker.cleanup().catch(() => undefined);
      await operation.catch(() => undefined);
    }
  }, 10_000);

  it('revalidates preview identity immediately before capture so a replacement is rejected', async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-capture-replacement-'));
    const outputPath = path.join(fixtureRoot, 'capture.png');
    const sentinel = Buffer.from('untouched-after-replacement');
    const tracker = captureOg.createResourceTracker();
    let replacement;

    await writeFile(outputPath, sentinel);

    try {
      await expect(
        captureOg.capture(
          {
            outputPath,
            port: await getAvailablePort(),
            previewRoot: sharedBuildRoot,
            skipBuild: true,
          },
          tracker,
          {
            beforeScreenshotIdentityCheck: async ({ preview }) => {
              replacement = await startServer(0, (request, response) => {
                if (request.url === '/') {
                  response.writeHead(200, { 'content-type': 'text/html' });
                  response.end(
                    '<html><head><title>THQLLM</title></head><body>replacement</body></html>',
                  );
                  return;
                }

                response.writeHead(200, { 'content-type': 'text/plain' });
                response.end('replacement-marker');
              });
              preview.url = `http://127.0.0.1:${replacement.port}/`;
            },
          },
        ),
      ).rejects.toThrow(/marker/i);

      expect(await readFile(outputPath)).toEqual(sentinel);
    } finally {
      if (replacement) {
        await closeServer(replacement.server);
      }
      await tracker.cleanup();
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  }, 60_000);

  it('waits for a pending browser launch during idempotent cleanup', async () => {
    const tracker = captureOg.createResourceTracker();
    let resolveBrowser;
    let closeCount = 0;
    const browserPromise = new Promise((resolve) => {
      resolveBrowser = resolve;
    });

    tracker.trackBrowser(browserPromise);
    const cleanupPromise = tracker.cleanup();
    await Promise.resolve();
    expect(closeCount).toBe(0);

    resolveBrowser({
      close: async () => {
        closeCount += 1;
      },
    });
    await cleanupPromise;
    await tracker.cleanup();

    expect(closeCount).toBe(1);
  });

  it('bounds cleanup while a browser launch promise remains unresolved', async () => {
    const tracker = captureOg.createResourceTracker({
      cleanupTimeoutMs: 200,
      resourceTimeoutMs: 100,
    });
    tracker.trackBrowser(new Promise(() => {}));

    const outcome = await Promise.race([
      tracker.cleanup().then(
        () => 'resolved',
        (error) => `rejected:${error.message}`,
      ),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 500)),
    ]);

    expect(outcome).toMatch(/^rejected:.*timed out/i);
  });

  it('waits for a delayed cleanup registered after cleanup has started', async () => {
    const tracker = captureOg.createResourceTracker();
    let cleanupResolved = false;
    let lateCleanupFinished = false;
    let resolveLateCleanupStarted;
    let resolveLateCleanupFinished;
    const lateCleanupStarted = new Promise((resolve) => {
      resolveLateCleanupStarted = resolve;
    });
    const lateCleanupDone = new Promise((resolve) => {
      resolveLateCleanupFinished = resolve;
    });

    tracker.addCleanup(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      tracker.addCleanup(async () => {
        resolveLateCleanupStarted();
        await new Promise((resolve) => setTimeout(resolve, 30));
        lateCleanupFinished = true;
        resolveLateCleanupFinished();
      });
    });

    const cleanupPromise = tracker.cleanup().then(() => {
      cleanupResolved = true;
    });
    await lateCleanupStarted;
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect.soft(lateCleanupFinished).toBe(false);
    expect.soft(cleanupResolved).toBe(false);

    await lateCleanupDone;
    await cleanupPromise;
    expect(lateCleanupFinished).toBe(true);
  });

  it('stops runtime resources before deleting filesystem roots', async () => {
    const tracker = captureOg.createResourceTracker();
    const cleanupOrder = [];

    tracker.addCleanup(
      async () => {
        cleanupOrder.push('root:start');
        cleanupOrder.push('root:end');
      },
      { label: 'preview root', phase: 'filesystem' },
    );
    tracker.addCleanup(
      async () => {
        cleanupOrder.push('child:start');
        await new Promise((resolve) => setTimeout(resolve, 20));
        cleanupOrder.push('child:end');
      },
      { label: 'preview child', phase: 'runtime' },
    );

    await tracker.cleanup();

    expect(cleanupOrder).toEqual(['child:start', 'child:end', 'root:start', 'root:end']);
  });

  it('rejects cleanup when a registered resource cannot be removed', async () => {
    const tracker = captureOg.createResourceTracker();
    tracker.addCleanup(
      async () => {
        throw new Error('preview root removal failed');
      },
      { label: 'preview root', phase: 'filesystem' },
    );

    await expect(tracker.cleanup()).rejects.toThrow(/preview root removal failed/i);
  });

  it('fails when a required image cannot load or decode', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.setContent(`
        <img src="data:image/png;base64,not-a-png">
        <canvas data-testid="danmaku-canvas" data-motion="reduced" data-danmaku-frame="[]"></canvas>
      `);
      await expect(waitForPageAssets(page)).rejects.toThrow(/image/i);
    } finally {
      await browser.close();
    }
  });

  it('fails when a required web font is unavailable', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.setContent(`
        <style>
          @font-face {
            font-family: "Cormorant Garamond";
            font-style: normal;
            font-weight: 700;
            src: url("data:font/woff2;base64,not-a-font") format("woff2");
          }
          @font-face {
            font-family: "JetBrains Mono";
            font-style: normal;
            font-weight: 500;
            src: url("data:font/woff2;base64,not-a-font") format("woff2");
          }
        </style>
        <h1 style="font-family: Cormorant Garamond">THQLLM</h1>
        <p style="font-family: JetBrains Mono">PROJECT</p>
        <canvas data-testid="danmaku-canvas" data-motion="reduced" data-danmaku-frame="[]"></canvas>
      `);
      await expect(waitForPageAssets(page)).rejects.toThrow(/font/i);
    } finally {
      await browser.close();
    }
  });

  it.each([
    ['image', 'missing hero image'],
    ['font', 'missing required font'],
  ])(
    'fails through the complete capture process and preserves the output for a %s fixture',
    async (fixtureKind, description) => {
      const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-capture-fixture-'));
      const outputPath = path.join(fixtureRoot, 'capture.png');
      const previewRoot = path.join(fixtureRoot, 'preview-source');
      const sentinel = Buffer.from(`untouched-${fixtureKind}`);

      await cp(sharedBuildRoot, previewRoot, { recursive: true });
      await writeFile(outputPath, sentinel);

      if (fixtureKind === 'image') {
        const indexPath = path.join(previewRoot, 'index.html');
        const indexHtml = await readFile(indexPath, 'utf8');
        await writeFile(
          indexPath,
          indexHtml.replace(
            '/assets/hero/thqllm-title-desktop.webp',
            '/assets/hero/definitely-missing.webp',
          ),
          'utf8',
        );
      } else {
        const cssPath = (await readdir(path.join(previewRoot, 'static/css'))).find((name) =>
          name.endsWith('.css'),
        );
        if (!cssPath) {
          throw new Error('Could not find the built stylesheet for the font fixture');
        }

        const stylesheetPath = path.join(previewRoot, 'static/css', cssPath);
        const stylesheet = await readFile(stylesheetPath, 'utf8');
        await writeFile(
          stylesheetPath,
          stylesheet.replaceAll(
            /url\([^)]*cormorant-garamond-[^)]*\)/g,
            'url(/static/font/definitely-missing.woff2)',
          ),
          'utf8',
        );
      }

      const requestedPort = await getAvailablePort();
      try {
        const result = await runCaptureFailure(
          outputPath,
          requestedPort,
          ['--skip-build', '--preview-root', previewRoot],
          { THQLLM_CAPTURE_TEST_EVENTS: '1' },
        );

        expect(result.code, description).not.toBe(0);
        expect(await readFile(outputPath)).toEqual(sentinel);
        const expectedFailure =
          fixtureKind === 'image'
            ? 'Required image failed to load or decode'
            : 'Required font unavailable';
        expect(`${result.output.stdout}\n${result.output.stderr}`).toContain(expectedFailure);

        const previewRootMatch = result.output.stdout.match(
          /Capture preview root: ([^\r\n]+thqllm-capture-preview-[^\r\n]+)/,
        );
        expect(previewRootMatch, 'capture must report its isolated temporary root').not.toBeNull();
        await expect(stat(previewRootMatch?.[1] ?? '')).rejects.toMatchObject({
          code: 'ENOENT',
        });
      } finally {
        await rm(fixtureRoot, { force: true, recursive: true });
      }
    },
    120_000,
  );

  it('keeps the broken-image failure primary when cleanup also fails', async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-capture-primary-error-'));
    const outputPath = path.join(fixtureRoot, 'capture.png');
    const previewRoot = path.join(fixtureRoot, 'preview-source');
    const sentinel = Buffer.from('untouched-primary-error');

    await cp(sharedBuildRoot, previewRoot, { recursive: true });
    await writeFile(outputPath, sentinel);
    const indexPath = path.join(previewRoot, 'index.html');
    const indexHtml = await readFile(indexPath, 'utf8');
    await writeFile(
      indexPath,
      indexHtml.replace(
        '/assets/hero/thqllm-title-desktop.webp',
        '/assets/hero/definitely-missing.webp',
      ),
      'utf8',
    );

    const processHandle = spawnCapture(
      outputPath,
      await getAvailablePort(),
      ['--skip-build', '--preview-root', previewRoot],
      {
        THQLLM_CAPTURE_TEST_CLEANUP_FAILURE: 'cleanup sentinel',
        THQLLM_CAPTURE_TEST_EVENTS: '1',
      },
    );

    try {
      const result = await waitForExit(processHandle.child, 120_000);
      const combinedOutput = `${processHandle.output.stdout}\n${processHandle.output.stderr}`;
      const operationIndex = combinedOutput.indexOf('Required image failed to load or decode');
      const cleanupIndex = combinedOutput.indexOf('cleanup sentinel');

      expect(result.code).not.toBe(0);
      expect(await readFile(outputPath)).toEqual(sentinel);
      expect(operationIndex).toBeGreaterThanOrEqual(0);
      expect(cleanupIndex).toBeGreaterThan(operationIndex);
    } finally {
      await terminateCapture(processHandle.child);
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  }, 120_000);

  signalIt.each(['SIGINT', 'SIGTERM'])(
    'gracefully cleans the preview process tree when the parent receives %s',
    async (signal) => {
      const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-capture-signal-'));
      const outputPath = path.join(fixtureRoot, 'capture.png');
      const requestedPort = await getAvailablePort();
      const processHandle = spawnCapture(outputPath, requestedPort, ['--skip-build'], {
        THQLLM_CAPTURE_TEST_EVENTS: '1',
      });
      let actualPort;

      try {
        const readyMatch = await waitForOutput(
          processHandle,
          /Preview ready at http:\/\/127\.0\.0\.1:(\d+)/,
        );
        actualPort = Number(readyMatch[1]);
        const previewRootMatch = await waitForOutput(
          processHandle,
          /Capture preview root: ([^\r\n]+)/,
        );
        const configRootMatch = await waitForOutput(
          processHandle,
          /Capture preview config root: ([^\r\n]+)/,
          5_000,
        );
        expect(await isPortListening(actualPort)).toBe(true);

        processHandle.child.kill(signal);
        const result = await waitForExit(processHandle.child);

        expect(result.code).not.toBe(0);
        await waitForPortState(actualPort, false);
        await expect(stat(previewRootMatch[1].trim())).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(stat(configRootMatch[1].trim())).rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        if (processHandle.child.exitCode === null && processHandle.child.signalCode === null) {
          processHandle.child.kill('SIGKILL');
          await waitForExit(processHandle.child).catch(() => undefined);
        }
        await rm(fixtureRoot, { force: true, recursive: true });
      }
    },
    60_000,
  );

  signalIt.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])(
    'cleans marker and isolated preview root when %s arrives during marker staging',
    async (signal, expectedExitCode) => {
      const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-capture-early-signal-'));
      const outputPath = path.join(fixtureRoot, 'capture.png');
      const requestedPort = await getAvailablePort();
      const processHandle = spawnCapture(outputPath, requestedPort, ['--skip-build'], {
        THQLLM_CAPTURE_TEST_EVENTS: '1',
      });

      try {
        const markerMatch = await waitForOutput(
          processHandle,
          /Capture marker staged: ([^\r\n]+)/,
          30_000,
        );
        const markerFilePath = markerMatch[1].trim();
        const rootMatch = await waitForOutput(
          processHandle,
          /Capture preview root: ([^\r\n]+)/,
          30_000,
        );
        const isolatedRoot = rootMatch[1].trim();

        processHandle.child.kill(signal);
        const result = await waitForExit(processHandle.child, 30_000);

        expect(result.code).toBe(expectedExitCode);
        await expect(stat(markerFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(stat(isolatedRoot)).rejects.toMatchObject({ code: 'ENOENT' });
        await waitForPortState(requestedPort, false);
      } finally {
        if (processHandle.child.exitCode === null && processHandle.child.signalCode === null) {
          processHandle.child.kill('SIGKILL');
          await waitForExit(processHandle.child).catch(() => undefined);
        }
        await rm(fixtureRoot, { force: true, recursive: true });
      }
    },
    60_000,
  );

  signalIt(
    'force exits on a second signal while cleanup is blocked',
    async () => {
      const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-capture-force-signal-'));
      const outputPath = path.join(fixtureRoot, 'capture.png');
      const requestedPort = await getAvailablePort();
      const processHandle = spawnCapture(outputPath, requestedPort, ['--skip-build'], {
        THQLLM_CAPTURE_TEST_EVENTS: '1',
        THQLLM_CAPTURE_TEST_HANG_CLEANUP: '1',
      });
      let actualPort;

      try {
        const readyMatch = await waitForOutput(
          processHandle,
          /Preview ready at http:\/\/127\.0\.0\.1:(\d+)/,
          5_000,
        );
        actualPort = Number(readyMatch[1]);
        const previewRootMatch = await waitForOutput(
          processHandle,
          /Capture preview root: ([^\r\n]+)/,
          1_000,
        );
        const configRootMatch = await waitForOutput(
          processHandle,
          /Capture preview config root: ([^\r\n]+)/,
          1_000,
        );
        await waitForOutput(processHandle, /Capture test cleanup pending/, 1_000);

        processHandle.child.kill('SIGINT');
        await waitForOutput(processHandle, /Capture signal cleanup started: SIGINT/, 1_000);
        expect(await isPortListening(actualPort)).toBe(true);

        const forcedAt = Date.now();
        processHandle.child.kill('SIGINT');
        const result = await waitForExit(processHandle.child, 2_000);

        expect(result.code).toBe(130);
        expect(Date.now() - forcedAt).toBeLessThan(2_000);
        await waitForPortState(actualPort, false, 2_000);
        await expect(stat(previewRootMatch[1].trim())).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(stat(configRootMatch[1].trim())).rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        await terminateCapture(processHandle.child);
        await rm(fixtureRoot, { force: true, recursive: true });
      }
    },
    15_000,
  );
});
