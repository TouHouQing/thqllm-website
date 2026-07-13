export interface DanmakuBullet {
  x: number;
  y: number;
  rotation: number;
  color: string;
}

const colors = ['#70D8C7', '#F28AA0', '#F4CF71'] as const;

export function createDanmakuFrame(
  width: number,
  height: number,
  angle: number,
  count = 24,
): DanmakuBullet[] {
  const centerX = width * 0.72;
  const centerY = height * 0.43;
  const radius = Math.min(width, height) * 0.28;

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
