import { clamp, rectsOverlap } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

export const INV_COLORS = {
  bg: '#000000',
  ship: '#40e0e0',
  bunker: '#e02020',
  line: '#e02020',
  bulletP: '#ffffff',
  bulletE: '#ffffff',
  row: ['#40c040', '#40c040', '#e0c040', '#e0c040', '#e06080'] as const,
};

const SHIP_W = 14;
const SHIP_H = 8;
const SHIP_Y = GAME_H - 28;
const SHIP_SPEED = 120;
const PLAYER_BULLET_SPEED = 220;
const ENEMY_BULLET_SPEED = 70;
const COLS = 8;
const ROWS = 5;
const INV_W = 12;
const INV_H = 8;
const INV_GAP_X = 6;
const INV_GAP_Y = 6;
const STEP_X = 6;
const STEP_Y = 10;
const FIRE_COOLDOWN = 0.35;

type Invader = {
  col: number;
  row: number;
  alive: boolean;
};

type Bullet = {
  x: number;
  y: number;
  vy: number;
  player: boolean;
  alive: boolean;
};

type BunkerCell = { x: number; y: number; alive: boolean };

export type InvadersSpawnHint = {
  playerX: number;
};

export class InvadersEra implements Era {
  readonly id = 'invaders' as const;

  private shipX = GAME_W / 2;
  private invaders: Invader[] = [];
  private originX = 40;
  private originY = 28;
  private dir = 1;
  private stepTimer = 0;
  private stepInterval = 0.55;
  private frame = 0;
  private bullets: Bullet[] = [];
  private cooldown = 0;
  private bunkers: BunkerCell[] = [];
  private lives = 3;
  private respawnTimer = 0;
  private invuln = 0;
  private waveIndex = 0;

  enter(payload?: unknown): void {
    const hint = payload as InvadersSpawnHint | undefined;
    this.shipX = hint?.playerX ?? GAME_W / 2;
    this.lives = 3;
    this.bullets = [];
    this.cooldown = 0;
    this.respawnTimer = 0;
    this.invuln = 1.2;
    this.waveIndex = 0;
    this.resetWave();
    this.buildBunkers();
  }

  snapshot(): {
    shipX: number;
    shipY: number;
    slots: { x: number; y: number; row: number }[];
    bunkers: { x: number; y: number }[];
  } {
    const slots = this.invaders.map((inv) => {
      const p = this.invPos(inv);
      return { x: p.x, y: p.y, row: inv.row };
    });
    return {
      shipX: this.shipX,
      shipY: SHIP_Y + SHIP_H / 2,
      slots,
      bunkers: this.bunkers.filter((b) => b.alive).map((b) => ({ x: b.x, y: b.y })),
    };
  }

  update(dt: number, input: InputState): EraResult {
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0 && this.lives > 0) {
        this.shipX = GAME_W / 2;
        this.invuln = 1.5;
        this.bullets = this.bullets.filter((b) => b.player);
      }
      return { type: 'continue' };
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.lives > 0) {
      if (input.left) this.shipX -= SHIP_SPEED * dt;
      if (input.right) this.shipX += SHIP_SPEED * dt;
      this.shipX = clamp(this.shipX, SHIP_W / 2 + 4, GAME_W - SHIP_W / 2 - 4);

      if (input.firePressed && this.cooldown <= 0 && !this.playerBulletAlive()) {
        this.cooldown = FIRE_COOLDOWN;
        this.bullets.push({
          x: this.shipX - 1,
          y: SHIP_Y - 4,
          vy: -PLAYER_BULLET_SPEED,
          player: true,
          alive: true,
        });
      }
    }

    this.stepTimer += dt;
    if (this.stepTimer >= this.stepInterval) {
      this.stepTimer = 0;
      this.stepInvaders();
    }

    this.maybeEnemyFire();
    this.updateBullets(dt);

    if (this.aliveCount() === 0) {
      // First wave clear → evolve into Asteroids
      if (this.waveIndex === 0) {
        return { type: 'evolve', next: 'asteroids', payload: this.snapshot() };
      }
      this.waveIndex++;
      this.resetWave();
      this.stepInterval = Math.max(0.28, this.stepInterval - 0.04);
    }

    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    ctx.fillStyle = INV_COLORS.bg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Invaders
    for (const inv of this.invaders) {
      if (!inv.alive) continue;
      const { x, y } = this.invPos(inv);
      this.drawInvader(ctx, x, y, inv.row, this.frame % 2 === 0);
    }

    // Bunkers
    ctx.fillStyle = INV_COLORS.bunker;
    for (const c of this.bunkers) {
      if (c.alive) ctx.fillRect(c.x, c.y, 2, 2);
    }

    // Ground line
    ctx.fillStyle = INV_COLORS.line;
    ctx.fillRect(0, GAME_H - 18, GAME_W, 2);

    // Lives as ship icons (reserves)
    const reserve = this.respawnTimer > 0 ? this.lives : Math.max(0, this.lives - 1);
    for (let i = 0; i < reserve; i++) {
      this.drawShip(ctx, 20 + i * 18, GAME_H - 10, true);
    }

    // Player
    if (this.lives > 0 && this.respawnTimer <= 0) {
      if (this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0) {
        this.drawShip(ctx, this.shipX, SHIP_Y + SHIP_H / 2, false);
      }
    }

    // Bullets
    for (const b of this.bullets) {
      if (!b.alive) continue;
      ctx.fillStyle = b.player ? INV_COLORS.bulletP : INV_COLORS.bulletE;
      ctx.fillRect(Math.round(b.x), Math.round(b.y), 2, 4);
    }
  }

  private resetWave(): void {
    this.invaders = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        this.invaders.push({ col, row, alive: true });
      }
    }
    this.originX = 36;
    this.originY = 28;
    this.dir = 1;
    this.frame = 0;
    this.stepTimer = 0;
  }

  private buildBunkers(): void {
    this.bunkers = [];
    const bases = [48, 112, 176, 240];
    for (const bx of bases) {
      // Dome with bottom cutout — 14x10 cells of 2px
      for (let cy = 0; cy < 10; cy++) {
        for (let cx = 0; cx < 16; cx++) {
          const inDome =
            cy < 2
              ? cx >= 3 && cx <= 12
              : cy < 4
                ? cx >= 1 && cx <= 14
                : cx >= 0 && cx <= 15;
          const cutout = cy >= 7 && cx >= 5 && cx <= 10;
          if (inDome && !cutout) {
            this.bunkers.push({
              x: bx + cx * 2,
              y: GAME_H - 56 + cy * 2,
              alive: true,
            });
          }
        }
      }
    }
  }

  private invPos(inv: Invader): { x: number; y: number } {
    return {
      x: this.originX + inv.col * (INV_W + INV_GAP_X),
      y: this.originY + inv.row * (INV_H + INV_GAP_Y),
    };
  }

  private aliveCount(): number {
    return this.invaders.filter((i) => i.alive).length;
  }

  private bounds(): { minX: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const inv of this.invaders) {
      if (!inv.alive) continue;
      const p = this.invPos(inv);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + INV_W);
      maxY = Math.max(maxY, p.y + INV_H);
    }
    if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, maxY: 0 };
    return { minX, maxX, maxY };
  }

  private stepInvaders(): void {
    const { minX, maxX, maxY } = this.bounds();
    if (this.aliveCount() === 0) return;

    let drop = false;
    if (this.dir > 0 && maxX + STEP_X > GAME_W - 8) drop = true;
    if (this.dir < 0 && minX - STEP_X < 8) drop = true;

    if (drop) {
      this.dir *= -1;
      this.originY += STEP_Y;
      this.frame++;
      // Speed up slightly as they descend
      this.stepInterval = Math.max(0.22, this.stepInterval * 0.97);
      if (maxY + STEP_Y >= SHIP_Y - 4) {
        this.hitPlayer();
      }
      return;
    }

    this.originX += STEP_X * this.dir;
    this.frame++;

    // Reach player line
    if (maxY >= SHIP_Y - 2) this.hitPlayer();
  }

  private maybeEnemyFire(): void {
    if (Math.random() > 0.008) return;
    const cols = new Map<number, Invader>();
    for (const inv of this.invaders) {
      if (!inv.alive) continue;
      const prev = cols.get(inv.col);
      if (!prev || inv.row > prev.row) cols.set(inv.col, inv);
    }
    const shooters = [...cols.values()];
    if (shooters.length === 0) return;
    const shooter = shooters[Math.floor(Math.random() * shooters.length)];
    const p = this.invPos(shooter);
    this.bullets.push({
      x: p.x + INV_W / 2 - 1,
      y: p.y + INV_H,
      vy: ENEMY_BULLET_SPEED,
      player: false,
      alive: true,
    });
  }

  private playerBulletAlive(): boolean {
    return this.bullets.some((b) => b.alive && b.player);
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.y += b.vy * dt;
      if (b.y < 0 || b.y > GAME_H) {
        b.alive = false;
        continue;
      }

      // Bunker hits
      for (const c of this.bunkers) {
        if (!c.alive) continue;
        if (rectsOverlap(b.x, b.y, 2, 4, c.x, c.y, 2, 2)) {
          c.alive = false;
          b.alive = false;
          // Splash a few neighbors
          for (const n of this.bunkers) {
            if (
              n.alive &&
              Math.abs(n.x - c.x) <= 2 &&
              Math.abs(n.y - c.y) <= 2 &&
              Math.random() < 0.45
            ) {
              n.alive = false;
            }
          }
          break;
        }
      }
      if (!b.alive) continue;

      if (b.player) {
        for (const inv of this.invaders) {
          if (!inv.alive) continue;
          const p = this.invPos(inv);
          if (rectsOverlap(b.x, b.y, 2, 4, p.x, p.y, INV_W, INV_H)) {
            inv.alive = false;
            b.alive = false;
            // Speed up a bit when fewer remain
            const left = this.aliveCount();
            if (left > 0 && left % 5 === 0) {
              this.stepInterval = Math.max(0.2, this.stepInterval * 0.92);
            }
            break;
          }
        }
      } else if (this.lives > 0 && this.respawnTimer <= 0 && this.invuln <= 0) {
        if (
          rectsOverlap(
            b.x,
            b.y,
            2,
            4,
            this.shipX - SHIP_W / 2,
            SHIP_Y,
            SHIP_W,
            SHIP_H,
          )
        ) {
          b.alive = false;
          this.hitPlayer();
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.alive);
  }

  private hitPlayer(): void {
    if (this.invuln > 0 || this.respawnTimer > 0) return;
    this.lives--;
    this.bullets = [];
    if (this.lives <= 0) {
      this.lives = 3;
      this.stepInterval = 0.55;
      this.resetWave();
      this.buildBunkers();
      this.shipX = GAME_W / 2;
      this.invuln = 2;
      this.respawnTimer = 0;
    } else {
      this.respawnTimer = 1.0;
    }
  }

  private drawShip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    small: boolean,
  ): void {
    ctx.fillStyle = INV_COLORS.ship;
    const s = small ? 0.7 : 1;
    const w = SHIP_W * s;
    const h = SHIP_H * s;
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - h / 2 + 2 * s), w, h - 2 * s);
    ctx.fillRect(Math.round(x - 2 * s), Math.round(y - h / 2), 4 * s, 3 * s);
  }

  private drawInvader(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    row: number,
    alt: boolean,
  ): void {
    ctx.fillStyle = INV_COLORS.row[row] ?? INV_COLORS.row[4];
    const ox = Math.round(x);
    const oy = Math.round(y);
    // Simple pixel silhouettes by row type
    if (row === 0) {
      // Squid / bug
      ctx.fillRect(ox + 4, oy, 4, 2);
      ctx.fillRect(ox + 2, oy + 2, 8, 2);
      ctx.fillRect(ox, oy + 4, 12, 2);
      ctx.fillRect(ox + 2, oy + 6, 2, 2);
      ctx.fillRect(ox + 8, oy + 6, 2, 2);
      if (alt) {
        ctx.fillRect(ox, oy + 6, 2, 2);
        ctx.fillRect(ox + 10, oy + 6, 2, 2);
      } else {
        ctx.fillRect(ox + 2, oy + 6, 2, 2);
        ctx.fillRect(ox + 8, oy + 6, 2, 2);
      }
    } else if (row <= 2) {
      // Crab
      ctx.fillRect(ox + 2, oy, 8, 2);
      ctx.fillRect(ox, oy + 2, 12, 2);
      ctx.fillRect(ox, oy + 4, 12, 2);
      ctx.fillRect(ox + 2, oy + 6, 2, 2);
      ctx.fillRect(ox + 8, oy + 6, 2, 2);
      if (alt) {
        ctx.fillRect(ox - 2, oy + 2, 2, 2);
        ctx.fillRect(ox + 12, oy + 2, 2, 2);
      } else {
        ctx.fillRect(ox - 2, oy + 4, 2, 2);
        ctx.fillRect(ox + 12, oy + 4, 2, 2);
      }
    } else {
      // Octopus
      ctx.fillRect(ox + 2, oy, 8, 2);
      ctx.fillRect(ox, oy + 2, 12, 4);
      if (alt) {
        ctx.fillRect(ox, oy + 6, 2, 2);
        ctx.fillRect(ox + 4, oy + 6, 2, 2);
        ctx.fillRect(ox + 8, oy + 6, 2, 2);
      } else {
        ctx.fillRect(ox + 2, oy + 6, 2, 2);
        ctx.fillRect(ox + 6, oy + 6, 2, 2);
        ctx.fillRect(ox + 10, oy + 6, 2, 2);
      }
    }
  }
}
