import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
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
const shutdownTimeoutMs = 5_000;

function printUsage() {
  console.log(`Usage: pnpm capture:og [options]

Options:
  --output <path>     PNG output path (default: site/public/og-cover.png)
  --port <number>     Temporary preview port (default: ${defaultPort})
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

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) {
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

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const output = { value: '' };
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: commandEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      finish();
    });
  });
}

function signalProcess(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }

  if (process.platform === 'win32') {
    child.kill();
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

async function stopPreview(preview) {
  signalProcess(preview, 'SIGTERM');
  await waitForExit(preview, shutdownTimeoutMs);
  if (preview.exitCode === null && preview.signalCode === null) {
    signalProcess(preview, 'SIGKILL');
    await waitForExit(preview, shutdownTimeoutMs);
  }
}

async function waitForPreview(preview, url) {
  const output = { value: '' };
  preview.stdout.on('data', (chunk) => appendOutput(output, chunk));
  preview.stderr.on('data', (chunk) => appendOutput(output, chunk));

  const deadline = Date.now() + serverTimeoutMs;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null || preview.signalCode !== null) {
      throw new Error(`Preview exited before becoming ready\n${output.value}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The preview is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Preview did not become ready at ${url}\n${output.value}`);
}

async function waitForPageAssets(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, async (image) => {
        if (!image.complete) {
          await new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          });
        }

        await image.decode().catch(() => undefined);
      }),
    );
  });

  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[data-testid="danmaku-canvas"]');
    return (
      canvas instanceof HTMLCanvasElement &&
      canvas.dataset.motion === 'reduced' &&
      canvas.dataset.danmakuFrame !== undefined
    );
  });
}

async function capture(outputPath, port) {
  const previewUrl = `http://${previewHost}:${port}/`;
  const preview = spawn(commandName(), ['preview', '--host', previewHost, '--port', String(port)], {
    cwd: repoRoot,
    detached: process.platform !== 'win32',
    env: commandEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let browser;
  try {
    await waitForPreview(preview, previewUrl);
    browser = await chromium.launch({ headless: true });
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
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    await mkdir(path.dirname(outputPath), { recursive: true });
    await page.screenshot({
      animations: 'disabled',
      clip: { x: 0, y: 0, width: captureWidth, height: captureHeight },
      path: outputPath,
      scale: 'css',
      type: 'png',
    });
    await context.close();
  } finally {
    await browser?.close();
    await stopPreview(preview);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.skipBuild) {
    await runCommand(commandName(), ['build']);
  }

  await capture(options.outputPath, options.port);
  console.log(
    `Captured deterministic ${captureWidth}x${captureHeight} OG PNG at ${path.relative(repoRoot, options.outputPath)}`,
  );
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
