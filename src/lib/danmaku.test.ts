import { describe, expect, it } from 'vitest';
import { createDanmakuFrame } from './danmaku';

describe('createDanmakuFrame', () => {
  it('returns a deterministic number of bullets', () => {
    const first = createDanmakuFrame(800, 600, 0, 24);
    const second = createDanmakuFrame(800, 600, 0, 24);
    expect(first).toEqual(second);
    expect(first).toHaveLength(24);
  });

  it('keeps every bullet within the viewport', () => {
    for (const bullet of createDanmakuFrame(800, 600, Math.PI / 3, 24)) {
      expect(bullet.x).toBeGreaterThanOrEqual(0);
      expect(bullet.x).toBeLessThanOrEqual(800);
      expect(bullet.y).toBeGreaterThanOrEqual(0);
      expect(bullet.y).toBeLessThanOrEqual(600);
    }
  });
});
