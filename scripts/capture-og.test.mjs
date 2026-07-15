import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { validatePreviewReady, waitForPageAssets } from './capture-og.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const captureScript = path.join(import.meta.dirname, 'capture-og.mjs');
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

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

function spawnCapture(outputPath, port, extraArgs = []) {
  const child = spawn(
    process.execPath,
    [captureScript, '--output', outputPath, '--port', String(port), ...extraArgs],
    {
      cwd: repoRoot,
      env: { ...process.env, CI: '1', TZ: 'UTC' },
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

  return Promise.race([
    once(child, 'exit').then(([code, signal]) => ({ code, signal })),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timed out waiting for capture process')), timeoutMs);
    }),
  ]);
}

async function runCapture(outputPath, port, extraArgs = []) {
  const processHandle = spawnCapture(outputPath, port, extraArgs);
  const result = await waitForExit(processHandle.child, 120_000);
  if (result.code !== 0) {
    const { stdout, stderr } = processHandle.output;
    throw new Error(`capture-og failed with ${result.code ?? result.signal}\n${stdout}\n${stderr}`);
  }

  return processHandle.output;
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

  it('rejects a THQLLM-looking 2xx response without the run marker', async () => {
    const fake = await startServer(0, (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html><title>THQLLM</title><body>THQLLM</body></html>');
    });

    try {
      await expect(
        validatePreviewReady(`http://127.0.0.1:${fake.port}`, '/marker.txt', 'run-marker'),
      ).rejects.toThrow(/marker/i);
    } finally {
      await closeServer(fake.server);
    }
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
    'SIGINT',
    'SIGTERM',
  ])('idempotently cleans the preview process tree when the parent receives %s', async (signal) => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-capture-signal-'));
    const outputPath = path.join(fixtureRoot, 'capture.png');
    const requestedPort = await getAvailablePort();
    const processHandle = spawnCapture(outputPath, requestedPort, ['--skip-build']);
    let actualPort;

    try {
      const readyMatch = await waitForOutput(
        processHandle,
        /Preview ready at http:\/\/127\.0\.0\.1:(\d+)/,
      );
      actualPort = Number(readyMatch[1]);
      expect(await isPortListening(actualPort)).toBe(true);

      processHandle.child.kill(signal);
      processHandle.child.kill(signal);
      const result = await waitForExit(processHandle.child);

      expect(result.code).not.toBe(0);
      await waitForPortState(actualPort, false);
      const markerFiles = (await readdir(path.join(repoRoot, 'doc_build'))).filter((name) =>
        name.startsWith('__thqllm-capture-marker-'),
      );
      expect(markerFiles).toEqual([]);
    } finally {
      if (processHandle.child.exitCode === null && processHandle.child.signalCode === null) {
        processHandle.child.kill('SIGKILL');
        await waitForExit(processHandle.child).catch(() => undefined);
      }
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  }, 60_000);
});
