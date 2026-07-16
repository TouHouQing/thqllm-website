import { describe, expect, it } from 'vitest';
import { readBoundedRegularFile } from './bounded-file.mjs';

describe('bounded regular-file reading', () => {
  it('rejects an oversized stat without opening or reading the file', async () => {
    let openCalls = 0;

    await expect(
      readBoundedRegularFile('/fake/favicon.svg', {
        description: 'Critical asset favicon.svg',
        maxBytes: 4,
        openFile: async () => {
          openCalls += 1;
          throw new Error('openFile must not be called');
        },
        stats: { size: 5 },
      }),
    ).rejects.toThrow('Critical asset favicon.svg exceeds maximum 4 bytes; stat reported 5 bytes.');
    expect(openCalls).toBe(0);
  });

  it('reads at most maxBytes plus one when the file grows after stat', async () => {
    const source = Buffer.from('abcdef');
    const reads = [];
    let closed = false;

    await expect(
      readBoundedRegularFile('/fake/favicon.svg', {
        description: 'Critical asset favicon.svg',
        maxBytes: 4,
        openFile: async () => ({
          async close() {
            closed = true;
          },
          async read(buffer, offset, length, position) {
            const bytesRead = Math.min(length, source.length - position);
            source.copy(buffer, offset, position, position + bytesRead);
            reads.push({ bytesRead, length, position });
            return { buffer, bytesRead };
          },
        }),
        stats: { size: 4 },
      }),
    ).rejects.toThrow(
      'Critical asset favicon.svg exceeds maximum 4 bytes; found at least 5 bytes while reading.',
    );

    expect(reads).toEqual([{ bytesRead: 5, length: 5, position: 0 }]);
    expect(closed).toBe(true);
  });

  it('loops across short reads until EOF', async () => {
    const source = Buffer.from('abcdef');
    const reads = [];
    let closed = false;

    const result = await readBoundedRegularFile('/fake/favicon.svg', {
      description: 'Critical asset favicon.svg',
      maxBytes: 10,
      openFile: async () => ({
        async close() {
          closed = true;
        },
        async read(buffer, offset, length, position) {
          const bytesRead = Math.min(2, length, source.length - position);
          source.copy(buffer, offset, position, position + bytesRead);
          reads.push({ bytesRead, position });
          return { buffer, bytesRead };
        },
      }),
      stats: { size: source.length },
    });

    expect(result).toEqual(source);
    expect(reads).toEqual([
      { bytesRead: 2, position: 0 },
      { bytesRead: 2, position: 2 },
      { bytesRead: 2, position: 4 },
      { bytesRead: 0, position: 6 },
    ]);
    expect(closed).toBe(true);
  });
});
