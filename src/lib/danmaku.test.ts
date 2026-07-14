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

function createMobileLayout(menuBottom: number, scrollHintTop: number) {
  return {
    preset: 'mobile',
    exclusionBand: {
      menuBottom,
      scrollHintTop,
    },
  } as const;
}

function inspectCompleteOrbit(
  width: number,
  height: number,
  menuBottom: number,
  scrollHintTop: number,
) {
  const exclusionRects = [
    { left: 0, top: 0, right: width, bottom: menuBottom },
    { left: 0, top: scrollHintTop, right: width, bottom: height },
  ];
  let overlapCount = 0;
  let outOfBoundsCount = 0;
  let firstOverlap: { angle: number; index: number } | undefined;
  let firstOutOfBounds: { angle: number; index: number } | undefined;

  for (let step = 0; step < 1440; step += 1) {
    const angle = (Math.PI * 2 * step) / 1440;
    const frame = createDanmakuFrame(
      width,
      height,
      angle,
      16,
      createMobileLayout(menuBottom, scrollHintTop),
    );

    for (const [index, bullet] of frame.entries()) {
      if (exclusionRects.some((rect) => overlapsProtectedRect(bullet, rect))) {
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

  return {
    overlapCount,
    outOfBoundsCount,
    firstOverlap,
    firstOutOfBounds,
  };
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
    const width = 390;
    const height = 679;
    const layout = createMobileLayout(361, 637);
    const first = createDanmakuFrame(width, height, 0, 16, layout);
    const second = createDanmakuFrame(width, height, 0, 16, layout);

    expect(first).toEqual(second);
    expect(first).toHaveLength(16);
  });

  it('adapts the complete mobile orbit to the available exclusion band', () => {
    const orbit = inspectCompleteOrbit(320, 568, 352, 526);

    expect(orbit.overlapCount, `first overlap: ${JSON.stringify(orbit.firstOverlap)}`).toBe(0);
    expect(
      orbit.outOfBoundsCount,
      `first out of bounds: ${JSON.stringify(orbit.firstOutOfBounds)}`,
    ).toBe(0);
  });

  it('returns no mobile bullets when the safe band cannot fit a useful orbit', () => {
    const frame = createDanmakuFrame(640, 360, 0, 16, createMobileLayout(280, 318));

    expect(frame).toEqual([]);
  });
});
