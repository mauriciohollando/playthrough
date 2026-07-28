import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

export const PAC_COLORS = {
  wall: '#2121de',
  pellet: '#ffb897',
  power: '#ffb897',
  pac: '#ffff00',
  blinky: '#ff0000',
  pinky: '#ffb8ff',
  clyde: '#ffb852',
  frightened: '#2121ff',
  door: '#ffb8ff',
};

const TILE = 8;
const COLS = 28;
const OX = Math.floor((GAME_W - COLS * TILE) / 2);
const OY = 8;

type Dir = { x: number; y: number };

const DIRS: Dir[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

type Ghost = {
  x: number;
  y: number;
  dir: Dir;
  color: string;
  home: { x: number; y: number };
  frightened: boolean;
  eaten: boolean;
  exitTimer: number;
  respawnTimer: number;
};

export class PacManEra implements Era {
  readonly id = 'pacman' as const;

  private grid: string[][] = [];
  private pac = {
    x: 14,
    y: 23,
    dir: { x: -1, y: 0 } as Dir,
    next: { x: -1, y: 0 } as Dir,
  };
  private ghosts: Ghost[] = [];
  private mouth = 0;
  private lives = 3;
  private pelletsLeft = 0;
  private powerTimer = 0;
  private moveAcc = 0;
  private ghostAcc = 0;
  private invuln = 0;
  private respawnTimer = 0;
  private readonly pacStep = 1 / 9;
  private readonly ghostStep = 1 / 11;
  private levelIndex = 0;

  enter(): void {
    this.buildGrid();
    this.resetActors();
    this.lives = 3;
    this.powerTimer = 0;
    this.invuln = 1.5;
    this.respawnTimer = 0;
    this.levelIndex = 0;
  }

  snapshot(): {
    pacX: number;
    pacY: number;
    walls: { x: number; y: number }[];
    ghosts: { x: number; y: number; color: string }[];
  } {
    const walls: { x: number; y: number }[] = [];
    for (let y = 0; y < this.grid.length; y++) {
      for (let x = 0; x < this.grid[y].length; x++) {
        if (this.grid[y][x] === '#') walls.push({ x, y });
      }
    }
    return {
      pacX: this.pac.x,
      pacY: this.pac.y,
      walls,
      ghosts: this.ghosts
        .filter((g) => !g.eaten)
        .map((g) => ({ x: g.x, y: g.y, color: g.color })),
    };
  }

  update(dt: number, input: InputState): EraResult {
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.resetActors();
        this.invuln = 1.5;
      }
      return { type: 'continue' };
    }

    this.mouth += dt * 10;
    this.invuln = Math.max(0, this.invuln - dt);
    this.powerTimer = Math.max(0, this.powerTimer - dt);
    if (this.powerTimer <= 0) {
      for (const g of this.ghosts) g.frightened = false;
    }

    if (input.left) this.pac.next = { x: -1, y: 0 };
    if (input.right) this.pac.next = { x: 1, y: 0 };
    if (input.up) this.pac.next = { x: 0, y: -1 };
    if (input.down) this.pac.next = { x: 0, y: 1 };

    this.moveAcc += dt;
    while (this.moveAcc >= this.pacStep) {
      this.moveAcc -= this.pacStep;
      this.stepPac();
    }

    this.ghostAcc += dt;
    const gStep = this.powerTimer > 0 ? this.ghostStep * 1.4 : this.ghostStep;
    while (this.ghostAcc >= gStep) {
      this.ghostAcc -= gStep;
      this.stepGhosts();
    }

    for (const g of this.ghosts) {
      if (g.eaten) {
        g.respawnTimer -= dt;
        if (g.respawnTimer <= 0) {
          g.x = g.home.x;
          g.y = g.home.y;
          g.eaten = false;
          g.frightened = false;
          g.exitTimer = 2;
        }
      }
    }

    this.checkCollisions();

    if (this.pelletsLeft <= 0) {
      if (this.levelIndex === 0) {
        return { type: 'evolve', next: 'breakout', payload: this.snapshot() };
      }
      this.levelIndex++;
      this.buildGrid();
      this.resetActors();
      this.invuln = 2;
    }

    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    for (let y = 0; y < this.grid.length; y++) {
      for (let x = 0; x < this.grid[y].length; x++) {
        const c = this.grid[y][x];
        const px = OX + x * TILE;
        const py = OY + y * TILE;
        if (c === '#') {
          ctx.fillStyle = PAC_COLORS.wall;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#000000';
          ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
        } else if (c === '-') {
          ctx.fillStyle = PAC_COLORS.door;
          ctx.fillRect(px, py + TILE / 2 - 1, TILE, 2);
        } else if (c === '.') {
          ctx.fillStyle = PAC_COLORS.pellet;
          ctx.fillRect(px + 3, py + 3, 2, 2);
        } else if (c === 'o') {
          ctx.fillStyle = PAC_COLORS.power;
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    for (const g of this.ghosts) {
      if (g.eaten) continue;
      this.drawGhost(
        ctx,
        OX + g.x * TILE + TILE / 2,
        OY + g.y * TILE + TILE / 2,
        g.frightened ? PAC_COLORS.frightened : g.color,
      );
    }

    if (this.lives > 0) {
      const px = OX + this.pac.x * TILE + TILE / 2;
      const py = OY + this.pac.y * TILE + TILE / 2;
      if (this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0) {
        this.drawPac(ctx, px, py, this.pac.dir);
      }
    }

    const reserve = Math.max(0, this.lives - 1);
    for (let i = 0; i < reserve; i++) {
      this.drawPac(ctx, OX + 10 + i * 14, GAME_H - 10, { x: -1, y: 0 }, 0.7);
    }
  }

  private buildGrid(): void {
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
    this.grid = maze.map((row) => row.split(''));
    this.pelletsLeft = 0;
    for (const row of this.grid) {
      for (const c of row) {
        if (c === '.' || c === 'o') this.pelletsLeft++;
      }
    }
  }

  private resetActors(): void {
    this.pac = { x: 14, y: 23, dir: { x: -1, y: 0 }, next: { x: -1, y: 0 } };
    this.ghosts = [
      {
        x: 13,
        y: 11,
        dir: { x: -1, y: 0 },
        color: PAC_COLORS.blinky,
        home: { x: 13, y: 11 },
        frightened: false,
        eaten: false,
        exitTimer: 0,
        respawnTimer: 0,
      },
      {
        x: 14,
        y: 13,
        dir: { x: 0, y: -1 },
        color: PAC_COLORS.pinky,
        home: { x: 14, y: 13 },
        frightened: false,
        eaten: false,
        exitTimer: 1.5,
        respawnTimer: 0,
      },
      {
        x: 12,
        y: 13,
        dir: { x: 0, y: -1 },
        color: PAC_COLORS.clyde,
        home: { x: 12, y: 13 },
        frightened: false,
        eaten: false,
        exitTimer: 3,
        respawnTimer: 0,
      },
    ];
    this.moveAcc = 0;
    this.ghostAcc = 0;
    this.powerTimer = 0;
  }

  private cell(x: number, y: number): string {
    if (y < 0 || y >= this.grid.length) return '#';
    if (x < 0 || x >= this.grid[y].length) {
      return y === 14 ? ' ' : '#';
    }
    return this.grid[y][x];
  }

  private canEnter(x: number, y: number, allowDoor = false): boolean {
    if (y === 14 && (x < 0 || x >= COLS)) return true;
    const c = this.cell(x, y);
    if (c === '#') return false;
    if (c === '-' && !allowDoor) return false;
    return true;
  }

  private wrapPos(x: number, y: number): { x: number; y: number } {
    if (y === 14) {
      if (x < 0) return { x: COLS - 1, y };
      if (x >= COLS) return { x: 0, y };
    }
    return { x, y };
  }

  private stepPac(): void {
    const nx = this.pac.x + this.pac.next.x;
    const ny = this.pac.y + this.pac.next.y;
    if (this.canEnter(nx, ny)) this.pac.dir = { ...this.pac.next };

    const tx = this.pac.x + this.pac.dir.x;
    const ty = this.pac.y + this.pac.dir.y;
    if (this.canEnter(tx, ty)) {
      const w = this.wrapPos(tx, ty);
      this.pac.x = w.x;
      this.pac.y = w.y;
      this.eat();
    }
  }

  private eat(): void {
    const row = this.grid[this.pac.y];
    if (!row) return;
    const c = row[this.pac.x];
    if (c === '.' || c === 'o') {
      row[this.pac.x] = ' ';
      this.pelletsLeft--;
      if (c === 'o') {
        this.powerTimer = 6;
        for (const g of this.ghosts) {
          if (!g.eaten) {
            g.frightened = true;
            g.dir = { x: -g.dir.x, y: -g.dir.y };
          }
        }
      }
    }
  }

  private stepGhosts(): void {
    for (const g of this.ghosts) {
      if (g.eaten) continue;

      if (g.exitTimer > 0) {
        g.exitTimer -= this.ghostStep;
        if (g.y > 11) g.dir = { x: 0, y: -1 };
      }

      const options = DIRS.filter((d) => {
        if (d.x === -g.dir.x && d.y === -g.dir.y) return false;
        return this.canEnter(g.x + d.x, g.y + d.y, g.exitTimer > 0 || (g.x >= 11 && g.x <= 16 && g.y >= 11 && g.y <= 15));
      });

      let choices = options;
      if (choices.length === 0) {
        choices = DIRS.filter((d) => this.canEnter(g.x + d.x, g.y + d.y, true));
      }

      if (choices.length > 0) {
        let best = choices[0];
        if (g.frightened || Math.random() < 0.4) {
          best = choices[Math.floor(Math.random() * choices.length)];
        } else {
          let bestDist = Infinity;
          for (const d of choices) {
            const dist =
              Math.abs(g.x + d.x - this.pac.x) +
              Math.abs(g.y + d.y - this.pac.y) +
              (Math.random() - 0.5) * 3;
            if (dist < bestDist) {
              bestDist = dist;
              best = d;
            }
          }
        }
        g.dir = best;
      }

      const nx = g.x + g.dir.x;
      const ny = g.y + g.dir.y;
      if (this.canEnter(nx, ny, true)) {
        const w = this.wrapPos(nx, ny);
        g.x = w.x;
        g.y = w.y;
      }
    }
  }

  private checkCollisions(): void {
    if (this.invuln > 0) return;
    for (const g of this.ghosts) {
      if (g.eaten) continue;
      if (g.x === this.pac.x && g.y === this.pac.y) {
        if (g.frightened) {
          g.eaten = true;
          g.frightened = false;
          g.respawnTimer = 2;
        } else {
          this.lives--;
          if (this.lives <= 0) {
            this.lives = 3;
            this.buildGrid();
            this.resetActors();
            this.invuln = 2;
          } else {
            this.respawnTimer = 1.2;
          }
        }
      }
    }
  }

  private drawPac(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dir: Dir,
    scale = 1,
  ): void {
    const r = 5 * scale;
    const open = 0.25 + Math.abs(Math.sin(this.mouth)) * 0.35;
    let start = open;
    let end = Math.PI * 2 - open;
    if (dir.x === -1) {
      start = Math.PI + open;
      end = Math.PI - open;
    } else if (dir.y === -1) {
      start = -Math.PI / 2 + open;
      end = (Math.PI * 3) / 2 - open;
    } else if (dir.y === 1) {
      start = Math.PI / 2 + open;
      end = Math.PI / 2 - open;
    }
    ctx.fillStyle = PAC_COLORS.pac;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, start, end, false);
    ctx.closePath();
    ctx.fill();
  }

  private drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
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
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 3, y - 3, 2, 3);
    ctx.fillRect(x + 1, y - 3, 2, 3);
    ctx.fillStyle = '#2121de';
    ctx.fillRect(x - 2, y - 2, 1, 2);
    ctx.fillRect(x + 2, y - 2, 1, 2);
  }
}
