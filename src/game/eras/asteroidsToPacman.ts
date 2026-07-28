import { easeInOutCubic, lerp, lerpColor } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';
import { AST_COLOR } from './asteroids';
import { PAC_COLORS } from './pacman';

const DURATION = 2.6;
const TILE = 8;
const COLS = 28;
const OX = Math.floor((GAME_W - COLS * TILE) / 2);
const OY = 8;

export type AsteroidsSnapshot = {
  shipX: number;
  shipY: number;
  shipAngle: number;
  rocks: { x: number; y: number; radius: number; angle: number }[];
};

/**
 * Morphs vector Asteroids into Pac-Man maze.
 */
export class AsteroidsToPacManTransition implements Era {
  readonly id = 'asteroids' as const;

  private t = 0;
  private from: AsteroidsSnapshot;
  private done = false;
  private wallCells: { x: number; y: number }[] = [];
  private pellets: { x: number; y: number }[] = [];

  constructor(from: AsteroidsSnapshot) {
    this.from = from;
    // Sample maze outline for fade-in
    const maze = [
      '############################',
      '#............##............#',
      '#.####.#####.##.#####.####.#',
      '#o####.#####.##.#####.####o#',
      '#.####.#####.##.#####.####.#',
      '#..........................#',
      '#.####.##.########.##.####.#',
      '#.####.##.########.##.####.#',
      '#......##....##....##......#',
      '######.##### ## #####.######',
      '     #.##### ## #####.#     ',
      '     #.##          ##.#     ',
      '     #.## ###--### ##.#     ',
      '######.## #      # ##.######',
      '      .   #      #   .      ',
      '######.## #      # ##.######',
      '     #.## ######## ##.#     ',
      '     #.##          ##.#     ',
      '     #.## ######## ##.#     ',
      '######.## ######## ##.######',
      '#............##............#',
      '#.####.#####.##.#####.####.#',
      '#o..##.......##.......##..o#',
      '###.##.##.########.##.##.###',
      '#......##....##....##......#',
      '#.##########.##.##########.#',
      '#..........................#',
      '############################',
    ];
    for (let y = 0; y < maze.length; y++) {
      for (let x = 0; x < maze[y].length; x++) {
        const c = maze[y][x];
        if (c === '#') this.wallCells.push({ x, y });
        if (c === '.' || c === 'o') this.pellets.push({ x, y });
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
      return { type: 'evolve', next: 'pacman' };
    }
    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    const u = easeInOutCubic(Math.min(1, this.t / DURATION));
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Maze walls fade/grow in
    const wallA = Math.max(0, (u - 0.15) / 0.85);
    ctx.globalAlpha = wallA;
    ctx.fillStyle = PAC_COLORS.wall;
    const grow = lerp(0.2, 1, wallA);
    for (const cell of this.wallCells) {
      const cx = OX + cell.x * TILE + TILE / 2;
      const cy = OY + cell.y * TILE + TILE / 2;
      const s = TILE * grow;
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
      ctx.fillStyle = '#000000';
      ctx.fillRect(cx - s / 2 + 1, cy - s / 2 + 1, Math.max(0, s - 2), Math.max(0, s - 2));
      ctx.fillStyle = PAC_COLORS.wall;
    }
    ctx.globalAlpha = 1;

    // Pellets appear from dissolving rocks
    const pelletA = Math.max(0, (u - 0.35) / 0.65);
    ctx.globalAlpha = pelletA;
    ctx.fillStyle = PAC_COLORS.pellet;
    for (const p of this.pellets) {
      ctx.fillRect(OX + p.x * TILE + 3, OY + p.y * TILE + 3, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Rocks dissolve into pellets / vanish
    for (let i = 0; i < this.from.rocks.length; i++) {
      const r = this.from.rocks[i];
      const local = Math.min(1, u * 1.2);
      ctx.globalAlpha = 1 - local;
      ctx.strokeStyle = AST_COLOR;
      ctx.lineWidth = 1;
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.angle + local);
      const rad = r.radius * (1 - local * 0.5);
      ctx.beginPath();
      for (let v = 0; v < 8; v++) {
        const a = (v / 8) * Math.PI * 2;
        const jag = 0.75 + (v % 3) * 0.1;
        const px = Math.cos(a) * rad * jag;
        const py = Math.sin(a) * rad * jag;
        if (v === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Ghosts fade in near center
    if (u > 0.45) {
      const a = (u - 0.45) / 0.55;
      ctx.globalAlpha = a;
      const colors = [PAC_COLORS.blinky, PAC_COLORS.pinky, PAC_COLORS.clyde];
      for (let i = 0; i < 3; i++) {
        this.drawGhost(
          ctx,
          OX + (12 + i) * TILE + 4,
          OY + 13 * TILE + 4,
          colors[i],
        );
      }
      ctx.globalAlpha = 1;
    }

    // Ship → Pac-Man
    const sx = lerp(this.from.shipX, OX + 14 * TILE + 4, u);
    const sy = lerp(this.from.shipY, OY + 23 * TILE + 4, u);
    const color = lerpColor(AST_COLOR, PAC_COLORS.pac, u);
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    if (u < 0.5) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.rotate(lerp(this.from.shipAngle, 0, u * 2));
      ctx.globalAlpha = 1 - u * 1.2;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-7, 6);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-7, -6);
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (u > 0.35) {
      const a = (u - 0.35) / 0.65;
      ctx.globalAlpha = a;
      ctx.fillStyle = color;
      const open = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 5, open, Math.PI * 2 - open);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawGhost(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
  ): void {
    const r = 5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - 1, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r);
    ctx.lineTo(x + r * 0.5, y + r - 2);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.5, y + r - 2);
    ctx.lineTo(x - r, y + r);
    ctx.closePath();
    ctx.fill();
  }
}
