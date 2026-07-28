import { clamp, rectsOverlap } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

export const GAL_COLORS = {
  ship: '#ffffff',
  shipAccent: '#e02020',
  shot: '#40e040',
  star: '#ffffff',
  // Formation rows top → bottom
  boss: '#e0e020',
  bossAccent: '#e02020',
  blue: '#2040c0',
  purple: '#c040c0',
  cyan: '#40c0e0',
  diveShot: '#e04040',
  flag: '#e02020',
};

const SHIP_Y = GAME_H - 22;
const SHIP_W = 12;
const SHIP_SPEED = 130;
const SHOT_SPEED = 240;

type Alien = {
  col: number;
  row: number;
  alive: boolean;
  diving: boolean;
  diveT: number;
  diveFromX: number;
  diveFromY: number;
  x: number;
  y: number;
  kind: 'boss' | 'blue' | 'purple' | 'cyan';
};

type Shot = { x: number; y: number; vy: number; player: boolean; alive: boolean };

const COLS = 8;
const ROWS = 6;

function kindForRow(row: number): Alien['kind'] {
  if (row === 0) return 'boss';
  if (row === 1) return 'blue';
  if (row <= 3) return 'purple';
  return 'cyan';
}

export class GalaxianEra implements Era {
  readonly id = 'galaxian' as const;

  private shipX = GAME_W / 2;
  private aliens: Alien[] = [];
  private originX = 70;
  private originY = 28;
  private sway = 0;
  private swayDir = 1;
  private shots: Shot[] = [];
  private cooldown = 0;
  private lives = 3;
  private invuln = 1.5;
  private respawnTimer = 0;
  private diveTimer = 1.2;
  private stars: { x: number; y: number }[] = [];
  private stage = 2; // Galaxian part 2
  private explosions: { x: number; y: number; t: number }[] = [];

  enter(): void {
    this.shipX = GAME_W / 2;
    this.lives = 3;
    this.invuln = 1.5;
    this.respawnTimer = 0;
    this.shots = [];
    this.cooldown = 0;
    this.stage = 2;
    this.sway = 0;
    this.swayDir = 1;
    this.diveTimer = 0.8;
    this.stars = Array.from({ length: 50 }, () => ({
      x: Math.random() * GAME_W,
      y: Math.random() * GAME_H,
    }));
    this.resetFormation();
  }

  update(dt: number, input: InputState): EraResult {
    // Star drift
    for (const s of this.stars) {
      s.y += 12 * dt;
      if (s.y > GAME_H) {
        s.y = 0;
        s.x = Math.random() * GAME_W;
      }
    }

    for (const e of this.explosions) e.t -= dt;
    this.explosions = this.explosions.filter((e) => e.t > 0);

    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.shipX = GAME_W / 2;
        this.invuln = 1.5;
      }
      this.updateAliens(dt);
      this.updateShots(dt);
      return { type: 'continue' };
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.lives > 0) {
      if (input.left) this.shipX -= SHIP_SPEED * dt;
      if (input.right) this.shipX += SHIP_SPEED * dt;
      this.shipX = clamp(this.shipX, 10, GAME_W - 10);

      if (input.firePressed && this.cooldown <= 0 && !this.playerShotAlive()) {
        this.cooldown = 0.28;
        this.shots.push({
          x: this.shipX - 1,
          y: SHIP_Y - 6,
          vy: -SHOT_SPEED,
          player: true,
          alive: true,
        });
      }
    }

    this.updateAliens(dt);
    this.updateShots(dt);

    if (this.aliens.every((a) => !a.alive)) {
      this.stage++;
      this.resetFormation();
      this.invuln = 1.5;
      this.diveTimer = 0.6;
    }

    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.fillStyle = GAL_COLORS.star;
    for (const s of this.stars) {
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }

    for (const a of this.aliens) {
      if (!a.alive) continue;
      this.drawAlien(ctx, a.x, a.y, a.kind);
    }

    for (const e of this.explosions) {
      const p = e.t * 8;
      ctx.fillStyle = p > 4 ? '#e0e020' : '#e02020';
      ctx.fillRect(Math.round(e.x - 2), Math.round(e.y - 2), 4, 4);
      ctx.fillRect(Math.round(e.x - p), Math.round(e.y), 2, 2);
      ctx.fillRect(Math.round(e.x + p), Math.round(e.y), 2, 2);
    }

    for (const s of this.shots) {
      if (!s.alive) continue;
      ctx.fillStyle = s.player ? GAL_COLORS.shot : GAL_COLORS.diveShot;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, s.player ? 6 : 4);
    }

    if (this.lives > 0 && this.respawnTimer <= 0) {
      if (this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0) {
        this.drawShip(ctx, this.shipX, SHIP_Y);
      }
    }

    // Lives
    const reserve = this.respawnTimer > 0 ? this.lives : Math.max(0, this.lives - 1);
    for (let i = 0; i < reserve; i++) {
      this.drawShip(ctx, 14 + i * 16, GAME_H - 8, 0.65);
    }

    // Stage flags (part 2 → two flags)
    const flags = Math.min(5, this.stage);
    for (let i = 0; i < flags; i++) {
      ctx.fillStyle = GAL_COLORS.flag;
      const fx = GAME_W - 14 - i * 10;
      ctx.fillRect(fx, GAME_H - 12, 6, 4);
      ctx.fillRect(fx + 5, GAME_H - 16, 1, 10);
    }
  }

  private resetFormation(): void {
    this.aliens = [];
    this.originX = 70;
    this.originY = 28;
    for (let row = 0; row < ROWS; row++) {
      const cols = row === 0 ? 2 : COLS;
      const offset = row === 0 ? 3 : 0;
      for (let c = 0; c < cols; c++) {
        const col = c + offset;
        this.aliens.push({
          col,
          row,
          alive: true,
          diving: false,
          diveT: 0,
          diveFromX: 0,
          diveFromY: 0,
          x: 0,
          y: 0,
          kind: kindForRow(row),
        });
      }
    }
    this.syncFormationPositions();
  }

  private homePos(a: Alien): { x: number; y: number } {
    return {
      x: this.originX + this.sway + a.col * 20,
      y: this.originY + a.row * 14,
    };
  }

  private syncFormationPositions(): void {
    for (const a of this.aliens) {
      if (!a.alive || a.diving) continue;
      const p = this.homePos(a);
      a.x = p.x;
      a.y = p.y;
    }
  }

  private updateAliens(dt: number): void {
    this.sway += this.swayDir * 18 * dt;
    if (this.sway > 24) this.swayDir = -1;
    if (this.sway < -10) this.swayDir = 1;
    this.syncFormationPositions();

    this.diveTimer -= dt;
    if (this.diveTimer <= 0) {
      this.diveTimer = 1.4 + Math.random() * 1.2;
      this.startDive();
    }

    for (const a of this.aliens) {
      if (!a.alive || !a.diving) continue;
      a.diveT += dt;
      const t = a.diveT;
      // Curving dive toward player then off screen or back
      const targetX = this.shipX;
      const home = this.homePos(a);
      if (t < 1.8) {
        const u = t / 1.8;
        a.x = a.diveFromX + Math.sin(u * Math.PI * 2) * 40 + (targetX - a.diveFromX) * u * 0.55;
        a.y = a.diveFromY + u * (GAME_H - 50 - a.diveFromY);
        if (Math.random() < 0.012) {
          this.shots.push({
            x: a.x + 4,
            y: a.y + 8,
            vy: 90,
            player: false,
            alive: true,
          });
        }
      } else {
        // Return to formation
        const u = Math.min(1, (t - 1.8) / 1.2);
        a.x = lerp(a.x, home.x, 0.08);
        a.y = lerp(a.y, home.y, 0.08);
        if (u >= 1 || (Math.abs(a.x - home.x) < 3 && Math.abs(a.y - home.y) < 3)) {
          a.diving = false;
          a.x = home.x;
          a.y = home.y;
        }
      }

      // Hit player while diving
      if (
        this.lives > 0 &&
        this.respawnTimer <= 0 &&
        this.invuln <= 0 &&
        rectsOverlap(a.x, a.y, 12, 10, this.shipX - SHIP_W / 2, SHIP_Y - 4, SHIP_W, 10)
      ) {
        a.alive = false;
        this.hitPlayer();
      }
    }
  }

  private startDive(): void {
    const candidates = this.aliens.filter((a) => a.alive && !a.diving);
    if (candidates.length === 0) return;
    // Prefer lower rows / cyan
    const weighted = candidates.filter((a) => a.row >= 2);
    const pool = weighted.length > 0 ? weighted : candidates;
    const a = pool[Math.floor(Math.random() * pool.length)];
    a.diving = true;
    a.diveT = 0;
    a.diveFromX = a.x;
    a.diveFromY = a.y;
  }

  private playerShotAlive(): boolean {
    return this.shots.some((s) => s.alive && s.player);
  }

  private updateShots(dt: number): void {
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.y += s.vy * dt;
      if (s.y < -10 || s.y > GAME_H + 10) {
        s.alive = false;
        continue;
      }

      if (s.player) {
        for (const a of this.aliens) {
          if (!a.alive) continue;
          if (rectsOverlap(s.x, s.y, 2, 6, a.x, a.y, 12, 10)) {
            a.alive = false;
            s.alive = false;
            this.explosions.push({ x: a.x + 6, y: a.y + 5, t: 0.35 });
            break;
          }
        }
      } else if (
        this.lives > 0 &&
        this.respawnTimer <= 0 &&
        this.invuln <= 0 &&
        rectsOverlap(s.x, s.y, 2, 4, this.shipX - SHIP_W / 2, SHIP_Y - 4, SHIP_W, 10)
      ) {
        s.alive = false;
        this.hitPlayer();
      }
    }
    this.shots = this.shots.filter((s) => s.alive);
  }

  private hitPlayer(): void {
    this.lives--;
    this.shots = this.shots.filter((s) => !s.player);
    this.explosions.push({ x: this.shipX, y: SHIP_Y, t: 0.4 });
    if (this.lives <= 0) {
      this.lives = 3;
      this.resetFormation();
      this.shipX = GAME_W / 2;
      this.invuln = 2;
      this.respawnTimer = 0;
      this.stage = 2;
    } else {
      this.respawnTimer = 1.1;
    }
  }

  private drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
    const s = scale;
    ctx.fillStyle = GAL_COLORS.ship;
    ctx.fillRect(Math.round(x - 1 * s), Math.round(y - 6 * s), 2 * s, 8 * s);
    ctx.fillRect(Math.round(x - 5 * s), Math.round(y - 1 * s), 10 * s, 3 * s);
    ctx.fillStyle = GAL_COLORS.shipAccent;
    ctx.fillRect(Math.round(x - 6 * s), Math.round(y + 1 * s), 3 * s, 2 * s);
    ctx.fillRect(Math.round(x + 3 * s), Math.round(y + 1 * s), 3 * s, 2 * s);
  }

  private drawAlien(ctx: CanvasRenderingContext2D, x: number, y: number, kind: Alien['kind']): void {
    const ox = Math.round(x);
    const oy = Math.round(y);
    if (kind === 'boss') {
      ctx.fillStyle = GAL_COLORS.boss;
      ctx.fillRect(ox + 2, oy, 10, 4);
      ctx.fillRect(ox, oy + 4, 14, 4);
      ctx.fillStyle = GAL_COLORS.bossAccent;
      ctx.fillRect(ox + 2, oy + 8, 3, 2);
      ctx.fillRect(ox + 9, oy + 8, 3, 2);
    } else if (kind === 'blue') {
      ctx.fillStyle = GAL_COLORS.blue;
      ctx.fillRect(ox + 3, oy, 8, 3);
      ctx.fillRect(ox, oy + 3, 14, 4);
      ctx.fillRect(ox + 1, oy + 7, 3, 2);
      ctx.fillRect(ox + 10, oy + 7, 3, 2);
    } else if (kind === 'purple') {
      ctx.fillStyle = GAL_COLORS.purple;
      ctx.fillRect(ox + 2, oy, 10, 3);
      ctx.fillRect(ox, oy + 3, 14, 5);
      ctx.fillRect(ox, oy + 8, 3, 2);
      ctx.fillRect(ox + 11, oy + 8, 3, 2);
    } else {
      ctx.fillStyle = GAL_COLORS.cyan;
      ctx.fillRect(ox + 1, oy, 12, 3);
      ctx.fillRect(ox, oy + 3, 14, 4);
      ctx.fillRect(ox - 1, oy + 5, 3, 2);
      ctx.fillRect(ox + 12, oy + 5, 3, 2);
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
