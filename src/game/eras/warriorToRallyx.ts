import { easeInOutCubic, lerp, lerpColor } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';
import { RALLY_COLORS } from './rallyx';
import { WAR_COLOR } from './warrior';

const DURATION = 2.6;

export type WarriorSnapshot = {
  player: { x: number; y: number; angle: number };
  enemy: { x: number; y: number; angle: number };
};

export class WarriorToRallyXTransition implements Era {
  readonly id = 'warrior' as const;

  private t = 0;
  private from: WarriorSnapshot;
  private done = false;

  constructor(from: WarriorSnapshot) {
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
      return { type: 'evolve', next: 'rallyx' };
    }
    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const u = easeInOutCubic(Math.min(1, this.t / DURATION));
    ctx.fillStyle = lerpColor('#000000', RALLY_COLORS.road, u * 0.85);
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Grass blocks grow in
    if (u > 0.25) {
      const a = (u - 0.25) / 0.75;
      ctx.globalAlpha = a;
      ctx.fillStyle = RALLY_COLORS.grass;
      const tiles = [
        [2, 2],
        [5, 2],
        [8, 2],
        [2, 5],
        [8, 5],
        [2, 8],
        [5, 8],
        [8, 8],
        [11, 3],
        [11, 7],
      ];
      for (const [tx, ty] of tiles) {
        const s = lerp(4, 14, a);
        ctx.fillRect(tx * 16 + 8 - s / 2, ty * 16 + 8 - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }

    // Panel slides in
    ctx.fillStyle = RALLY_COLORS.panel;
    ctx.fillRect(GAME_W - 72 * u, 0, 72, GAME_H);

    // Warriors → cars
    const px = lerp(this.from.player.x, 48, u);
    const py = lerp(this.from.player.y, 120, u);
    const ex = lerp(this.from.enemy.x, 180, u);
    const ey = lerp(this.from.enemy.y, 160, u);

    if (u < 0.5) {
      ctx.strokeStyle = WAR_COLOR;
      ctx.lineWidth = 1.5;
      this.war(ctx, px, py, this.from.player.angle);
      this.war(ctx, ex, ey, this.from.enemy.angle);
    } else {
      const a = (u - 0.5) * 2;
      ctx.globalAlpha = a;
      this.car(ctx, px, py, RALLY_COLORS.player);
      this.car(ctx, ex, ey, RALLY_COLORS.enemy);
      // Flag
      ctx.fillStyle = RALLY_COLORS.flag;
      ctx.fillRect(100, 40, 2, 10);
      ctx.fillRect(102, 40, 6, 4);
      ctx.globalAlpha = 1;
    }
  }

  private war(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(0, 5);
    ctx.lineTo(-8, 0);
    ctx.lineTo(0, -5);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(22, 0);
    ctx.stroke();
    ctx.restore();
  }

  private car(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(x - 6, y - 3, 12, 6);
    ctx.fillRect(x + 4, y - 2, 3, 4);
  }
}
