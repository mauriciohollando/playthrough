import { easeInOutCubic, lerp, lerpColor } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';
import { buildArena, COLORS } from './combat';
import { PONG_LAYOUT, type PongSnapshot } from './pong';

const DURATION = 2.4;

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Morphs Pong visuals into Combat over a few seconds, then hands off.
 */
export class TransitionEra implements Era {
  readonly id = 'pong' as const; // transitional — engine treats specially

  private t = 0;
  private from: PongSnapshot;
  private walls: Rect[] = [];
  private done = false;

  constructor(from: PongSnapshot) {
    this.from = from;
    this.walls = buildArena();
  }

  enter(): void {
    this.t = 0;
    this.done = false;
  }

  update(dt: number, _input: InputState): EraResult {
    this.t += dt;
    if (this.t >= DURATION && !this.done) {
      this.done = true;
      return { type: 'evolve', next: 'combat' };
    }
    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const u = easeInOutCubic(Math.min(1, this.t / DURATION));
    const bg = lerpColor('#000000', COLORS.field, u);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Fade out pong walls / center line, fade in combat walls
    const wallColor = lerpColor('#ffffff', COLORS.wall, u);
    const pongWallA = 1 - u;

    if (pongWallA > 0.02) {
      ctx.globalAlpha = pongWallA;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, GAME_W, PONG_LAYOUT.WALL);
      ctx.fillRect(0, GAME_H - PONG_LAYOUT.WALL, GAME_W, PONG_LAYOUT.WALL);
      const dash = 4;
      const gap = 4;
      const cx = Math.floor(GAME_W / 2) - 1;
      for (let y = PONG_LAYOUT.WALL + 2; y < GAME_H - PONG_LAYOUT.WALL; y += dash + gap) {
        ctx.fillRect(cx, y, 2, dash);
      }
      ctx.globalAlpha = 1;
    }

    // Score bar rises in
    if (u > 0.35) {
      const a = (u - 0.35) / 0.65;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, GAME_W, lerp(0, 16, a));
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = u;
    ctx.fillStyle = wallColor;
    for (const w of this.walls) {
      // Shrink-in from center of each wall
      const s = lerp(0.15, 1, u);
      const cx = w.x + w.w / 2;
      const cy = w.y + w.h / 2;
      const ww = w.w * s;
      const hh = w.h * s;
      ctx.fillRect(cx - ww / 2, cy - hh / 2, ww, hh);
    }
    ctx.globalAlpha = 1;

    // Morph paddles → tanks
    this.drawMorphPaddle(
      ctx,
      PONG_LAYOUT.PADDLE_X_L + PONG_LAYOUT.PADDLE_W / 2,
      this.from.leftY + PONG_LAYOUT.PADDLE_H / 2,
      56,
      GAME_H / 2,
      0,
      COLORS.player,
      u,
    );
    // Right paddle splits into two enemy tanks
    this.drawMorphPaddle(
      ctx,
      PONG_LAYOUT.PADDLE_X_R + PONG_LAYOUT.PADDLE_W / 2,
      this.from.rightY + PONG_LAYOUT.PADDLE_H / 2,
      GAME_W - 64,
      GAME_H / 2 - 36,
      Math.PI,
      COLORS.enemy,
      u,
    );
    this.drawMorphPaddle(
      ctx,
      PONG_LAYOUT.PADDLE_X_R + PONG_LAYOUT.PADDLE_W / 2,
      this.from.rightY + PONG_LAYOUT.PADDLE_H / 2,
      GAME_W - 64,
      GAME_H / 2 + 36,
      Math.PI,
      COLORS.enemy,
      Math.max(0, (u - 0.2) / 0.8),
    );

    // Ball → fades / becomes dust
    const bx = lerp(this.from.ballX, GAME_W / 2, u);
    const by = lerp(this.from.ballY, GAME_H / 2, u);
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = lerpColor('#ffffff', COLORS.bullet, u);
    const bs = lerp(PONG_LAYOUT.BALL, 1, u);
    ctx.fillRect(Math.round(bx), Math.round(by), bs, bs);
    ctx.globalAlpha = 1;
  }

  private drawMorphPaddle(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    toAngle: number,
    tankColor: string,
    u: number,
  ): void {
    const x = lerp(fromX, toX, u);
    const y = lerp(fromY, toY, u);
    const angle = lerp(0, toAngle, u);
    const pw = lerp(PONG_LAYOUT.PADDLE_W, 8, u);
    const ph = lerp(PONG_LAYOUT.PADDLE_H, 8, u);
    const color = lerpColor('#ffffff', tankColor, u);

    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle);
    ctx.fillStyle = color;
    if (u < 0.55) {
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    } else {
      // Tank silhouette
      const blend = (u - 0.55) / 0.45;
      ctx.fillRect(-5, -4, 8, 8);
      ctx.globalAlpha = blend;
      ctx.fillRect(2, -1, 6, 2);
      ctx.fillRect(-5, -5, 8, 1);
      ctx.fillRect(-5, 4, 8, 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
