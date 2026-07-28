import { easeInOutCubic, lerp, lerpColor } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';
import { BRK_COLORS } from './breakout';
import { PAC_COLORS } from './pacman';

const DURATION = 2.5;
const TILE = 8;
const COLS = 28;
const OX = Math.floor((GAME_W - COLS * TILE) / 2);
const OY = 8;

export type PacManSnapshot = {
  pacX: number;
  pacY: number;
  walls: { x: number; y: number }[];
  ghosts: { x: number; y: number; color: string }[];
};

export class PacManToBreakoutTransition implements Era {
  readonly id = 'pacman' as const;

  private t = 0;
  private from: PacManSnapshot;
  private done = false;
  private brickTargets: { x: number; y: number; color: string }[] = [];

  constructor(from: PacManSnapshot) {
    this.from = from;
    const rows = BRK_COLORS.rows;
    const cols = 14;
    const bw = 20;
    const bh = 6;
    const gap = 1;
    const totalW = cols * bw + (cols - 1) * gap;
    const startX = Math.floor((GAME_W - totalW) / 2);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < cols; c++) {
        this.brickTargets.push({
          x: startX + c * (bw + gap),
          y: 36 + r * (bh + gap),
          color: rows[r],
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
      return { type: 'evolve', next: 'breakout' };
    }
    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const u = easeInOutCubic(Math.min(1, this.t / DURATION));
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Maze walls shrink / recolor into border + vanish
    ctx.globalAlpha = 1 - u;
    for (const w of this.from.walls) {
      ctx.fillStyle = PAC_COLORS.wall;
      ctx.fillRect(OX + w.x * TILE, OY + w.y * TILE, TILE, TILE);
    }
    ctx.globalAlpha = 1;

    // Breakout border fades in
    ctx.globalAlpha = u;
    ctx.fillStyle = BRK_COLORS.border;
    ctx.fillRect(0, 0, GAME_W, 8);
    ctx.fillRect(0, 0, 8, GAME_H);
    ctx.fillRect(GAME_W - 8, 0, 8, GAME_H);
    ctx.globalAlpha = 1;

    // Walls / pellets morph toward brick grid
    for (let i = 0; i < this.brickTargets.length; i++) {
      const b = this.brickTargets[i];
      const src = this.from.walls[i % Math.max(1, this.from.walls.length)] ?? {
        x: 10,
        y: 5,
      };
      const local = Math.max(0, Math.min(1, (u - i * 0.0015) / 0.75));
      const x = lerp(OX + src.x * TILE, b.x, local);
      const y = lerp(OY + src.y * TILE, b.y, local);
      const color = lerpColor(PAC_COLORS.wall, b.color, local);
      ctx.fillStyle = color;
      const w = lerp(TILE, 20, local);
      const h = lerp(TILE, 6, local);
      ctx.fillRect(x, y, w, h);
    }

    // Ghosts fade out
    ctx.globalAlpha = 1 - u;
    for (const g of this.from.ghosts) {
      ctx.fillStyle = g.color;
      ctx.beginPath();
      ctx.arc(OX + g.x * TILE + 4, OY + g.y * TILE + 4, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pac → ball, paddle appears
    const bx = lerp(OX + this.from.pacX * TILE + 4, GAME_W / 2, u);
    const by = lerp(OY + this.from.pacY * TILE + 4, GAME_H - 36, u);
    const ballColor = lerpColor(PAC_COLORS.pac, BRK_COLORS.ball, u);
    ctx.fillStyle = ballColor;
    const s = lerp(10, 4, u);
    ctx.beginPath();
    ctx.arc(bx, by, s / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = Math.max(0, (u - 0.4) / 0.6);
    ctx.fillStyle = BRK_COLORS.paddle;
    ctx.fillRect(GAME_W / 2 - 14, GAME_H - 24, 28, 4);
    ctx.globalAlpha = 1;
  }
}
