import { easeInOutCubic, lerp, lerpColor } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';
import { FB_COLORS } from './football';
import { WAR_COLOR } from './warrior';

const DURATION = 2.5;

export type FootballSnapshot = {
  players: { x: number; y: number; offense: boolean }[];
  ballX: number;
  ballY: number;
};

export class FootballToWarriorTransition implements Era {
  readonly id = 'football' as const;

  private t = 0;
  private from: FootballSnapshot;
  private done = false;

  constructor(from: FootballSnapshot) {
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
      return { type: 'evolve', next: 'warrior' };
    }
    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const u = easeInOutCubic(Math.min(1, this.t / DURATION));
    const bg = lerpColor(FB_COLORS.sidebar, '#000000', u);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Field fades
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = FB_COLORS.field;
    ctx.fillRect(48, 8, GAME_W - 96, GAME_H - 16);
    ctx.globalAlpha = 1;

    // Players → two warriors
    const offense = this.from.players.filter((p) => p.offense);
    const defense = this.from.players.filter((p) => !p.offense);
    const p0 = offense[0] ?? { x: GAME_W / 2, y: GAME_H * 0.7 };
    const p1 = defense[0] ?? { x: GAME_W / 2, y: GAME_H * 0.3 };

    const a0x = lerp(p0.x, GAME_W / 2, u);
    const a0y = lerp(p0.y, GAME_H * 0.68, u);
    const a1x = lerp(p1.x, GAME_W / 2, u);
    const a1y = lerp(p1.y, GAME_H * 0.32, u);

    for (const p of this.from.players) {
      ctx.globalAlpha = 1 - u;
      ctx.fillStyle = FB_COLORS.line;
      if (p.offense) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 4);
        ctx.lineTo(p.x + 3, p.y);
        ctx.lineTo(p.x, p.y + 4);
        ctx.lineTo(p.x - 3, p.y);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(p.x - 3, p.y - 3);
        ctx.lineTo(p.x + 3, p.y + 3);
        ctx.moveTo(p.x + 3, p.y - 3);
        ctx.lineTo(p.x - 3, p.y + 3);
        ctx.strokeStyle = FB_COLORS.line;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = lerpColor(FB_COLORS.line, WAR_COLOR, u);
    ctx.lineWidth = 1.5;
    this.strokeWarrior(ctx, a0x, a0y, -Math.PI / 2, u);
    this.strokeWarrior(ctx, a1x, a1y, Math.PI / 2, u);

    // Score boxes fade in
    if (u > 0.5) {
      ctx.globalAlpha = (u - 0.5) * 2;
      ctx.strokeStyle = WAR_COLOR;
      ctx.strokeRect(GAME_W / 2 - 28, 8, 22, 14);
      ctx.strokeRect(GAME_W / 2 + 4, 8, 22, 14);
      ctx.globalAlpha = 1;
    }
  }

  private strokeWarrior(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    u: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = Math.max(0.2, u);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(0, 5);
    ctx.lineTo(-8, 0);
    ctx.lineTo(0, -5);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(6 + 16 * u, 0);
    ctx.stroke();
    ctx.restore();
  }
}
