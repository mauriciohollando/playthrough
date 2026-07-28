import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

export const PAC_COLORS = {
  wall: '#2121de',
  pellet: '#ffb8ae',
  power: '#ffb8ae',
  pac: '#ffff00',
  blinky: '#ff0000',
  pinky: '#ffb8ff',
  clyde: '#ffb852',
  frightened: '#2121ff',
  door: '#ffb8ff',
};

const TILE = 8;
const COLS = 28;
const ROWS = 31;
const MAZE_W = COLS * TILE;
const MAZE_H = ROWS * TILE;
const OX = Math.floor((GAME_W - MAZE_W) / 2);
const OY = Math.floor((GAME_H - MAZE_H) / 2);

type Dir = { x: number; y: number };

const DIRS: Dir[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * Compact Pac-Man-style maze. Every row is exactly 28 chars.
 * # wall  . pellet  o power  - door  space empty/tunnel
 */
const MAZE_ROWS = [
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
  '#.####.#####.##.#####.####.#',
  '#o..##.......##.......##..o#',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];

// Use 29 rows that fit; trim if needed
const MAZE = MAZE_ROWS;

type Ghost = {
  x: number; // pixel center
  y: number;
  dir: Dir;
  color: string;
  frightened: boolean;
  eaten: boolean;
  inHouse: boolean;
  exitTimer: number;
  respawnTimer: number;
};

export class PacManEra implements Era {
  readonly id = 'pacman' as const;

  private grid: string[][] = [];
  private pacX = 0;
  private pacY = 0;
  private pacDir: Dir = { x: -1, y: 0 };
  private pacNext: Dir = { x: -1, y: 0 };
  private ghosts: Ghost[] = [];
  private mouth = 0;
  private lives = 3;
  private pelletsLeft = 0;
  private powerTimer = 0;
  private invuln = 0;
  private respawnTimer = 0;
  private levelIndex = 0;
  private readonly pacSpeed = 70;
  private readonly ghostSpeed = 52;
  private readonly ghostFrightSpeed = 35;

  enter(): void {
    this.buildGrid();
    this.resetActors();
    this.lives = 3;
    this.powerTimer = 0;
    this.invuln = 1.2;
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
      pacX: Math.floor(this.pacX / TILE),
      pacY: Math.floor(this.pacY / TILE),
      walls,
      ghosts: this.ghosts
        .filter((g) => !g.eaten)
        .map((g) => ({
          x: Math.floor(g.x / TILE),
          y: Math.floor(g.y / TILE),
          color: g.color,
        })),
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

    this.mouth += dt * 12;
    this.invuln = Math.max(0, this.invuln - dt);
    this.powerTimer = Math.max(0, this.powerTimer - dt);
    if (this.powerTimer <= 0) {
      for (const g of this.ghosts) g.frightened = false;
    }

    if (input.left) this.pacNext = { x: -1, y: 0 };
    if (input.right) this.pacNext = { x: 1, y: 0 };
    if (input.up) this.pacNext = { x: 0, y: -1 };
    if (input.down) this.pacNext = { x: 0, y: 1 };

    this.movePac(dt);
    this.moveGhosts(dt);
    this.checkCollisions();

    for (const g of this.ghosts) {
      if (!g.eaten) continue;
      g.respawnTimer -= dt;
      if (g.respawnTimer <= 0) {
        g.eaten = false;
        g.frightened = false;
        g.inHouse = true;
        g.exitTimer = 1.5;
        g.x = 14 * TILE + TILE / 2;
        g.y = 14 * TILE + TILE / 2;
        g.dir = { x: 0, y: -1 };
      }
    }

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
          this.drawWallTile(ctx, px, py, x, y);
        } else if (c === '-') {
          ctx.fillStyle = PAC_COLORS.door;
          ctx.fillRect(px, py + TILE / 2 - 1, TILE, 2);
        } else if (c === '.') {
          ctx.fillStyle = PAC_COLORS.pellet;
          ctx.fillRect(px + 3, py + 3, 2, 2);
        } else if (c === 'o') {
          const blink = Math.floor(this.mouth * 0.5) % 2 === 0;
          if (blink) {
            ctx.fillStyle = PAC_COLORS.power;
            ctx.beginPath();
            ctx.arc(px + TILE / 2, py + TILE / 2, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    for (const g of this.ghosts) {
      if (g.eaten) continue;
      const color =
        g.frightened && Math.floor(this.powerTimer * 6) % 2 === 0 && this.powerTimer < 2
          ? '#ffffff'
          : g.frightened
            ? PAC_COLORS.frightened
            : g.color;
      this.drawGhost(ctx, OX + g.x, OY + g.y, color);
    }

    if (this.lives > 0 && this.respawnTimer <= 0) {
      if (this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0) {
        this.drawPac(ctx, OX + this.pacX, OY + this.pacY, this.pacDir);
      }
    }

    const reserve = Math.max(0, this.lives - 1);
    for (let i = 0; i < reserve; i++) {
      this.drawPac(ctx, OX + 12 + i * 14, GAME_H - 8, { x: -1, y: 0 }, 0.65);
    }
  }

  private buildGrid(): void {
    this.grid = MAZE.map((row) => {
      // Pad / trim to COLS
      const r = (row + '############################').slice(0, COLS);
      return r.split('');
    });
    this.pelletsLeft = 0;
    for (const row of this.grid) {
      for (const c of row) {
        if (c === '.' || c === 'o') this.pelletsLeft++;
      }
    }
  }

  private resetActors(): void {
    // Bottom corridor center — verified walkable on row 27 (0-index 27 in 29-row maze)
    // Find a safe spawn on the open bottom path
    const spawn = this.findSpawn();
    this.pacX = spawn.x * TILE + TILE / 2;
    this.pacY = spawn.y * TILE + TILE / 2;
    this.pacDir = { x: -1, y: 0 };
    this.pacNext = { x: -1, y: 0 };

    this.ghosts = [
      {
        x: 13 * TILE + TILE / 2,
        y: 11 * TILE + TILE / 2,
        dir: { x: -1, y: 0 },
        color: PAC_COLORS.blinky,
        frightened: false,
        eaten: false,
        inHouse: false,
        exitTimer: 0,
        respawnTimer: 0,
      },
      {
        x: 14 * TILE + TILE / 2,
        y: 14 * TILE + TILE / 2,
        dir: { x: 0, y: -1 },
        color: PAC_COLORS.pinky,
        frightened: false,
        eaten: false,
        inHouse: true,
        exitTimer: 2,
        respawnTimer: 0,
      },
      {
        x: 13 * TILE + TILE / 2,
        y: 14 * TILE + TILE / 2,
        dir: { x: 0, y: -1 },
        color: PAC_COLORS.clyde,
        frightened: false,
        eaten: false,
        inHouse: true,
        exitTimer: 4,
        respawnTimer: 0,
      },
    ];
    this.powerTimer = 0;
  }

  private findSpawn(): { x: number; y: number } {
    // Prefer classic bottom-center open cell
    for (const [x, y] of [
      [14, 23],
      [13, 23],
      [14, 26],
      [13, 26],
      [14, 27],
      [13, 20],
    ]) {
      if (this.isOpen(x, y)) return { x, y };
    }
    for (let y = this.grid.length - 2; y > 0; y--) {
      for (let x = 1; x < COLS - 1; x++) {
        if (this.isOpen(x, y)) return { x, y };
      }
    }
    return { x: 14, y: 5 };
  }

  private tileAt(tx: number, ty: number): string {
    if (ty < 0 || ty >= this.grid.length) return '#';
    // Horizontal tunnel row (ghost house row 14)
    if (tx < 0 || tx >= COLS) {
      if (ty === 14) return ' ';
      return '#';
    }
    return this.grid[ty][tx];
  }

  private isOpen(tx: number, ty: number, allowDoor = false): boolean {
    const c = this.tileAt(tx, ty);
    if (c === '#') return false;
    if (c === '-' && !allowDoor) return false;
    return true;
  }

  private nearCenter(px: number, py: number): boolean {
    const cx = Math.floor(px / TILE) * TILE + TILE / 2;
    const cy = Math.floor(py / TILE) * TILE + TILE / 2;
    return Math.abs(px - cx) < 1.2 && Math.abs(py - cy) < 1.2;
  }

  private snapToCenter(px: number, py: number): { x: number; y: number } {
    return {
      x: Math.floor(px / TILE) * TILE + TILE / 2,
      y: Math.floor(py / TILE) * TILE + TILE / 2,
    };
  }

  private movePac(dt: number): void {
    // Turn when aligned
    if (this.nearCenter(this.pacX, this.pacY)) {
      const snapped = this.snapToCenter(this.pacX, this.pacY);
      this.pacX = snapped.x;
      this.pacY = snapped.y;
      const tx = Math.floor(this.pacX / TILE);
      const ty = Math.floor(this.pacY / TILE);
      if (this.isOpen(tx + this.pacNext.x, ty + this.pacNext.y)) {
        this.pacDir = { ...this.pacNext };
      }
      if (!this.isOpen(tx + this.pacDir.x, ty + this.pacDir.y)) {
        return; // blocked
      }
    }

    this.pacX += this.pacDir.x * this.pacSpeed * dt;
    this.pacY += this.pacDir.y * this.pacSpeed * dt;

    // Tunnel wrap
    const ty = Math.floor(this.pacY / TILE);
    if (ty === 14) {
      if (this.pacX < -TILE / 2) this.pacX = COLS * TILE + TILE / 2;
      if (this.pacX > COLS * TILE + TILE / 2) this.pacX = -TILE / 2;
    }

    // Don't overshoot into walls
    if (this.nearCenter(this.pacX, this.pacY)) {
      const snapped = this.snapToCenter(this.pacX, this.pacY);
      const tx = Math.floor(snapped.x / TILE);
      const ty2 = Math.floor(snapped.y / TILE);
      if (!this.isOpen(tx + this.pacDir.x, ty2 + this.pacDir.y)) {
        this.pacX = snapped.x;
        this.pacY = snapped.y;
      }
    }

    this.eatAt(this.pacX, this.pacY);
  }

  private eatAt(px: number, py: number): void {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (ty < 0 || ty >= this.grid.length || tx < 0 || tx >= COLS) return;
    const c = this.grid[ty][tx];
    if (c === '.' || c === 'o') {
      // Only eat when close to center of tile
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      if (Math.hypot(px - cx, py - cy) > 3) return;
      this.grid[ty][tx] = ' ';
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

  private moveGhosts(dt: number): void {
    for (const g of this.ghosts) {
      if (g.eaten) continue;

      const speed = g.frightened ? this.ghostFrightSpeed : this.ghostSpeed;

      if (g.inHouse) {
        g.exitTimer -= dt;
        // Bob toward door then leave
        if (g.exitTimer <= 0) {
          g.y -= speed * dt;
          if (g.y <= 11 * TILE + TILE / 2) {
            g.y = 11 * TILE + TILE / 2;
            g.inHouse = false;
            g.dir = Math.random() < 0.5 ? { x: -1, y: 0 } : { x: 1, y: 0 };
          }
        } else {
          g.y += Math.sin(g.exitTimer * 8) * 10 * dt;
        }
        continue;
      }

      if (this.nearCenter(g.x, g.y)) {
        const snapped = this.snapToCenter(g.x, g.y);
        g.x = snapped.x;
        g.y = snapped.y;
        const tx = Math.floor(g.x / TILE);
        const ty = Math.floor(g.y / TILE);

        const options = DIRS.filter((d) => {
          if (d.x === -g.dir.x && d.y === -g.dir.y) return false;
          return this.isOpen(tx + d.x, ty + d.y, false);
        });
        let choices = options;
        if (choices.length === 0) {
          choices = DIRS.filter((d) => this.isOpen(tx + d.x, ty + d.y, false));
        }
        if (choices.length === 0) continue;

        if (g.frightened || Math.random() < 0.35) {
          g.dir = choices[Math.floor(Math.random() * choices.length)];
        } else {
          let best = choices[0];
          let bestD = Infinity;
          for (const d of choices) {
            const dist =
              Math.abs(tx + d.x - Math.floor(this.pacX / TILE)) +
              Math.abs(ty + d.y - Math.floor(this.pacY / TILE)) +
              (Math.random() - 0.5) * 2;
            if (dist < bestD) {
              bestD = dist;
              best = d;
            }
          }
          g.dir = best;
        }
      }

      g.x += g.dir.x * speed * dt;
      g.y += g.dir.y * speed * dt;

      const ty = Math.floor(g.y / TILE);
      if (ty === 14) {
        if (g.x < -TILE / 2) g.x = COLS * TILE + TILE / 2;
        if (g.x > COLS * TILE + TILE / 2) g.x = -TILE / 2;
      }
    }
  }

  private checkCollisions(): void {
    if (this.invuln > 0) return;
    for (const g of this.ghosts) {
      if (g.eaten || g.inHouse) continue;
      if (Math.hypot(g.x - this.pacX, g.y - this.pacY) < TILE * 0.75) {
        if (g.frightened) {
          g.eaten = true;
          g.frightened = false;
          g.respawnTimer = 2.5;
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
          return;
        }
      }
    }
  }

  private drawWallTile(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    x: number,
    y: number,
  ): void {
    // Outline-style walls: only draw edges facing open tiles for cleaner look
    ctx.fillStyle = PAC_COLORS.wall;
    const open = (dx: number, dy: number) => {
      const c = this.tileAt(x + dx, y + dy);
      return c !== '#';
    };
    const inset = 1;
    ctx.fillRect(px + inset, py + inset, TILE - inset * 2, TILE - inset * 2);
    ctx.fillStyle = '#000000';
    ctx.fillRect(px + inset + 1, py + inset + 1, TILE - inset * 2 - 2, TILE - inset * 2 - 2);

    // Soften corners visually
    void open;
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
    const heading = Math.atan2(dir.y, dir.x);
    ctx.fillStyle = PAC_COLORS.pac;
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Clockwise from mouth edge to mouth edge = body wedge
    ctx.arc(x, y, r, heading + open, heading - open, false);
    ctx.closePath();
    ctx.fill();
  }

  private drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    const r = 5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - 1, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r);
    ctx.lineTo(x + r * 0.66, y + r - 2);
    ctx.lineTo(x + r * 0.33, y + r);
    ctx.lineTo(x, y + r - 2);
    ctx.lineTo(x - r * 0.33, y + r);
    ctx.lineTo(x - r * 0.66, y + r - 2);
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
