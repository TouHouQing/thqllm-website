export interface DanmakuBullet {
  x: number;
  y: number;
  rotation: number;
  color: string;
}

export interface DanmakuExclusionBand {
  menuBottom: number;
  scrollHintTop: number;
}

export interface DanmakuGeometry {
  centerX: number;
  centerY: number;
  radius: number;
}

export interface MobileDanmakuLayout {
  preset: 'mobile';
  exclusionBand: DanmakuExclusionBand;
}

export type DanmakuLayout = 'desktop' | MobileDanmakuLayout;

export const DANMAKU_BULLET_RADIUS_X = 4;
export const DANMAKU_BULLET_RADIUS_Y = 9;
export const DANMAKU_BULLET_SHADOW_BLUR = 8;
export const DANMAKU_BULLET_PROTECTION_RADIUS =
  DANMAKU_BULLET_RADIUS_Y + DANMAKU_BULLET_SHADOW_BLUR;

const MOBILE_PREFERRED_CENTER_X_RATIO = 0.72;
const MOBILE_PREFERRED_CENTER_Y_RATIO = 0.72;
const MOBILE_PREFERRED_RADIUS_RATIO = 0.2;
const MOBILE_MINIMUM_RADIUS = 32;
const MOBILE_EXCLUSION_GAP = 6;
const ORBIT_MAX_RADIUS_FACTOR = 1.08;
const colors = ['#70D8C7', '#F28AA0', '#F4CF71'] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createMobileDanmakuGeometry(
  width: number,
  height: number,
  exclusionBand: DanmakuExclusionBand,
): DanmakuGeometry | null {
  if (
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(exclusionBand.menuBottom) ||
    !Number.isFinite(exclusionBand.scrollHintTop)
  ) {
    return null;
  }

  const menuBottom = clamp(exclusionBand.menuBottom, 0, height);
  const scrollHintTop = clamp(exclusionBand.scrollHintTop, 0, height);
  const protectedInset = DANMAKU_BULLET_PROTECTION_RADIUS + MOBILE_EXCLUSION_GAP;
  const availableWidth = width - protectedInset * 2;
  const availableHeight = scrollHintTop - menuBottom - protectedInset * 2;
  const maximumRadius = Math.min(availableWidth, availableHeight) / (ORBIT_MAX_RADIUS_FACTOR * 2);
  const preferredRadius = Math.min(width, height) * MOBILE_PREFERRED_RADIUS_RATIO;
  const radius = Math.min(preferredRadius, maximumRadius);

  if (!Number.isFinite(radius) || radius < MOBILE_MINIMUM_RADIUS) {
    return null;
  }

  const maximumOrbitRadius = radius * ORBIT_MAX_RADIUS_FACTOR;
  const minimumCenterX = protectedInset + maximumOrbitRadius;
  const maximumCenterX = width - protectedInset - maximumOrbitRadius;
  const minimumCenterY = menuBottom + protectedInset + maximumOrbitRadius;
  const maximumCenterY = scrollHintTop - protectedInset - maximumOrbitRadius;

  if (minimumCenterX > maximumCenterX || minimumCenterY > maximumCenterY) {
    return null;
  }

  return {
    centerX: clamp(width * MOBILE_PREFERRED_CENTER_X_RATIO, minimumCenterX, maximumCenterX),
    centerY: clamp(height * MOBILE_PREFERRED_CENTER_Y_RATIO, minimumCenterY, maximumCenterY),
    radius,
  };
}

export function createDanmakuFrame(
  width: number,
  height: number,
  angle: number,
  count = 24,
  layout: DanmakuLayout = 'desktop',
): DanmakuBullet[] {
  let centerX = width * 0.72;
  let centerY = height * 0.43;
  let radius = Math.min(width, height) * 0.28;

  if (layout !== 'desktop') {
    const geometry = createMobileDanmakuGeometry(width, height, layout.exclusionBand);
    if (!geometry) {
      return [];
    }

    centerX = geometry.centerX;
    centerY = geometry.centerY;
    radius = geometry.radius;
  }

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
