import { describe, expect, it } from 'vitest';
import { createDanmakuFrame, DANMAKU_BULLET_PROTECTION_RADIUS } from './danmaku';

interface ExclusionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlapsProtectedRect(bullet: { x: number; y: number }, rect: ExclusionRect): boolean {
  return (
    bullet.x + DANMAKU_BULLET_PROTECTION_RADIUS > rect.left &&
    bullet.x - DANMAKU_BULLET_PROTECTION_RADIUS < rect.right &&
    bullet.y + DANMAKU_BULLET_PROTECTION_RADIUS > rect.top &&
    bullet.y - DANMAKU_BULLET_PROTECTION_RADIUS < rect.bottom
  );
}

describe('createDanmakuFrame', () => {
  it('returns a deterministic number of bullets', () => {
    const first = createDanmakuFrame(800, 600, 0, 24);
    const second = createDanmakuFrame(800, 600, 0, 24);
    expect(first).toEqual(second);
    expect(first).toHaveLength(24);
    expect(first[0]).toEqual({
      x: 744,
      y: 258,
      rotation: Math.PI / 2,
      color: '#70D8C7',
    });
  });

  it('keeps every desktop bullet visually within the viewport', () => {
    for (const bullet of createDanmakuFrame(800, 600, Math.PI / 3, 24)) {
      expect(bullet.x - DANMAKU_BULLET_PROTECTION_RADIUS).toBeGreaterThanOrEqual(0);
      expect(bullet.x + DANMAKU_BULLET_PROTECTION_RADIUS).toBeLessThanOrEqual(800);
      expect(bullet.y - DANMAKU_BULLET_PROTECTION_RADIUS).toBeGreaterThanOrEqual(0);
      expect(bullet.y + DANMAKU_BULLET_PROTECTION_RADIUS).toBeLessThanOrEqual(600);
    }
  });

  it('returns a deterministic mobile frame', () => {
    const width = 360;
    const height = 640;
    const first = createDanmakuFrame(width, height, 0, 16, 'mobile');
    const second = createDanmakuFrame(width, height, 0, 16, 'mobile');

    expect(first).toEqual(second);
    expect(first).toHaveLength(16);
  });

  it('keeps the complete mobile orbit in bounds and outside the menu exclusion rectangle', () => {
    const width = 360;
    const height = 640;
    const menuRect = {
      left: 16,
      top: 168,
      right: width - 16,
      bottom: 349,
    };
    let overlapCount = 0;
    let outOfBoundsCount = 0;
    let firstOverlap: { angle: number; index: number } | undefined;
    let firstOutOfBounds: { angle: number; index: number } | undefined;

    for (let step = 0; step < 1440; step += 1) {
      const angle = (Math.PI * 2 * step) / 1440;
      const frame = createDanmakuFrame(width, height, angle, 16, 'mobile');

      for (const [index, bullet] of frame.entries()) {
        if (overlapsProtectedRect(bullet, menuRect)) {
          overlapCount += 1;
          firstOverlap ??= { angle, index };
        }

        if (
          bullet.x - DANMAKU_BULLET_PROTECTION_RADIUS < 0 ||
          bullet.x + DANMAKU_BULLET_PROTECTION_RADIUS > width ||
          bullet.y - DANMAKU_BULLET_PROTECTION_RADIUS < 0 ||
          bullet.y + DANMAKU_BULLET_PROTECTION_RADIUS > height
        ) {
          outOfBoundsCount += 1;
          firstOutOfBounds ??= { angle, index };
        }
      }
    }

    expect(overlapCount, `first overlap: ${JSON.stringify(firstOverlap)}`).toBe(0);
    expect(outOfBoundsCount, `first out of bounds: ${JSON.stringify(firstOutOfBounds)}`).toBe(0);
  });
});
