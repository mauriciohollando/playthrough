import { easeInOutCubic, lerp, lerpColor } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';
import { COLORS, buildArena } from './combat';
import { INV_COLORS } from './invaders';

const DURATION = 2.6;

type Rect = { x: number; y: number; w: number; h: number };

export type CombatSnapshot = {
  playerX: number;
  playerY: number;
  playerAngle: number;
  enemyPositions: { x: number; y: number; angle: number }[];
};

/**
 * Morphs top-down Combat into Space Invaders side-view arcade layout.
 */
export class CombatToInvadersTransition implements Era {
  readonly id = 'combat' as const;

  private t = 0;
  private from: CombatSnapshot;
  private walls: Rect[] = [];
  private done = false;
  private invaderSlots: { x: number; y: number; row: number }[] = [];

  constructor(from: CombatSnapshot) {
    this.from = from;
    this.walls = buildArena();
    // Precompute invader grid targets
    const cols = 8;
    const rows = 5;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.invaderSlots.push({
          x: 36 + col * 18,
          y: 28 + row * 14,
          row,
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
      return {
        type: 'evolve',
        next: 'invaders',
        payload: { playerX: lerp(this.from.playerX, GAME_W / 2, 1) },
      };
    }
    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const u = easeInOutCubic(Math.min(1, this.t / DURATION));
    const bg = lerpColor(COLORS.field, INV_COLORS.bg, u);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Score bar fades out
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, 16);
    ctx.globalAlpha = 1;

    // Walls shrink / fade
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = COLORS.wall;
    const s = lerp(1, 0.2, u);
    for (const w of this.walls) {
      const cx = w.x + w.w / 2;
      const cy = w.y + w.h / 2;
      ctx.fillRect(cx - (w.w * s) / 2, cy - (w.h * s) / 2, w.w * s, w.h * s);
    }
    ctx.globalAlpha = 1;

    // Bunkers fade in
    if (u > 0.4) {
      const a = (u - 0.4) / 0.6;
      ctx.globalAlpha = a;
      const bases = [48, 112, 176, 240];
      for (const bx of bases) {
        ctx.fillStyle = INV_COLORS.bunker;
        ctx.fillRect(bx, GAME_H - 52, 32, 12);
        ctx.fillRect(bx + 4, GAME_H - 56, 24, 6);
        ctx.fillStyle = bg;
        ctx.fillRect(bx + 10, GAME_H - 44, 12, 8);
      }
      ctx.globalAlpha = 1;
    }

    // Ground line
    if (u > 0.5) {
      ctx.globalAlpha = (u - 0.5) / 0.5;
      ctx.fillStyle = INV_COLORS.line;
      ctx.fillRect(0, GAME_H - 18, GAME_W, 2);
      ctx.globalAlpha = 1;
    }

    // Enemy tanks → invader swarm
    const enemies = this.from.enemyPositions;
    for (let i = 0; i < this.invaderSlots.length; i++) {
      const slot = this.invaderSlots[i];
      const src = enemies[i % Math.max(1, enemies.length)] ?? {
        x: GAME_W - 64,
        y: GAME_H / 2,
        angle: Math.PI,
      };
      // Stagger appearance
      const localU = clamp01((u - i * 0.008) / 0.75);
      const x = lerp(src.x, slot.x + 6, localU);
      const y = lerp(src.y, slot.y + 4, localU);
      const color = lerpColor(COLORS.enemy, INV_COLORS.row[slot.row], localU);
      ctx.fillStyle = color;
      if (localU < 0.45) {
        this.drawTank(ctx, x, y, lerp(src.angle, 0, localU), color);
      } else {
        this.drawMiniInvader(ctx, x - 6, y - 4, slot.row);
      }
    }

    // Player tank → cyan ship at bottom
    const shipX = lerp(this.from.playerX, GAME_W / 2, u);
    const shipY = lerp(this.from.playerY, GAME_H - 24, u);
    const shipColor = lerpColor(COLORS.player, INV_COLORS.ship, u);
    ctx.save();
    ctx.translate(Math.round(shipX), Math.round(shipY));
    ctx.rotate(lerp(this.from.playerAngle, -Math.PI / 2, Math.min(1, u * 1.2)));
    ctx.fillStyle = shipColor;
    if (u < 0.55) {
      ctx.fillRect(-5, -4, 8, 8);
      ctx.fillRect(2, -1, 6, 2);
    } else {
      ctx.rotate(Math.PI / 2); // straighten for ship draw in local space
      ctx.fillRect(-7, -2, 14, 6);
      ctx.fillRect(-2, -6, 4, 4);
    }
    ctx.restore();
  }

  private drawTank(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    color: string,
  ): void {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.fillRect(-5, -4, 8, 8);
    ctx.fillRect(2, -1, 6, 2);
    ctx.restore();
  }

  private drawMiniInvader(ctx: CanvasRenderingContext2D, x: number, y: number, row: number): void {
    ctx.fillStyle = INV_COLORS.row[row];
    ctx.fillRect(Math.round(x) + 2, Math.round(y), 8, 2);
    ctx.fillRect(Math.round(x), Math.round(y) + 2, 12, 4);
    ctx.fillRect(Math.round(x) + 2, Math.round(y) + 6, 2, 2);
    ctx.fillRect(Math.round(x) + 8, Math.round(y) + 6, 2, 2);
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
