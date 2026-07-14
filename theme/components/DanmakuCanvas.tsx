import { useEffect, useRef } from 'react';
import {
  createDanmakuFrame,
  DANMAKU_BULLET_RADIUS_X,
  DANMAKU_BULLET_RADIUS_Y,
  DANMAKU_BULLET_SHADOW_BLUR,
} from '../../src/lib/danmaku';

const MOBILE_BREAKPOINT = 640;
const MOBILE_BULLET_COUNT = 16;
const DESKTOP_BULLET_COUNT = 24;
const ROTATION_PER_MILLISECOND = 0.000108;

export function DanmakuCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frameId: number | undefined;
    let previousTime: number | undefined;
    let angle = 0;
    let width = 0;
    let height = 0;
    let ratio = 1;

    const draw = () => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const preset = width <= MOBILE_BREAKPOINT ? 'mobile' : 'desktop';
      const bulletCount = preset === 'mobile' ? MOBILE_BULLET_COUNT : DESKTOP_BULLET_COUNT;
      const bullets = createDanmakuFrame(width, height, angle, bulletCount, preset);
      if (reducedMotion) {
        canvas.dataset.danmakuFrame = JSON.stringify(bullets);
      }

      for (const bullet of bullets) {
        context.save();
        context.translate(bullet.x, bullet.y);
        context.rotate(bullet.rotation);
        context.fillStyle = bullet.color;
        context.shadowColor = bullet.color;
        context.shadowBlur = DANMAKU_BULLET_SHADOW_BLUR;
        context.beginPath();
        context.ellipse(0, 0, DANMAKU_BULLET_RADIUS_X, DANMAKU_BULLET_RADIUS_Y, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      draw();
    };

    const animate = (time: number) => {
      if (previousTime !== undefined) {
        const elapsed = Math.min(time - previousTime, 64);
        angle += elapsed * ROTATION_PER_MILLISECOND;
      }
      previousTime = time;
      draw();
      frameId = window.requestAnimationFrame(animate);
    };

    canvas.dataset.motion = reducedMotion ? 'reduced' : 'animated';

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener('resize', resize);
    }

    resize();
    if (!reducedMotion) {
      frameId = window.requestAnimationFrame(animate);
    }

    return () => {
      resizeObserver?.disconnect();
      if (!resizeObserver) {
        window.removeEventListener('resize', resize);
      }
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: This decorative canvas has no interaction.
  return <canvas ref={canvasRef} aria-hidden="true" data-testid="danmaku-canvas" />;
}
