import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const defaultOutputPath = path.join(repoRoot, 'site/public/og-cover.png');
const defaultPort = 4317;
const previewHost = '127.0.0.1';
const captureWidth = 1200;
const captureHeight = 630;
const serverTimeoutMs = 60_000;
const fetchTimeoutMs = 2_000;
const shutdownTimeoutMs = 5_000;
const markerPrefix = '__thqllm-capture-marker-';
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

class PreviewNotReadyError extends Error {}

class PreviewIdentityError extends Error {}

function printUsage() {
  console.log(`Usage: pnpm capture:og [options]

Options:
  --output <path>     PNG output path (default: site/public/og-cover.png)
  --port <number>     Preferred preview port (default: ${defaultPort})
  --skip-build        Reuse the existing doc_build output
  --help              Show this help
`);
}

function parseArgs(argv) {
  const options = {
    outputPath: defaultOutputPath,
    port: defaultPort,
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

    if (argument === '--output' || argument === '--port') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }

      if (argument === '--output') {
        options.outputPath = path.resolve(value);
      } else {
        options.port = Number(value);
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
  return {
    ...process.env,
    CI: '1',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    TZ: 'UTC',
  };
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
  return new Promise((resolve) => {
    const child = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.once('error', () => resolve());
    child.once('exit', () => resolve());
  });
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
    if (child.pid === undefined) {
      return;
    }

    if (process.platform === 'win32') {
      await runTaskkill(child.pid);
      await waitForExit(child, shutdownTimeoutMs);
      return;
    }

    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
    await waitForExit(child, shutdownTimeoutMs);

    try {
      process.kill(-child.pid, 0);
      process.kill(-child.pid, 'SIGKILL');
      await waitForExit(child, shutdownTimeoutMs);
    } catch {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  })();

  processTreeStops.set(child, stopPromise);
  return stopPromise;
}

function createResourceTracker() {
  const children = new Set();
  let browser;
  let markerCleanup;
  let cleanupPromise;

  return {
    addChild(child) {
      children.add(child);
    },
    setBrowser(nextBrowser) {
      browser = nextBrowser;
    },
    setMarkerCleanup(cleanup) {
      markerCleanup = cleanup;
    },
    cleanup() {
      if (cleanupPromise) {
        return cleanupPromise;
      }

      cleanupPromise = (async () => {
        if (browser) {
          await browser.close().catch(() => undefined);
        }
        await Promise.all([...children].map((child) => stopProcessTree(child)));
        await markerCleanup?.();
        children.clear();
      })();
      return cleanupPromise;
    },
  };
}

function installSignalHandlers(tracker) {
  let signalCleanup;
  const signalConfigs = [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ];
  const handlers = [];

  for (const [signal, exitCode] of signalConfigs) {
    const handler = () => {
      if (signalCleanup) {
        return;
      }

      signalCleanup = tracker
        .cleanup()
        .catch(() => undefined)
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
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, previewHost);
  });
}

function closeServer(server) {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function reserveAvailablePort(preferredPort) {
  const candidates =
    preferredPort === 0
      ? [0]
      : [
          preferredPort,
          ...Array.from({ length: 32 }, (_, index) => preferredPort + index + 1).filter(
            (port) => port <= 65_535,
          ),
          0,
        ];

  for (const candidate of candidates) {
    const server = createServer();
    try {
      await listen(server, candidate);
      const address = server.address();
      if (!address || typeof address === 'string') {
        await closeServer(server);
        throw new Error('Could not determine the reserved preview port');
      }

      return {
        port: address.port,
        release: () => closeServer(server),
      };
    } catch (error) {
      await closeServer(server);
      if (error?.code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }

  throw new Error(`No available preview port near ${preferredPort}`);
}

async function createPreviewMarker() {
  const marker = `${markerPrefix}${randomUUID()}`;
  const fileName = `${marker}.txt`;
  const filePath = path.join(repoRoot, 'doc_build', fileName);
  await writeFile(filePath, `${marker}\n`, 'utf8');

  return {
    marker,
    path: `/${fileName}`,
    cleanup: () => rm(filePath, { force: true }),
  };
}

async function fetchWithTimeout(url) {
  return fetch(url, { signal: AbortSignal.timeout(fetchTimeoutMs) });
}

async function validatePreviewReady(previewUrl, markerPath, marker) {
  let rootResponse;
  try {
    rootResponse = await fetchWithTimeout(previewUrl);
  } catch {
    throw new PreviewNotReadyError(`Preview did not respond at ${previewUrl}`);
  }

  if (!rootResponse.ok) {
    throw new PreviewNotReadyError(`Preview root returned HTTP ${rootResponse.status}`);
  }

  const contentType = rootResponse.headers.get('content-type') ?? '';
  const rootBody = await rootResponse.text();
  if (!contentType.includes('text/html') || !rootBody.includes('<title>THQLLM</title>')) {
    throw new PreviewIdentityError(`Preview root is not the THQLLM HTML page at ${previewUrl}`);
  }

  let markerResponse;
  try {
    markerResponse = await fetchWithTimeout(new URL(markerPath, previewUrl));
  } catch {
    throw new PreviewIdentityError(`Preview marker did not respond at ${markerPath}`);
  }

  if (!markerResponse.ok) {
    throw new PreviewIdentityError(
      `Preview marker returned HTTP ${markerResponse.status} at ${markerPath}`,
    );
  }

  const returnedMarker = (await markerResponse.text()).trim();
  if (returnedMarker !== marker) {
    throw new PreviewIdentityError(`Preview marker mismatch at ${markerPath}`);
  }
}

async function waitForPreview(preview, previewUrl, markerPath, marker) {
  const output = { value: '' };
  preview.stdout.on('data', (chunk) => appendOutput(output, chunk));
  preview.stderr.on('data', (chunk) => appendOutput(output, chunk));
  const deadline = Date.now() + serverTimeoutMs;

  while (Date.now() < deadline) {
    if (preview.exitCode !== null || preview.signalCode !== null) {
      throw new Error(`Preview exited before becoming ready\n${output.value}`);
    }

    try {
      await validatePreviewReady(previewUrl, markerPath, marker);
      return;
    } catch (error) {
      if (!(error instanceof PreviewNotReadyError)) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Preview did not become ready at ${previewUrl}\n${output.value}`);
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

async function capture(options, tracker) {
  const marker = await createPreviewMarker();
  tracker.setMarkerCleanup(marker.cleanup);

  const reservation = await reserveAvailablePort(options.port);
  await reservation.release();

  const previewUrl = `http://${previewHost}:${reservation.port}/`;
  const preview = spawnManaged(
    commandName(),
    ['preview', '--host', previewHost, '--port', String(reservation.port)],
    {
      cwd: repoRoot,
      env: commandEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
    tracker,
  );

  await waitForPreview(preview, previewUrl, marker.path, marker.marker);
  console.log(`Preview ready at ${previewUrl} marker=${marker.path}`);

  const browser = await chromium.launch({ headless: true });
  tracker.setBrowser(browser);
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    viewport: { width: captureWidth, height: captureHeight },
  });
  const page = await context.newPage();
  await page.goto(previewUrl, { waitUntil: 'networkidle' });
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
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await page.screenshot({
    animations: 'disabled',
    clip: { x: 0, y: 0, width: captureWidth, height: captureHeight },
    path: options.outputPath,
    scale: 'css',
    type: 'png',
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tracker = createResourceTracker();
  const removeSignalHandlers = installSignalHandlers(tracker);

  try {
    if (!options.skipBuild) {
      await runCommand(commandName(), ['build'], tracker);
    }

    await capture(options, tracker);
    console.log(
      `Captured deterministic ${captureWidth}x${captureHeight} OG PNG at ${path.relative(repoRoot, options.outputPath)}`,
    );
  } finally {
    await tracker.cleanup();
    removeSignalHandlers();
  }
}

export { validatePreviewReady, waitForPageAssets };

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
