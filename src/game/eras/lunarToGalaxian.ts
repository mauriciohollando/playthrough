import { easeInOutCubic, lerp } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';
import { GAL_COLORS } from './galaxian';
import { LUNAR_COLOR } from './lunar';

const DURATION = 2.6;

export type LunarSnapshot = {
  landerX: number;
  landerY: number;
  landerAngle: number;
  terrain: { x: number; y: number }[];
  stars: { x: number; y: number }[];
};

export class LunarToGalaxianTransition implements Era {
  readonly id = 'lunar' as const;

  private t = 0;
  private from: LunarSnapshot;
  private done = false;
  private alienSlots: { x: number; y: number; kind: 'boss' | 'blue' | 'purple' | 'cyan' }[] = [];

  constructor(from: LunarSnapshot) {
    this.from = from;
    for (let row = 0; row < 6; row++) {
      const cols = row === 0 ? 2 : 8;
      const offset = row === 0 ? 3 : 0;
      for (let c = 0; c < cols; c++) {
        const kind =
          row === 0 ? 'boss' : row === 1 ? 'blue' : row <= 3 ? 'purple' : 'cyan';
        this.alienSlots.push({
          x: 70 + (c + offset) * 20,
          y: 28 + row * 14,
          kind,
        });
      }
    }
  }

  enter(): void {
    this.t = 0;
    this.done = false;
  }

  update(dt: number, _input: InputState): EraResult {
    this.t += dt;
    if (this.t >= DURATION && !this.done) {
      this.done = true;
      return { type: 'evolve', next: 'galaxian' };
    }
    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const u = easeInOutCubic(Math.min(1, this.t / DURATION));
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Stars densify
    ctx.fillStyle = LUNAR_COLOR;
    for (const s of this.from.stars) {
      ctx.fillRect(Math.round(s.x), Math.round(lerp(s.y, (s.y + u * 40) % GAME_H, u)), 1, 1);
    }
    for (let i = 0; i < 30 * u; i++) {
      ctx.fillRect((i * 47) % GAME_W, (i * 31) % GAME_H, 1, 1);
    }

    // Terrain sinks / dissolves into nothing
    ctx.globalAlpha = 1 - u;
    ctx.strokeStyle = LUNAR_COLOR;
    ctx.lineWidth = 1;
    if (this.from.terrain.length > 1) {
      ctx.beginPath();
      const drop = u * 40;
      ctx.moveTo(this.from.terrain[0].x, this.from.terrain[0].y + drop);
      for (let i = 1; i < this.from.terrain.length; i++) {
        ctx.lineTo(this.from.terrain[i].x, this.from.terrain[i].y + drop);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Terrain vertices → alien formation
    for (let i = 0; i < this.alienSlots.length; i++) {
      const slot = this.alienSlots[i];
      const src = this.from.terrain[i % this.from.terrain.length] ?? {
        x: GAME_W / 2,
        y: GAME_H - 40,
      };
      const local = Math.max(0, Math.min(1, (u - i * 0.008) / 0.7));
      const x = lerp(src.x, slot.x, local);
      const y = lerp(src.y - 20, slot.y, local);
      ctx.globalAlpha = Math.max(local, 0.15);
      this.drawAlien(ctx, x, y, slot.kind, local);
      ctx.globalAlpha = 1;
    }

    // Lander → Galaxian ship at bottom
    const sx = lerp(this.from.landerX, GAME_W / 2, u);
    const sy = lerp(this.from.landerY, GAME_H - 22, u);
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    if (u < 0.5) {
      ctx.rotate(lerp(this.from.landerAngle, 0, u * 2));
      ctx.strokeStyle = LUNAR_COLOR;
      ctx.globalAlpha = 1 - u;
      ctx.strokeRect(-4, -6, 8, 8);
      ctx.beginPath();
      ctx.moveTo(-4, 2);
      ctx.lineTo(-8, 8);
      ctx.moveTo(4, 2);
      ctx.lineTo(8, 8);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (u > 0.35) {
      const a = (u - 0.35) / 0.65;
      ctx.globalAlpha = a;
      ctx.rotate(0);
      ctx.fillStyle = GAL_COLORS.ship;
      ctx.fillRect(-1, -6, 2, 8);
      ctx.fillRect(-5, -1, 10, 3);
      ctx.fillStyle = GAL_COLORS.shipAccent;
      ctx.fillRect(-6, 1, 3, 2);
      ctx.fillRect(3, 1, 3, 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Stage flags fade in (part 2)
    if (u > 0.6) {
      ctx.globalAlpha = (u - 0.6) / 0.4;
      ctx.fillStyle = GAL_COLORS.flag;
      for (let i = 0; i < 2; i++) {
        const fx = GAME_W - 14 - i * 10;
        ctx.fillRect(fx, GAME_H - 12, 6, 4);
        ctx.fillRect(fx + 5, GAME_H - 16, 1, 10);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawAlien(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    kind: 'boss' | 'blue' | 'purple' | 'cyan',
    solid: number,
  ): void {
    const ox = Math.round(x);
    const oy = Math.round(y);
    if (solid < 0.4) {
      ctx.strokeStyle = LUNAR_COLOR;
      ctx.strokeRect(ox, oy, 10, 8);
      return;
    }
    const color =
      kind === 'boss'
        ? GAL_COLORS.boss
        : kind === 'blue'
          ? GAL_COLORS.blue
          : kind === 'purple'
            ? GAL_COLORS.purple
            : GAL_COLORS.cyan;
    ctx.fillStyle = color;
    ctx.fillRect(ox, oy, 12, 8);
  }
}
