export interface DanmakuBullet {
  x: number;
  y: number;
  rotation: number;
  color: string;
}

export type DanmakuPreset = 'desktop' | 'mobile';

export const DANMAKU_BULLET_RADIUS_X = 4;
export const DANMAKU_BULLET_RADIUS_Y = 9;
export const DANMAKU_BULLET_SHADOW_BLUR = 8;
export const DANMAKU_BULLET_PROTECTION_RADIUS =
  DANMAKU_BULLET_RADIUS_Y + DANMAKU_BULLET_SHADOW_BLUR;

const colors = ['#70D8C7', '#F28AA0', '#F4CF71'] as const;

export function createDanmakuFrame(
  width: number,
  height: number,
  angle: number,
  count = 24,
  preset: DanmakuPreset = 'desktop',
): DanmakuBullet[] {
  const centerX = width * 0.72;
  const centerY = height * (preset === 'mobile' ? 0.72 : 0.43);
  const radius = Math.min(width, height) * (preset === 'mobile' ? 0.2 : 0.28);

  return Array.from({ length: count }, (_, index) => {
    const rotation = angle + (Math.PI * 2 * index) / count;
    const wave = Math.sin(rotation * 3) * radius * 0.08;
    const currentRadius = radius + wave;
    return {
      x: Math.min(width, Math.max(0, centerX + Math.cos(rotation) * currentRadius)),
      y: Math.min(height, Math.max(0, centerY + Math.sin(rotation) * currentRadius)),
      rotation: rotation + Math.PI / 2,
      color: colors[index % colors.length],
    };
  });
}
