import { clamp } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

export const RALLY_COLORS = {
  road: '#c4a060',
  grass: '#208020',
  grassEdge: '#a05020',
  player: '#3060e0',
  enemy: '#e02020',
  flag: '#e0e020',
  smoke: '#e0c040',
  panel: '#000000',
  fuel: '#e02020',
  radar: '#2040a0',
};

const TILE = 16;
const COLS = 14;
const ROWS = 14;
const VIEW_COLS = 12;
const VIEW_ROWS = 13;
const PANEL_W = 72;
const PLAY_W = GAME_W - PANEL_W;

type Dir = { x: number; y: number };

type Car = {
  x: number; // pixel world
  y: number;
  dir: Dir;
  next: Dir;
};

/** 1 = road, 0 = grass */
function buildMaze(): number[][] {
  const g: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  // Outer ring + corridors
  for (let x = 1; x < COLS - 1; x++) {
    g[1][x] = 1;
    g[ROWS - 2][x] = 1;
  }
  for (let y = 1; y < ROWS - 1; y++) {
    g[y][1] = 1;
    g[y][COLS - 2] = 1;
    g[y][Math.floor(COLS / 2)] = 1;
  }
  for (let y = 3; y < ROWS - 3; y += 3) {
    for (let x = 1; x < COLS - 1; x++) g[y][x] = 1;
  }
  for (let x = 3; x < COLS - 3; x += 3) {
    for (let y = 1; y < ROWS - 1; y++) g[y][x] = 1;
  }
  return g;
}

export class RallyXEra implements Era {
  readonly id = 'rallyx' as const;

  private maze: number[][] = [];
  private player: Car = { x: 0, y: 0, dir: { x: 1, y: 0 }, next: { x: 1, y: 0 } };
  private enemies: Car[] = [];
  private flags: { cx: number; cy: number; taken: boolean }[] = [];
  private smoke: { x: number; y: number; life: number }[] = [];
  private fuel = 100;
  private lives = 3;
  private camX = 0;
  private camY = 0;
  private moveAcc = 0;
  private smokeCooldown = 0;
  private invuln = 0;
  private readonly speed = 1 / 7;

  enter(): void {
    this.maze = buildMaze();
    this.fuel = 100;
    this.lives = 3;
    this.smoke = [];
    this.invuln = 1;
    this.placeActors();
  }

  update(dt: number, input: InputState): EraResult {
    this.invuln = Math.max(0, this.invuln - dt);
    this.smokeCooldown = Math.max(0, this.smokeCooldown - dt);
    this.fuel = Math.max(0, this.fuel - 3.2 * dt);

    if (input.left) this.player.next = { x: -1, y: 0 };
    if (input.right) this.player.next = { x: 1, y: 0 };
    if (input.up) this.player.next = { x: 0, y: -1 };
    if (input.down) this.player.next = { x: 0, y: 1 };

    if (input.fire && this.smokeCooldown <= 0 && this.fuel > 5) {
      this.smokeCooldown = 0.15;
      this.fuel -= 1.5;
      this.smoke.push({
        x: this.player.x - this.player.dir.x * 10,
        y: this.player.y - this.player.dir.y * 10,
        life: 2.2,
      });
    }

    this.moveAcc += dt;
    while (this.moveAcc >= this.speed && this.fuel > 0) {
      this.moveAcc -= this.speed;
      this.stepCar(this.player, true);
      for (const e of this.enemies) this.stepEnemy(e);
    }

    for (const s of this.smoke) s.life -= dt;
    this.smoke = this.smoke.filter((s) => s.life > 0);

    // Collect flags
    for (const f of this.flags) {
      if (f.taken) continue;
      const fx = f.cx * TILE + TILE / 2;
      const fy = f.cy * TILE + TILE / 2;
      if (Math.hypot(this.player.x - fx, this.player.y - fy) < 10) {
        f.taken = true;
        this.fuel = Math.min(100, this.fuel + 12);
      }
    }

    // Enemy collision
    if (this.invuln <= 0) {
      for (const e of this.enemies) {
        if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < 10) {
          // Smoke blocks
          const blocked = this.smoke.some(
            (s) => Math.hypot(s.x - e.x, s.y - e.y) < 12,
          );
          if (blocked) continue;
          this.hitPlayer();
          break;
        }
      }
    }

    if (this.fuel <= 0) this.hitPlayer();

    // Camera follows player
    this.camX = clamp(this.player.x - PLAY_W / 2, 0, COLS * TILE - PLAY_W);
    this.camY = clamp(this.player.y - GAME_H / 2, 0, ROWS * TILE - GAME_H);

    // Level complete — respawn flags
    if (this.flags.every((f) => f.taken)) {
      this.placeFlags();
      this.fuel = Math.min(100, this.fuel + 25);
    }

    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    ctx.fillStyle = RALLY_COLORS.panel;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, PLAY_W, GAME_H);
    ctx.clip();

    // Ground
    ctx.fillStyle = RALLY_COLORS.road;
    ctx.fillRect(0, 0, PLAY_W, GAME_H);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.maze[y][x] === 1) continue;
        const px = x * TILE - this.camX;
        const py = y * TILE - this.camY;
        ctx.fillStyle = RALLY_COLORS.grass;
        ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
        ctx.strokeStyle = RALLY_COLORS.grassEdge;
        ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
      }
    }

    for (const f of this.flags) {
      if (f.taken) continue;
      const px = f.cx * TILE + 4 - this.camX;
      const py = f.cy * TILE + 2 - this.camY;
      ctx.fillStyle = RALLY_COLORS.flag;
      ctx.fillRect(px + 4, py, 2, 10);
      ctx.fillRect(px + 6, py, 6, 4);
    }

    for (const s of this.smoke) {
      ctx.globalAlpha = Math.min(1, s.life / 2);
      ctx.fillStyle = RALLY_COLORS.smoke;
      ctx.beginPath();
      ctx.arc(s.x - this.camX, s.y - this.camY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (const e of this.enemies) {
      this.drawCar(ctx, e.x - this.camX, e.y - this.camY, e.dir, RALLY_COLORS.enemy);
    }
    this.drawCar(
      ctx,
      this.player.x - this.camX,
      this.player.y - this.camY,
      this.player.dir,
      RALLY_COLORS.player,
    );

    ctx.restore();

    // Sidebar (no text labels)
    const px = PLAY_W;
    ctx.fillStyle = RALLY_COLORS.panel;
    ctx.fillRect(px, 0, PANEL_W, GAME_H);

    // Fuel bar
    ctx.fillStyle = RALLY_COLORS.fuel;
    ctx.fillRect(px + 10, 40, 52, 4);
    ctx.fillRect(px + 10, 40, (this.fuel / 100) * 52, 4);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(px + 10, 40, 52, 4);

    // Radar
    ctx.fillStyle = RALLY_COLORS.radar;
    ctx.fillRect(px + 8, 70, 56, 70);
    for (const f of this.flags) {
      if (f.taken) continue;
      ctx.fillStyle = RALLY_COLORS.flag;
      ctx.fillRect(px + 10 + (f.cx / COLS) * 52, 72 + (f.cy / ROWS) * 66, 2, 2);
    }
    ctx.fillStyle = RALLY_COLORS.player;
    ctx.fillRect(
      px + 10 + (this.player.x / (COLS * TILE)) * 52,
      72 + (this.player.y / (ROWS * TILE)) * 66,
      3,
      3,
    );
    ctx.fillStyle = RALLY_COLORS.enemy;
    for (const e of this.enemies) {
      ctx.fillRect(
        px + 10 + (e.x / (COLS * TILE)) * 52,
        72 + (e.y / (ROWS * TILE)) * 66,
        2,
        2,
      );
    }

    // Lives
    for (let i = 0; i < this.lives - 1; i++) {
      this.drawCar(ctx, px + 18 + i * 18, GAME_H - 24, { x: 1, y: 0 }, RALLY_COLORS.flag);
    }
  }

  private placeActors(): void {
    this.player = {
      x: 2 * TILE + TILE / 2,
      y: 2 * TILE + TILE / 2,
      dir: { x: 1, y: 0 },
      next: { x: 1, y: 0 },
    };
    this.enemies = [
      { x: 11 * TILE + 8, y: 2 * TILE + 8, dir: { x: -1, y: 0 }, next: { x: -1, y: 0 } },
      { x: 11 * TILE + 8, y: 11 * TILE + 8, dir: { x: 0, y: -1 }, next: { x: 0, y: -1 } },
      { x: 2 * TILE + 8, y: 11 * TILE + 8, dir: { x: 0, y: -1 }, next: { x: 0, y: -1 } },
    ];
    this.placeFlags();
  }

  private placeFlags(): void {
    this.flags = [];
    const spots = [
      [3, 1],
      [6, 1],
      [10, 1],
      [1, 5],
      [7, 5],
      [12, 5],
      [3, 8],
      [9, 8],
      [5, 12],
      [10, 12],
    ];
    for (const [cx, cy] of spots) {
      if (this.maze[cy]?.[cx] === 1) this.flags.push({ cx, cy, taken: false });
    }
  }

  private cellAt(x: number, y: number): number {
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    if (cy < 0 || cy >= ROWS || cx < 0 || cx >= COLS) return 0;
    return this.maze[cy][cx];
  }

  private centered(car: Car): boolean {
    const cx = Math.round((car.x - TILE / 2) / TILE) * TILE + TILE / 2;
    const cy = Math.round((car.y - TILE / 2) / TILE) * TILE + TILE / 2;
    return Math.abs(car.x - cx) < 1.5 && Math.abs(car.y - cy) < 1.5;
  }

  private snap(car: Car): void {
    car.x = Math.round((car.x - TILE / 2) / TILE) * TILE + TILE / 2;
    car.y = Math.round((car.y - TILE / 2) / TILE) * TILE + TILE / 2;
  }

  private canGo(car: Car, dir: Dir): boolean {
    const nx = car.x + dir.x * TILE;
    const ny = car.y + dir.y * TILE;
    return this.cellAt(nx, ny) === 1;
  }

  private stepCar(car: Car, isPlayer: boolean): void {
    if (this.centered(car)) {
      this.snap(car);
      if (this.canGo(car, car.next)) car.dir = { ...car.next };
      else if (!this.canGo(car, car.dir)) {
        const opts = [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ].filter((d) => this.canGo(car, d));
        if (opts.length) car.dir = opts[Math.floor(Math.random() * opts.length)];
        else return;
      }
    }
    car.x += car.dir.x * 2;
    car.y += car.dir.y * 2;
    void isPlayer;
  }

  private stepEnemy(e: Car): void {
    // Avoid smoke
    const nearSmoke = this.smoke.some((s) => Math.hypot(s.x - e.x, s.y - e.y) < 18);
    if (nearSmoke && this.centered(e)) {
      const opts = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ].filter((d) => this.canGo(e, d));
      if (opts.length) {
        e.next = opts[Math.floor(Math.random() * opts.length)];
        e.dir = { ...e.next };
      }
    } else if (this.centered(e) && Math.random() < 0.35) {
      // Chase player roughly
      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const prefer =
        Math.abs(dx) > Math.abs(dy)
          ? { x: Math.sign(dx) || 1, y: 0 }
          : { x: 0, y: Math.sign(dy) || 1 };
      if (this.canGo(e, prefer)) e.next = prefer;
      else {
        const opts = [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ].filter((d) => this.canGo(e, d));
        if (opts.length) e.next = opts[Math.floor(Math.random() * opts.length)];
      }
    }
    this.stepCar(e, false);
  }

  private hitPlayer(): void {
    this.lives--;
    this.invuln = 2;
    this.fuel = Math.max(30, this.fuel);
    if (this.lives <= 0) {
      this.lives = 3;
      this.fuel = 100;
      this.placeActors();
    } else {
      this.player.x = 2 * TILE + TILE / 2;
      this.player.y = 2 * TILE + TILE / 2;
      this.smoke = [];
    }
  }

  private drawCar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dir: Dir,
    color: string,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dir.y, dir.x));
    ctx.fillStyle = color;
    ctx.fillRect(-6, -3, 12, 6);
    ctx.fillRect(4, -2, 3, 4);
    ctx.restore();
  }
}

void VIEW_COLS;
void VIEW_ROWS;
