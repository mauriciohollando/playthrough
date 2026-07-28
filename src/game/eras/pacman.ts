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
const MAZE_W = COLS * TILE;
const OX = Math.floor((GAME_W - MAZE_W) / 2);

type Dir = { x: number; y: number };

const DIRS: Dir[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Every row is exactly 28 chars: # wall . pellet o power - door space empty */
const MAZE = [
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

const MAZE_H = MAZE.length * TILE;
const OY = Math.max(0, Math.floor((GAME_H - MAZE_H) / 2));

type Ghost = {
  x: number;
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
  private readonly pacSpeed = 75;
  private readonly ghostSpeed = 55;
  private readonly ghostFrightSpeed = 38;

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

    this.moveActor(
      (p) => {
        this.pacX = p.x;
        this.pacY = p.y;
      },
      () => ({ x: this.pacX, y: this.pacY }),
      () => this.pacDir,
      (d) => {
        this.pacDir = d;
      },
      this.pacNext,
      this.pacSpeed * dt,
      false,
    );
    this.eatAt(this.pacX, this.pacY);
    this.wrapTunnel((v) => {
      this.pacX = v.x;
      this.pacY = v.y;
    }, this.pacX, this.pacY);

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
          ctx.fillStyle = PAC_COLORS.wall;
          ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
          ctx.fillStyle = '#000000';
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
        } else if (c === '-') {
          ctx.fillStyle = PAC_COLORS.door;
          ctx.fillRect(px, py + TILE / 2 - 1, TILE, 2);
        } else if (c === '.') {
          ctx.fillStyle = PAC_COLORS.pellet;
          ctx.fillRect(px + 3, py + 3, 2, 2);
        } else if (c === 'o') {
          if (Math.floor(this.mouth * 0.5) % 2 === 0) {
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
        g.frightened && this.powerTimer < 2 && Math.floor(this.powerTimer * 6) % 2 === 0
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

    for (let i = 0; i < Math.max(0, this.lives - 1); i++) {
      this.drawPac(ctx, OX + 12 + i * 14, GAME_H - 8, { x: -1, y: 0 }, 0.65);
    }
  }

  private buildGrid(): void {
    this.grid = MAZE.map((row) => row.slice(0, COLS).padEnd(COLS, '#').split(''));
    this.pelletsLeft = 0;
    for (const row of this.grid) {
      for (const c of row) {
        if (c === '.' || c === 'o') this.pelletsLeft++;
      }
    }
  }

  private resetActors(): void {
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
        exitTimer: 1.5,
        respawnTimer: 0,
      },
      {
        x: 12 * TILE + TILE / 2,
        y: 14 * TILE + TILE / 2,
        dir: { x: 0, y: -1 },
        color: PAC_COLORS.clyde,
        frightened: false,
        eaten: false,
        inHouse: true,
        exitTimer: 3,
        respawnTimer: 0,
      },
    ];
    this.powerTimer = 0;
  }

  private findSpawn(): { x: number; y: number } {
    for (const [x, y] of [
      [14, 23],
      [13, 23],
      [14, 27],
      [13, 27],
      [14, 20],
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
    if (tx < 0 || tx >= COLS) return ty === 14 ? ' ' : '#';
    return this.grid[ty][tx];
  }

  private isOpen(tx: number, ty: number, allowDoor = false): boolean {
    const c = this.tileAt(tx, ty);
    if (c === '#') return false;
    if (c === '-' && !allowDoor) return false;
    return true;
  }

  private tileCenter(tx: number, ty: number): { x: number; y: number } {
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  /**
   * Corridor movement: stay locked to lane centers, turn only when close to a junction.
   * Does NOT snap every frame (that previously froze everyone on 60Hz+).
   */
  private moveActor(
    setPos: (p: { x: number; y: number }) => void,
    getPos: () => { x: number; y: number },
    getDir: () => Dir,
    setDir: (d: Dir) => void,
    want: Dir,
    dist: number,
    allowDoor: boolean,
  ): void {
    if (dist <= 0) return;
    let { x, y } = getPos();
    let dir = getDir();

    // Align to lane (perpendicular axis) so we stay in corridors
    if (dir.x !== 0) {
      const ty = Math.floor(y / TILE);
      y = ty * TILE + TILE / 2;
    } else if (dir.y !== 0) {
      const tx = Math.floor(x / TILE);
      x = tx * TILE + TILE / 2;
    }

    // Reverse anytime
    if (want.x === -dir.x && want.y === -dir.y && (want.x !== 0 || want.y !== 0)) {
      dir = { ...want };
      setDir(dir);
    }

    // Turn at junctions when near tile center
    const cx = Math.floor(x / TILE) * TILE + TILE / 2;
    const cy = Math.floor(y / TILE) * TILE + TILE / 2;
    const near = Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2;
    if (near && (want.x !== dir.x || want.y !== dir.y)) {
      const tx = Math.floor(cx / TILE);
      const ty = Math.floor(cy / TILE);
      if (this.isOpen(tx + want.x, ty + want.y, allowDoor)) {
        x = cx;
        y = cy;
        dir = { ...want };
        setDir(dir);
      }
    }

    // Move; stop before entering a wall
    const remaining = dist;
    const nx = x + dir.x * remaining;
    const ny = y + dir.y * remaining;

    // Destination tile under leading edge
    const leadX = nx + dir.x * (TILE / 2 - 0.5);
    const leadY = ny + dir.y * (TILE / 2 - 0.5);
    const ltx = Math.floor(leadX / TILE);
    const lty = Math.floor(leadY / TILE);

    if (!this.isOpen(ltx, lty, allowDoor)) {
      // Park at current tile center facing the wall
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      const c = this.tileCenter(tx, ty);
      setPos(c);
      return;
    }

    setPos({ x: nx, y: ny });
  }

  private wrapTunnel(
    setPos: (p: { x: number; y: number }) => void,
    x: number,
    y: number,
  ): void {
    const ty = Math.floor(y / TILE);
    if (ty !== 14) return;
    if (x < -TILE / 2) setPos({ x: COLS * TILE + TILE / 2, y });
    else if (x > COLS * TILE + TILE / 2) setPos({ x: -TILE / 2, y });
  }

  private eatAt(px: number, py: number): void {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (ty < 0 || ty >= this.grid.length || tx < 0 || tx >= COLS) return;
    const c = this.grid[ty][tx];
    if (c !== '.' && c !== 'o') return;
    const center = this.tileCenter(tx, ty);
    if (Math.hypot(px - center.x, py - center.y) > 4) return;
    this.grid[ty][tx] = ' ';
    this.pelletsLeft--;
    if (c === 'o') {
      this.powerTimer = 6;
      for (const g of this.ghosts) {
        if (!g.eaten) {
          g.frightened = true;
          g.dir = { x: -g.dir.x || 1, y: -g.dir.y };
        }
      }
    }
  }

  private moveGhosts(dt: number): void {
    for (const g of this.ghosts) {
      if (g.eaten) continue;
      const speed = (g.frightened ? this.ghostFrightSpeed : this.ghostSpeed) * dt;

      if (g.inHouse) {
        g.exitTimer -= dt;
        if (g.exitTimer <= 0) {
          g.y -= speed;
          if (g.y <= 11 * TILE + TILE / 2) {
            g.y = 11 * TILE + TILE / 2;
            g.x = 14 * TILE + TILE / 2;
            g.inHouse = false;
            g.dir = Math.random() < 0.5 ? { x: -1, y: 0 } : { x: 1, y: 0 };
          }
        }
        continue;
      }

      // Pick a chase/wander direction near centers
      const cx = Math.floor(g.x / TILE) * TILE + TILE / 2;
      const cy = Math.floor(g.y / TILE) * TILE + TILE / 2;
      if (Math.abs(g.x - cx) <= 2 && Math.abs(g.y - cy) <= 2) {
        const tx = Math.floor(cx / TILE);
        const ty = Math.floor(cy / TILE);
        const options = DIRS.filter((d) => {
          if (d.x === -g.dir.x && d.y === -g.dir.y) return false;
          return this.isOpen(tx + d.x, ty + d.y, false);
        });
        const choices =
          options.length > 0
            ? options
            : DIRS.filter((d) => this.isOpen(tx + d.x, ty + d.y, false));
        if (choices.length > 0) {
          if (g.frightened || Math.random() < 0.3) {
            g.dir = choices[Math.floor(Math.random() * choices.length)];
          } else {
            let best = choices[0];
            let bestD = Infinity;
            const ptx = Math.floor(this.pacX / TILE);
            const pty = Math.floor(this.pacY / TILE);
            for (const d of choices) {
              const dist =
                Math.abs(tx + d.x - ptx) + Math.abs(ty + d.y - pty) + Math.random();
              if (dist < bestD) {
                bestD = dist;
                best = d;
              }
            }
            g.dir = best;
          }
          g.x = cx;
          g.y = cy;
        }
      }

      this.moveActor(
        (p) => {
          g.x = p.x;
          g.y = p.y;
        },
        () => ({ x: g.x, y: g.y }),
        () => g.dir,
        (d) => {
          g.dir = d;
        },
        g.dir,
        speed,
        false,
      );
      this.wrapTunnel(
        (p) => {
          g.x = p.x;
          g.y = p.y;
        },
        g.x,
        g.y,
      );
    }
  }

  private checkCollisions(): void {
    if (this.invuln > 0) return;
    for (const g of this.ghosts) {
      if (g.eaten || g.inHouse) continue;
      if (Math.hypot(g.x - this.pacX, g.y - this.pacY) < TILE * 0.8) {
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
