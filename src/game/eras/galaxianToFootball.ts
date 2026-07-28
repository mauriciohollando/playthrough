import { easeInOutCubic, lerp, lerpColor } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';
import { GAL_COLORS, type GalaxianSnapshot } from './galaxian';
import { FB_COLORS } from './football';

const DURATION = 2.6;

export type { GalaxianSnapshot };

export class GalaxianToFootballTransition implements Era {
  readonly id = 'galaxian' as const;

  private t = 0;
  private from: GalaxianSnapshot;
  private done = false;

  constructor(from: GalaxianSnapshot) {
    this.from = from;
  }

  enter(): void {
    this.t = 0;
    this.done = false;
  }

  update(dt: number, _input: InputState): EraResult {
    this.t += dt;
    if (this.t >= DURATION && !this.done) {
      this.done = true;
      return { type: 'evolve', next: 'football' };
    }
    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const u = easeInOutCubic(Math.min(1, this.t / DURATION));
    const bg = lerpColor('#000000', FB_COLORS.sidebar, Math.min(1, u * 0.5));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Stars fade
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = '#ffffff';
    for (const s of this.from.stars) {
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
    ctx.globalAlpha = 1;

    // Field grows in
    const fieldA = Math.max(0, (u - 0.15) / 0.85);
    const fx = 48;
    const fy = 8;
    const fw = GAME_W - 96;
    const fh = GAME_H - 16;
    ctx.globalAlpha = fieldA;
    ctx.fillStyle = FB_COLORS.field;
    const grow = lerp(0.2, 1, fieldA);
    ctx.fillRect(
      GAME_W / 2 - (fw * grow) / 2,
      GAME_H / 2 - (fh * grow) / 2,
      fw * grow,
      fh * grow,
    );
    if (fieldA > 0.4) {
      ctx.strokeStyle = FB_COLORS.line;
      ctx.strokeRect(fx, fy, fw, fh);
      for (let i = 1; i <= 5; i++) {
        const x = fx + (fw * i) / 6;
        ctx.fillStyle = FB_COLORS.line;
        ctx.fillRect(Math.round(x), fy, 1, fh);
      }
    }
    ctx.globalAlpha = 1;

    // Aliens → X and diamonds
    for (let i = 0; i < this.from.aliens.length; i++) {
      const a = this.from.aliens[i];
      const local = Math.max(0, Math.min(1, (u - i * 0.01) / 0.7));
      const offense = i % 2 === 0;
      const tx = offense
        ? fx + 40 + (i % 4) * 10
        : fx + fw - 50 + (i % 4) * 10;
      const ty = fy + 40 + Math.floor(i / 4) * 16;
      const x = lerp(a.x, tx, local);
      const y = lerp(a.y, ty, local);

      if (local < 0.45) {
        ctx.fillStyle =
          a.kind === 'boss'
            ? GAL_COLORS.boss
            : a.kind === 'cyan'
              ? GAL_COLORS.cyan
              : GAL_COLORS.purple;
        ctx.fillRect(Math.round(x), Math.round(y), 10, 8);
      } else if (offense) {
        ctx.fillStyle = FB_COLORS.line;
        ctx.beginPath();
        ctx.moveTo(x + 5, y);
        ctx.lineTo(x + 8, y + 5);
        ctx.lineTo(x + 5, y + 10);
        ctx.lineTo(x + 2, y + 5);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.strokeStyle = FB_COLORS.line;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 2);
        ctx.lineTo(x + 8, y + 8);
        ctx.moveTo(x + 8, y + 2);
        ctx.lineTo(x + 2, y + 8);
        ctx.stroke();
      }
    }

    // Ship → ball carrier diamond
    const sx = lerp(this.from.shipX, fx + 55, u);
    const sy = lerp(GAME_H - 22, GAME_H / 2, u);
    if (u < 0.5) {
      ctx.fillStyle = GAL_COLORS.ship;
      ctx.fillRect(Math.round(sx - 1), Math.round(sy - 6), 2, 8);
      ctx.fillRect(Math.round(sx - 5), Math.round(sy - 1), 10, 3);
    } else {
      ctx.fillStyle = FB_COLORS.line;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 4);
      ctx.lineTo(sx + 3, sy);
      ctx.lineTo(sx, sy + 4);
      ctx.lineTo(sx - 3, sy);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2);
    }
  }
}
