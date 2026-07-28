import { easeInOutCubic, lerp, lerpColor } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';
import { BRK_COLORS } from './breakout';
import { LUNAR_COLOR } from './lunar';

const DURATION = 2.6;

export type BreakoutSnapshot = {
  paddleX: number;
  ballX: number;
  ballY: number;
  bricks: { x: number; y: number; color: string }[];
};

export class BreakoutToLunarTransition implements Era {
  readonly id = 'breakout' as const;

  private t = 0;
  private from: BreakoutSnapshot;
  private done = false;
  private terrain: { x: number; y: number }[] = [];

  constructor(from: BreakoutSnapshot) {
    this.from = from;
    // Build a simple terrain path for morph target
    let x = 0;
    let y = GAME_H - 55;
    this.terrain.push({ x: 0, y });
    while (x < GAME_W) {
      x += 12;
      y = Math.max(GAME_H - 95, Math.min(GAME_H - 30, y + (Math.random() - 0.5) * 22));
      this.terrain.push({ x: Math.min(GAME_W, x), y });
    }
    // Flat pads
    this.terrain = [
      { x: 0, y: GAME_H - 45 },
      { x: 70, y: GAME_H - 70 },
      { x: 90, y: GAME_H - 58 },
      { x: 126, y: GAME_H - 58 },
      { x: 160, y: GAME_H - 80 },
      { x: 200, y: GAME_H - 62 },
      { x: 240, y: GAME_H - 62 },
      { x: 280, y: GAME_H - 90 },
      { x: GAME_W, y: GAME_H - 40 },
    ];
  }

  enter(): void {
    this.t = 0;
    this.done = false;
  }

  update(dt: number, _input: InputState): EraResult {
    this.t += dt;
    if (this.t >= DURATION && !this.done) {
      this.done = true;
      return { type: 'evolve', next: 'lunar' };
    }
    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const u = easeInOutCubic(Math.min(1, this.t / DURATION));
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Border fades
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = BRK_COLORS.border;
    ctx.fillRect(0, 0, GAME_W, 8);
    ctx.fillRect(0, 0, 8, GAME_H);
    ctx.fillRect(GAME_W - 8, 0, 8, GAME_H);
    ctx.globalAlpha = 1;

    // Bricks fall / stretch into terrain silhouette
    for (let i = 0; i < this.from.bricks.length; i++) {
      const b = this.from.bricks[i];
      const ti = Math.min(this.terrain.length - 1, 1 + (i % (this.terrain.length - 2)));
      const target = this.terrain[ti];
      const local = Math.max(0, Math.min(1, (u - i * 0.004) / 0.7));
      const x = lerp(b.x, target.x - 10, local);
      const y = lerp(b.y, target.y - 2, local);
      const color = lerpColor(b.color, LUNAR_COLOR, local);
      ctx.globalAlpha = 1 - local * 0.3;
      if (local < 0.55) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, lerp(20, 8, local), lerp(6, 2, local));
      } else {
        ctx.strokeStyle = LUNAR_COLOR;
        ctx.globalAlpha = local;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 14, y + (i % 3) - 1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Terrain line emerges
    if (u > 0.35) {
      const a = (u - 0.35) / 0.65;
      ctx.globalAlpha = a;
      ctx.strokeStyle = LUNAR_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.terrain[0].x, this.terrain[0].y);
      for (let i = 1; i < this.terrain.length; i++) {
        ctx.lineTo(this.terrain[i].x, this.terrain[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Stars
    if (u > 0.4) {
      ctx.globalAlpha = (u - 0.4) / 0.6;
      ctx.fillStyle = LUNAR_COLOR;
      for (let i = 0; i < 25; i++) {
        ctx.fillRect((i * 37) % GAME_W, (i * 53) % (GAME_H * 0.5), 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    // Paddle + ball → lander
    const lx = lerp(this.from.paddleX + 14, GAME_W * 0.35, u);
    const ly = lerp(GAME_H - 22, 50, u);
    ctx.save();
    ctx.translate(lx, ly);
    if (u < 0.5) {
      ctx.fillStyle = lerpColor(BRK_COLORS.paddle, LUNAR_COLOR, u * 2);
      ctx.fillRect(-14, -2, 28, 4);
      ctx.fillStyle = BRK_COLORS.ball;
      ctx.fillRect(-2, -10, 4, 4);
    } else {
      const a = (u - 0.5) * 2;
      ctx.globalAlpha = a;
      ctx.strokeStyle = LUNAR_COLOR;
      ctx.strokeRect(-4, -6, 8, 8);
      ctx.beginPath();
      ctx.moveTo(-4, 2);
      ctx.lineTo(-8, 8);
      ctx.moveTo(4, 2);
      ctx.lineTo(8, 8);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Ball drifts into lander / fades
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = BRK_COLORS.ball;
    ctx.fillRect(
      lerp(this.from.ballX, lx, u),
      lerp(this.from.ballY, ly, u),
      4,
      4,
    );
    ctx.globalAlpha = 1;
  }
}
