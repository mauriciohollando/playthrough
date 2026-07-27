import { GAME_H, GAME_W } from './types';

export function setupCanvas(canvas: HTMLCanvasElement): {
  ctx: CanvasRenderingContext2D;
  resize: () => void;
} {
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingEnabled = false;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const scale = Math.floor(
      Math.min(
        (window.innerWidth * dpr) / GAME_W,
        (window.innerHeight * dpr) / GAME_H,
      ),
    );
    const pixelScale = Math.max(1, scale);
    canvas.width = GAME_W * pixelScale;
    canvas.height = GAME_H * pixelScale;
    canvas.style.width = `${(GAME_W * pixelScale) / dpr}px`;
    canvas.style.height = `${(GAME_H * pixelScale) / dpr}px`;
    canvas.style.margin = 'auto';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    ctx.imageSmoothingEnabled = false;
  };

  resize();
  window.addEventListener('resize', resize);
  return { ctx, resize };
}
