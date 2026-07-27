import { easeInOutCubic, lerp, lerpColor } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';
import { AST_COLOR } from './asteroids';
import { INV_COLORS } from './invaders';

const DURATION = 2.5;

type Slot = { x: number; y: number; row: number };
type Bunker = { x: number; y: number };

export type InvadersSnapshot = {
  shipX: number;
  shipY: number;
  slots: Slot[];
  bunkers: Bunker[];
};

function rockShape(seed: number, radius: number): { x: number; y: number }[] {
  const n = 8 + (seed % 3);
  const verts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const jag = 0.7 + ((seed * 9 + i * 3) % 7) / 20;
    verts.push({ x: Math.cos(a) * radius * jag, y: Math.sin(a) * radius * jag });
  }
  return verts;
}

/**
 * Morphs filled Space Invaders into vector Asteroids.
 */
export class InvadersToAsteroidsTransition implements Era {
  readonly id = 'invaders' as const;

  private t = 0;
  private from: InvadersSnapshot;
  private done = false;
  private rocks: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    row: number;
    verts: { x: number; y: number }[];
    radius: number;
  }[] = [];

  constructor(from: InvadersSnapshot) {
    this.from = from;
    const count = Math.min(10, Math.max(5, from.slots.length ? 8 : 6));
    for (let i = 0; i < count; i++) {
      const src = from.slots[i % Math.max(1, from.slots.length)] ?? {
        x: 40 + (i % 8) * 30,
        y: 40 + Math.floor(i / 8) * 20,
        row: i % 5,
      };
      const angle = (i / count) * Math.PI * 2;
      const dist = 50 + (i % 3) * 25;
      this.rocks.push({
        fromX: src.x + 6,
        fromY: src.y + 4,
        toX: GAME_W / 2 + Math.cos(angle) * dist,
        toY: GAME_H / 2 + Math.sin(angle) * dist * 0.75,
        row: src.row,
        radius: 10 + (i % 3) * 6,
        verts: rockShape(i * 11 + 2, 10 + (i % 3) * 6),
      });
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
      return {
        type: 'evolve',
        next: 'asteroids',
        payload: {
          shipX: GAME_W / 2,
          shipY: GAME_H / 2,
          shipAngle: -Math.PI / 2,
        },
      };
    }
    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const u = easeInOutCubic(Math.min(1, this.t / DURATION));
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Bunkers dissolve
    ctx.globalAlpha = Math.max(0, 1 - u * 1.4);
    ctx.fillStyle = INV_COLORS.bunker;
    for (const b of this.from.bunkers) {
      ctx.fillRect(b.x, b.y, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Ground line fades
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = INV_COLORS.line;
    ctx.fillRect(0, GAME_H - 18, GAME_W, 2);
    ctx.globalAlpha = 1;

    // Invaders → wireframe rocks
    for (let i = 0; i < this.rocks.length; i++) {
      const r = this.rocks[i];
      const local = Math.max(0, Math.min(1, (u - i * 0.03) / 0.7));
      const x = lerp(r.fromX, r.toX, local);
      const y = lerp(r.fromY, r.toY, local);
      const fillA = 1 - local;
      const strokeA = local;

      if (fillA > 0.05) {
        ctx.globalAlpha = fillA;
        ctx.fillStyle = INV_COLORS.row[r.row] ?? INV_COLORS.ship;
        ctx.fillRect(Math.round(x - 6), Math.round(y - 4), 12, 8);
        ctx.globalAlpha = 1;
      }

      if (strokeA > 0.05) {
        ctx.globalAlpha = strokeA;
        ctx.strokeStyle = AST_COLOR;
        ctx.lineWidth = 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(local * 0.8);
        const scale = lerp(0.4, 1, local);
        ctx.beginPath();
        ctx.moveTo(r.verts[0].x * scale, r.verts[0].y * scale);
        for (let v = 1; v < r.verts.length; v++) {
          ctx.lineTo(r.verts[v].x * scale, r.verts[v].y * scale);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // Ship: cyan cannon → white triangle at center
    const sx = lerp(this.from.shipX, GAME_W / 2, u);
    const sy = lerp(this.from.shipY, GAME_H / 2, u);
    const color = lerpColor(INV_COLORS.ship, AST_COLOR, u);
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    ctx.rotate(lerp(0, -Math.PI / 2, u));

    if (u < 0.5) {
      ctx.fillStyle = color;
      const s = lerp(1, 0.7, u * 2);
      ctx.fillRect(-7 * s, -2 * s, 14 * s, 6 * s);
      ctx.fillRect(-2 * s, -6 * s, 4 * s, 4 * s);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      const blend = (u - 0.5) * 2;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-7, 6);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-7, -6);
      ctx.closePath();
      ctx.globalAlpha = blend;
      ctx.stroke();
      ctx.globalAlpha = 1 - blend;
      ctx.fillStyle = color;
      ctx.fillRect(-7, -2, 14, 6);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
