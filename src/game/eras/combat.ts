import {
  angleTo,
  clamp,
  dist,
  normAngle,
  rectsOverlap,
} from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

export const COLORS = {
  field: '#556b2f',
  wall: '#c4a574',
  player: '#e02020',
  enemy: '#2040d0',
  bullet: '#101010',
  scoreP: '#e02020',
  scoreE: '#2040d0',
};

const BORDER = 8;
const TANK = 10;
const BULLET = 2;
const BULLET_SPEED = 160;
const TANK_SPEED = 55;
const ROT_SPEED = 3.2;
const FIRE_COOLDOWN = 0.45;
const AI_FIRE_COOLDOWN = 1.35;
const AI_ROT_SPEED = 2.1;
const MAX_BOUNCES = 4;

type Rect = { x: number; y: number; w: number; h: number };

type Tank = {
  x: number;
  y: number;
  angle: number;
  cooldown: number;
  alive: boolean;
  color: string;
  isPlayer: boolean;
  aiTimer: number;
  aiDrive: number;
  aiWanderAngle: number;
  aiChase: boolean;
};

type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounces: number;
  ownerPlayer: boolean;
  alive: boolean;
};

/** Classic Combat-style symmetrical arena */
export function buildArena(): Rect[] {
  const walls: Rect[] = [];
  // Outer border
  walls.push({ x: 0, y: 16, w: GAME_W, h: BORDER }); // top play border under score
  walls.push({ x: 0, y: GAME_H - BORDER, w: GAME_W, h: BORDER });
  walls.push({ x: 0, y: 16, w: BORDER, h: GAME_H - 16 });
  walls.push({ x: GAME_W - BORDER, y: 16, w: BORDER, h: GAME_H - 16 });

  const t = 16;
  // Corner L shapes
  // TL
  walls.push({ x: 40, y: 40, w: t * 2, h: t });
  walls.push({ x: 40, y: 40, w: t, h: t * 2 });
  // TR
  walls.push({ x: GAME_W - 40 - t * 2, y: 40, w: t * 2, h: t });
  walls.push({ x: GAME_W - 40 - t, y: 40, w: t, h: t * 2 });
  // BL
  walls.push({ x: 40, y: GAME_H - 40 - t, w: t * 2, h: t });
  walls.push({ x: 40, y: GAME_H - 40 - t * 2, w: t, h: t * 2 });
  // BR
  walls.push({ x: GAME_W - 40 - t * 2, y: GAME_H - 40 - t, w: t * 2, h: t });
  walls.push({ x: GAME_W - 40 - t, y: GAME_H - 40 - t * 2, w: t, h: t * 2 });

  // Top / bottom T barriers
  walls.push({ x: GAME_W / 2 - t * 1.5, y: 48, w: t * 3, h: t });
  walls.push({ x: GAME_W / 2 - t / 2, y: 48, w: t, h: t * 2 });
  walls.push({ x: GAME_W / 2 - t * 1.5, y: GAME_H - 48 - t, w: t * 3, h: t });
  walls.push({ x: GAME_W / 2 - t / 2, y: GAME_H - 48 - t * 2, w: t, h: t * 2 });

  // Side blocks
  walls.push({ x: 88, y: GAME_H / 2 - t / 2 + 4, w: t, h: t });
  walls.push({ x: GAME_W - 88 - t, y: GAME_H / 2 - t / 2 + 4, w: t, h: t });

  return walls;
}

function tankRect(t: Tank): Rect {
  return { x: t.x - TANK / 2, y: t.y - TANK / 2, w: TANK, h: TANK };
}

function collidesWalls(x: number, y: number, w: number, h: number, walls: Rect[]): boolean {
  for (const r of walls) {
    if (rectsOverlap(x, y, w, h, r.x, r.y, r.w, r.h)) return true;
  }
  return false;
}

export class CombatEra implements Era {
  readonly id = 'combat' as const;

  walls: Rect[] = [];
  tanks: Tank[] = [];
  bullets: Bullet[] = [];
  playerScore = 0;
  enemyScore = 0;
  private respawnTimer = 0;
  private pendingEvolve = false;

  enter(): void {
    this.walls = buildArena();
    this.playerScore = 0;
    this.enemyScore = 0;
    this.bullets = [];
    this.pendingEvolve = false;
    this.spawnTanks();
  }

  snapshot(): {
    playerX: number;
    playerY: number;
    playerAngle: number;
    enemyPositions: { x: number; y: number; angle: number }[];
  } {
    const player = this.tanks.find((t) => t.isPlayer);
    const enemies = this.tanks.filter((t) => !t.isPlayer);
    return {
      playerX: player?.x ?? 56,
      playerY: player?.y ?? GAME_H / 2,
      playerAngle: player?.angle ?? 0,
      enemyPositions: enemies.map((e) => ({ x: e.x, y: e.y, angle: e.angle })),
    };
  }

  update(dt: number, input: InputState): EraResult {
    if (this.pendingEvolve) {
      return { type: 'evolve', next: 'invaders', payload: this.snapshot() };
    }

    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.spawnTanks();
    }

    const player = this.tanks.find((t) => t.isPlayer);
    if (player?.alive) {
      this.controlTank(player, input, dt);
      if (input.firePressed) this.tryFire(player);
    }

    for (const t of this.tanks) {
      if (!t.alive || t.isPlayer) continue;
      this.updateAI(t, dt);
    }

    this.updateBullets(dt);

    if (this.pendingEvolve) {
      return { type: 'evolve', next: 'invaders', payload: this.snapshot() };
    }

    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    ctx.fillStyle = COLORS.field;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Score bar
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, 16);
    this.drawDigit(ctx, this.playerScore % 10, 48, 2, COLORS.scoreP);
    this.drawDigit(ctx, this.enemyScore % 10, GAME_W - 64, 2, COLORS.scoreE);

    ctx.fillStyle = COLORS.wall;
    for (const w of this.walls) {
      ctx.fillRect(w.x, w.y, w.w, w.h);
    }

    for (const t of this.tanks) {
      if (!t.alive) continue;
      this.drawTank(ctx, t);
    }

    ctx.fillStyle = COLORS.bullet;
    for (const b of this.bullets) {
      if (!b.alive) continue;
      ctx.fillRect(Math.round(b.x), Math.round(b.y), BULLET, BULLET);
    }
  }

  private spawnTanks(): void {
    this.tanks = [
      {
        x: 56,
        y: GAME_H / 2,
        angle: 0,
        cooldown: 0,
        alive: true,
        color: COLORS.player,
        isPlayer: true,
        aiTimer: 0,
        aiDrive: 0,
        aiWanderAngle: 0,
        aiChase: true,
      },
      {
        x: GAME_W - 64,
        y: GAME_H / 2 - 36,
        angle: Math.PI,
        cooldown: 1.2,
        alive: true,
        color: COLORS.enemy,
        isPlayer: false,
        aiTimer: 0,
        aiDrive: 1,
        aiWanderAngle: Math.PI,
        aiChase: false,
      },
      {
        x: GAME_W - 64,
        y: GAME_H / 2 + 36,
        angle: Math.PI,
        cooldown: 1.8,
        alive: true,
        color: COLORS.enemy,
        isPlayer: false,
        aiTimer: 0.3,
        aiDrive: 1,
        aiWanderAngle: Math.PI,
        aiChase: true,
      },
    ];
    this.bullets = [];
  }

  private controlTank(t: Tank, input: InputState, dt: number): void {
    if (input.left) t.angle -= ROT_SPEED * dt;
    if (input.right) t.angle += ROT_SPEED * dt;
    let drive = 0;
    if (input.up) drive = 1;
    if (input.down) drive = -1;
    if (drive !== 0) this.moveTank(t, drive, dt);
    t.cooldown = Math.max(0, t.cooldown - dt);
  }

  private updateAI(t: Tank, dt: number): void {
    t.cooldown = Math.max(0, t.cooldown - dt);
    t.aiTimer -= dt;

    const player = this.tanks.find((p) => p.isPlayer && p.alive);
    if (!player) return;

    if (t.aiTimer <= 0) {
      t.aiTimer = 0.7 + Math.random() * 1.4;
      const d = dist(t, player);
      // Often wander instead of chasing
      t.aiChase = Math.random() < 0.4;
      t.aiWanderAngle = t.angle + (Math.random() - 0.5) * Math.PI * 1.4;
      if (d < 40) t.aiDrive = -1;
      else if (Math.random() < 0.35) t.aiDrive = 0;
      else if (Math.random() < 0.25) t.aiDrive = -1;
      else t.aiDrive = 1;
    }

    const desired = t.aiChase ? angleTo(t, player) : t.aiWanderAngle;
    const diff = normAngle(desired - t.angle);
    const turn = clamp(diff, -AI_ROT_SPEED * dt, AI_ROT_SPEED * dt);
    t.angle += turn;

    if (t.aiDrive !== 0) this.moveTank(t, t.aiDrive, dt * 0.85);

    // Fire sparingly when roughly aimed at the player
    const aimDiff = normAngle(angleTo(t, player) - t.angle);
    if (Math.abs(aimDiff) < 0.2 && dist(t, player) < 160 && t.cooldown <= 0) {
      if (Math.random() < 0.012) this.tryFire(t, true);
    }
  }

  private moveTank(t: Tank, drive: number, dt: number): void {
    const nx = t.x + Math.cos(t.angle) * TANK_SPEED * drive * dt;
    const ny = t.y + Math.sin(t.angle) * TANK_SPEED * drive * dt;
    const r = tankRect({ ...t, x: nx, y: t.y });
    if (!collidesWalls(r.x, r.y, r.w, r.h, this.walls)) t.x = nx;
    const r2 = tankRect({ ...t, x: t.x, y: ny });
    if (!collidesWalls(r2.x, r2.y, r2.w, r2.h, this.walls)) t.y = ny;

    // Soft tank-tank separation
    for (const o of this.tanks) {
      if (o === t || !o.alive) continue;
      const d = dist(t, o);
      if (d < TANK + 2 && d > 0.01) {
        const push = (TANK + 2 - d) * 0.5;
        t.x += ((t.x - o.x) / d) * push;
        t.y += ((t.y - o.y) / d) * push;
      }
    }
  }

  private tryFire(t: Tank, isAi = false): void {
    if (t.cooldown > 0) return;
    // One bullet per tank at a time
    const mine = this.bullets.find((b) => b.alive && b.ownerPlayer === t.isPlayer);
    // Allow multiple for AI collectively but limit per tank via cooldown; player one live
    if (t.isPlayer && mine) return;

    t.cooldown = isAi || !t.isPlayer ? AI_FIRE_COOLDOWN : FIRE_COOLDOWN;
    const muzzle = TANK / 2 + 2;
    this.bullets.push({
      x: t.x + Math.cos(t.angle) * muzzle - BULLET / 2,
      y: t.y + Math.sin(t.angle) * muzzle - BULLET / 2,
      vx: Math.cos(t.angle) * BULLET_SPEED,
      vy: Math.sin(t.angle) * BULLET_SPEED,
      bounces: 0,
      ownerPlayer: t.isPlayer,
      alive: true,
    });
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      let nx = b.x + b.vx * dt;
      let ny = b.y + b.vy * dt;

      // Bounce on walls
      const hitX = collidesWalls(nx, b.y, BULLET, BULLET, this.walls);
      const hitY = collidesWalls(b.x, ny, BULLET, BULLET, this.walls);
      if (hitX) {
        b.vx *= -1;
        nx = b.x;
        b.bounces++;
      }
      if (hitY) {
        b.vy *= -1;
        ny = b.y;
        b.bounces++;
      }
      if (b.bounces > MAX_BOUNCES) {
        b.alive = false;
        continue;
      }
      b.x = nx;
      b.y = ny;

      for (const t of this.tanks) {
        if (!t.alive) continue;
        // Friendly fire off for owner briefly — actually classic has friendly; keep simple: all hit
        const r = tankRect(t);
        if (rectsOverlap(b.x, b.y, BULLET, BULLET, r.x, r.y, r.w, r.h)) {
          // Don't instantly hit self at muzzle
          if (t.isPlayer === b.ownerPlayer && b.bounces === 0) {
            const owner = this.tanks.find((o) => o.isPlayer === b.ownerPlayer && o.alive);
            if (owner && dist({ x: b.x, y: b.y }, owner) < TANK) continue;
          }
          b.alive = false;
          t.alive = false;
          if (t.isPlayer) {
            this.enemyScore++;
          } else {
            this.playerScore++;
          }
          const playerAlive = this.tanks.some((x) => x.isPlayer && x.alive);
          const enemiesAlive = this.tanks.some((x) => !x.isPlayer && x.alive);

          // Player wiped both tanks → evolve into Space Invaders
          if (playerAlive && !enemiesAlive) {
            this.pendingEvolve = true;
            this.bullets = [];
            break;
          }

          // Player died → brief pause then respawn round
          if (!playerAlive) {
            this.respawnTimer = 1.2;
            for (const x of this.tanks) x.alive = false;
            this.bullets = [];
          }
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.alive);
  }

  private drawTank(ctx: CanvasRenderingContext2D, t: Tank): void {
    ctx.save();
    ctx.translate(Math.round(t.x), Math.round(t.y));
    ctx.rotate(t.angle);
    ctx.fillStyle = t.color;
    // Body
    ctx.fillRect(-5, -4, 8, 8);
    // Barrel
    ctx.fillRect(2, -1, 6, 2);
    // Treads
    ctx.fillRect(-5, -5, 8, 1);
    ctx.fillRect(-5, 4, 8, 1);
    ctx.restore();
  }

  /** Minimal 3x5 digit for scores — game HUD, not site copy */
  private drawDigit(
    ctx: CanvasRenderingContext2D,
    n: number,
    x: number,
    y: number,
    color: string,
  ): void {
    const glyphs: Record<number, string[]> = {
      0: ['111', '101', '101', '101', '111'],
      1: ['010', '110', '010', '010', '111'],
      2: ['111', '001', '111', '100', '111'],
      3: ['111', '001', '111', '001', '111'],
      4: ['101', '101', '111', '001', '001'],
      5: ['111', '100', '111', '001', '111'],
      6: ['111', '100', '111', '101', '111'],
      7: ['111', '001', '001', '001', '001'],
      8: ['111', '101', '111', '101', '111'],
      9: ['111', '101', '111', '001', '111'],
    };
    const g = glyphs[n] ?? glyphs[0];
    const s = 2;
    ctx.fillStyle = color;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (g[row][col] === '1') ctx.fillRect(x + col * s, y + row * s, s, s);
      }
    }
  }
}
