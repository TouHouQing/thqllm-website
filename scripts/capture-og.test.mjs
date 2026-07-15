import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');
const captureScript = path.join(import.meta.dirname, 'capture-og.mjs');

function runCapture(outputPath, port, extraArgs = []) {
  return new Promise((resolve, reject) => {
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
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`capture-og failed with ${code ?? signal}\n${stdout}\n${stderr}`));
    });
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('capture-og', () => {
  it('captures deterministic 1200x630 output and cleans its preview between runs', async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'thqllm-capture-og-'));
    const firstOutput = path.join(fixtureRoot, 'first.png');
    const secondOutput = path.join(fixtureRoot, 'second.png');
    const port = 4317;

    try {
      await runCapture(firstOutput, port);
      await runCapture(secondOutput, port, ['--', '--skip-build']);

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
});
