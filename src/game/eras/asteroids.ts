import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

export const AST_COLOR = '#ffffff';

type Vec = { x: number; y: number };

type Rock = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  radius: number;
  verts: Vec[];
  size: 3 | 2 | 1;
  alive: boolean;
};

type Shot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  alive: boolean;
};

const ROT_SPEED = 4.2;
const THRUST = 140;
const FRICTION = 0.992;
const MAX_SPEED = 160;
const SHOT_SPEED = 220;
const SHOT_LIFE = 0.9;
const FIRE_COOLDOWN = 0.22;
const INVULN_TIME = 2;

function rockVerts(radius: number, seed: number): Vec[] {
  const n = 8 + (seed % 4);
  const verts: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const jag = 0.65 + ((Math.sin(seed * 12.9898 + i * 78.233) * 10000) % 100) / 100 * 0.45;
    const r = radius * jag;
    verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return verts;
}

function wrap(v: number, max: number): number {
  if (v < -20) return max + 20;
  if (v > max + 20) return -20;
  return v;
}

export type AsteroidsSpawnHint = {
  shipX: number;
  shipY: number;
  shipAngle: number;
};

export class AsteroidsEra implements Era {
  readonly id = 'asteroids' as const;

  private x = GAME_W / 2;
  private y = GAME_H / 2;
  private vx = 0;
  private vy = 0;
  private angle = -Math.PI / 2;
  private rocks: Rock[] = [];
  private shots: Shot[] = [];
  private cooldown = 0;
  private lives = 3;
  private invuln = INVULN_TIME;
  private respawnTimer = 0;
  private thrusting = false;

  enter(payload?: unknown): void {
    const hint = payload as AsteroidsSpawnHint | undefined;
    this.x = hint?.shipX ?? GAME_W / 2;
    this.y = hint?.shipY ?? GAME_H / 2;
    this.angle = hint?.shipAngle ?? -Math.PI / 2;
    this.vx = 0;
    this.vy = 0;
    this.shots = [];
    this.cooldown = 0;
    this.lives = 3;
    this.invuln = INVULN_TIME;
    this.respawnTimer = 0;
    this.spawnWave(4);
  }

  update(dt: number, input: InputState): EraResult {
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0 && this.lives > 0) {
        this.x = GAME_W / 2;
        this.y = GAME_H / 2;
        this.vx = 0;
        this.vy = 0;
        this.angle = -Math.PI / 2;
        this.invuln = INVULN_TIME;
      }
      this.updateRocks(dt);
      this.updateShots(dt);
      return { type: 'continue' };
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.thrusting = false;

    if (this.lives > 0) {
      if (input.left) this.angle -= ROT_SPEED * dt;
      if (input.right) this.angle += ROT_SPEED * dt;

      if (input.up) {
        this.thrusting = true;
        this.vx += Math.cos(this.angle) * THRUST * dt;
        this.vy += Math.sin(this.angle) * THRUST * dt;
        const spd = Math.hypot(this.vx, this.vy);
        if (spd > MAX_SPEED) {
          this.vx = (this.vx / spd) * MAX_SPEED;
          this.vy = (this.vy / spd) * MAX_SPEED;
        }
      }

      this.vx *= FRICTION;
      this.vy *= FRICTION;
      this.x = wrap(this.x + this.vx * dt, GAME_W);
      this.y = wrap(this.y + this.vy * dt, GAME_H);

      if (input.firePressed && this.cooldown <= 0) {
        this.cooldown = FIRE_COOLDOWN;
        this.shots.push({
          x: this.x + Math.cos(this.angle) * 8,
          y: this.y + Math.sin(this.angle) * 8,
          vx: Math.cos(this.angle) * SHOT_SPEED + this.vx * 0.3,
          vy: Math.sin(this.angle) * SHOT_SPEED + this.vy * 0.3,
          life: SHOT_LIFE,
          alive: true,
        });
      }
    }

    this.updateRocks(dt);
    this.updateShots(dt);
    this.collisions();

    if (this.rocks.every((r) => !r.alive)) {
      this.spawnWave(Math.min(7, 4 + Math.floor(Math.random() * 2)));
      this.invuln = Math.max(this.invuln, 1);
    }

    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.strokeStyle = AST_COLOR;
    ctx.fillStyle = AST_COLOR;
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';

    for (const r of this.rocks) {
      if (!r.alive) continue;
      this.strokePoly(ctx, r.x, r.y, r.angle, r.verts);
    }

    for (const s of this.shots) {
      if (!s.alive) continue;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.lives > 0 && this.respawnTimer <= 0) {
      if (this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0) {
        this.drawShip(ctx, this.x, this.y, this.angle, this.thrusting);
      }
    }

    // Life triangles
    const reserve = this.respawnTimer > 0 ? this.lives : Math.max(0, this.lives - 1);
    for (let i = 0; i < reserve; i++) {
      this.drawShip(ctx, 14 + i * 14, 14, -Math.PI / 2, false, 0.55);
    }
  }

  private spawnWave(count: number): void {
    this.rocks = [];
    for (let i = 0; i < count; i++) {
      let x = 0;
      let y = 0;
      // Keep clear of ship center
      do {
        x = Math.random() * GAME_W;
        y = Math.random() * GAME_H;
      } while (Math.hypot(x - this.x, y - this.y) < 70);
      this.rocks.push(this.makeRock(x, y, 3, i * 17 + 3));
    }
  }

  private makeRock(x: number, y: number, size: 3 | 2 | 1, seed: number): Rock {
    const radius = size === 3 ? 22 : size === 2 ? 13 : 7;
    const speed = size === 3 ? 18 : size === 2 ? 32 : 48;
    const a = Math.random() * Math.PI * 2;
    return {
      x,
      y,
      vx: Math.cos(a) * speed * (0.7 + Math.random() * 0.6),
      vy: Math.sin(a) * speed * (0.7 + Math.random() * 0.6),
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.5,
      radius,
      verts: rockVerts(radius, seed),
      size,
      alive: true,
    };
  }

  private updateRocks(dt: number): void {
    for (const r of this.rocks) {
      if (!r.alive) continue;
      r.x = wrap(r.x + r.vx * dt, GAME_W);
      r.y = wrap(r.y + r.vy * dt, GAME_H);
      r.angle += r.spin * dt;
    }
  }

  private updateShots(dt: number): void {
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.x = wrap(s.x + s.vx * dt, GAME_W);
      s.y = wrap(s.y + s.vy * dt, GAME_H);
      s.life -= dt;
      if (s.life <= 0) s.alive = false;
    }
    this.shots = this.shots.filter((s) => s.alive);
  }

  private collisions(): void {
    for (const s of this.shots) {
      if (!s.alive) continue;
      for (const r of this.rocks) {
        if (!r.alive) continue;
        if (Math.hypot(s.x - r.x, s.y - r.y) < r.radius) {
          s.alive = false;
          this.splitRock(r);
          break;
        }
      }
    }

    if (this.lives <= 0 || this.respawnTimer > 0 || this.invuln > 0) return;

    for (const r of this.rocks) {
      if (!r.alive) continue;
      if (Math.hypot(this.x - r.x, this.y - r.y) < r.radius + 4) {
        this.hitPlayer();
        break;
      }
    }
  }

  private splitRock(r: Rock): void {
    r.alive = false;
    if (r.size === 1) return;
    const next = (r.size - 1) as 2 | 1;
    this.rocks.push(this.makeRock(r.x, r.y, next, (r.x * 13) | 0));
    this.rocks.push(this.makeRock(r.x, r.y, next, (r.y * 17) | 0));
  }

  private hitPlayer(): void {
    this.lives--;
    this.shots = [];
    if (this.lives <= 0) {
      this.lives = 3;
      this.x = GAME_W / 2;
      this.y = GAME_H / 2;
      this.vx = 0;
      this.vy = 0;
      this.angle = -Math.PI / 2;
      this.invuln = INVULN_TIME;
      this.spawnWave(4);
      this.respawnTimer = 0;
    } else {
      this.respawnTimer = 1.1;
    }
  }

  private drawShip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    thrust: boolean,
    scale = 1,
  ): void {
    const nose = 9 * scale;
    const wing = 7 * scale;
    const indent = 3 * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(nose, 0);
    ctx.lineTo(-wing, wing * 0.85);
    ctx.lineTo(-indent, 0);
    ctx.lineTo(-wing, -wing * 0.85);
    ctx.closePath();
    ctx.stroke();
    if (thrust) {
      ctx.beginPath();
      ctx.moveTo(-indent, 0);
      ctx.lineTo(-wing - 3 * scale, 2 * scale);
      ctx.lineTo(-wing - 7 * scale, 0);
      ctx.lineTo(-wing - 3 * scale, -2 * scale);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  private strokePoly(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    verts: Vec[],
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}
