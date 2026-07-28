import { angleTo, clamp, dist, normAngle } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

export const WAR_COLOR = '#40e0e0';

type Fighter = {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
};

const SPEED = 70;
const ROT = 3.4;
const SWORD = 22;
const BODY = 7;
const MATCH_TIME = 58;

export class WarriorEra implements Era {
  readonly id = 'warrior' as const;

  private player: Fighter = { x: GAME_W / 2, y: GAME_H * 0.68, angle: -Math.PI / 2, vx: 0, vy: 0 };
  private enemy: Fighter = { x: GAME_W / 2, y: GAME_H * 0.32, angle: Math.PI / 2, vx: 0, vy: 0 };
  private playerScore = 0;
  private enemyScore = 0;
  private elapsed = 0;
  private stun = 0;
  private endTimer = 0;
  private ended = false;
  private hitFlash = 0;

  enter(): void {
    this.resetRound(true);
    this.playerScore = 0;
    this.enemyScore = 0;
    this.elapsed = 0;
    this.ended = false;
    this.endTimer = 0;
  }

  snapshot(): {
    player: Fighter;
    enemy: Fighter;
    playerScore: number;
    enemyScore: number;
  } {
    return {
      player: { ...this.player },
      enemy: { ...this.enemy },
      playerScore: this.playerScore,
      enemyScore: this.enemyScore,
    };
  }

  update(dt: number, input: InputState): EraResult {
    if (this.ended) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        return { type: 'evolve', next: 'rallyx', payload: this.snapshot() };
      }
      return { type: 'continue' };
    }

    this.elapsed += dt;
    this.stun = Math.max(0, this.stun - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    if (this.stun <= 0) {
      this.controlFighter(this.player, input, dt, true);
      this.updateAI(dt);
      this.checkHits();
    }

    // End on time or first to 3
    if (
      this.elapsed >= MATCH_TIME ||
      this.playerScore >= 3 ||
      this.enemyScore >= 3
    ) {
      this.ended = true;
      this.endTimer = 1.2;
    }

    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.strokeStyle = WAR_COLOR;
    ctx.fillStyle = WAR_COLOR;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    // Score boxes (digits only)
    this.drawScoreBox(ctx, GAME_W / 2 - 28, 8, this.playerScore);
    this.drawScoreBox(ctx, GAME_W / 2 + 4, 8, this.enemyScore);
    this.drawScoreBox(ctx, GAME_W / 2 - 28, GAME_H - 22, this.enemyScore);
    this.drawScoreBox(ctx, GAME_W / 2 + 4, GAME_H - 22, this.playerScore);

    if (this.hitFlash > 0) {
      ctx.globalAlpha = 0.25;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      ctx.globalAlpha = 1;
    }

    this.drawWarrior(ctx, this.player);
    this.drawWarrior(ctx, this.enemy);
  }

  private resetRound(full: boolean): void {
    this.player = { x: GAME_W / 2, y: GAME_H * 0.68, angle: -Math.PI / 2, vx: 0, vy: 0 };
    this.enemy = { x: GAME_W / 2, y: GAME_H * 0.32, angle: Math.PI / 2, vx: 0, vy: 0 };
    this.stun = full ? 0.6 : 0.9;
  }

  private controlFighter(f: Fighter, input: InputState, dt: number, isPlayer: boolean): void {
    if (input.left) f.angle -= ROT * dt;
    if (input.right) f.angle += ROT * dt;
    let drive = 0;
    if (input.up) drive = 1;
    if (input.down) drive = -0.55;
    f.vx = Math.cos(f.angle) * SPEED * drive;
    f.vy = Math.sin(f.angle) * SPEED * drive;
    f.x = clamp(f.x + f.vx * dt, 20, GAME_W - 20);
    f.y = clamp(f.y + f.vy * dt, 28, GAME_H - 28);
    void isPlayer;
  }

  private updateAI(dt: number): void {
    const e = this.enemy;
    const desired = angleTo(e, this.player);
    let diff = normAngle(desired - e.angle);
    // Keep sword pointed near player, with wobble
    e.angle += clamp(diff + Math.sin(this.elapsed * 2) * 0.15, -ROT * dt, ROT * dt);

    const d = dist(e, this.player);
    let drive = 0;
    if (d > 34) drive = 0.85;
    else if (d < 22) drive = -0.4;
    else drive = 0.25 + Math.sin(this.elapsed * 3) * 0.2;

    // Strafe occasionally
    if (Math.sin(this.elapsed * 1.7) > 0.7) {
      e.angle += ROT * 0.4 * dt;
    }

    e.x = clamp(e.x + Math.cos(e.angle) * SPEED * drive * dt, 20, GAME_W - 20);
    e.y = clamp(e.y + Math.sin(e.angle) * SPEED * drive * dt, 28, GAME_H - 28);
  }

  private tip(f: Fighter): { x: number; y: number } {
    return {
      x: f.x + Math.cos(f.angle) * SWORD,
      y: f.y + Math.sin(f.angle) * SWORD,
    };
  }

  private checkHits(): void {
    const pTip = this.tip(this.player);
    const eTip = this.tip(this.enemy);

    if (dist(pTip, this.enemy) < BODY) {
      this.playerScore++;
      this.hitFlash = 0.2;
      this.resetRound(false);
      return;
    }
    if (dist(eTip, this.player) < BODY) {
      this.enemyScore++;
      this.hitFlash = 0.2;
      this.resetRound(false);
    }
  }

  private drawWarrior(ctx: CanvasRenderingContext2D, f: Fighter): void {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    // Body diamond
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(0, 5);
    ctx.lineTo(-8, 0);
    ctx.lineTo(0, -5);
    ctx.closePath();
    ctx.stroke();
    // Head
    ctx.beginPath();
    ctx.arc(-2, 0, 3, 0, Math.PI * 2);
    ctx.stroke();
    // Sword
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(SWORD, 0);
    ctx.stroke();
    // Crossguard
    ctx.beginPath();
    ctx.moveTo(8, -3);
    ctx.lineTo(8, 3);
    ctx.stroke();
    ctx.restore();
  }

  private drawScoreBox(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
    ctx.strokeRect(x, y, 22, 14);
    const s = String(Math.min(99, n)).padStart(2, '0');
    // Tiny block digits
    this.drawDigit(ctx, Number(s[0]), x + 3, y + 3);
    this.drawDigit(ctx, Number(s[1]), x + 12, y + 3);
  }

  private drawDigit(ctx: CanvasRenderingContext2D, n: number, x: number, y: number): void {
    const g: Record<number, string[]> = {
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
    const rows = g[n] ?? g[0];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (rows[r][c] === '1') ctx.fillRect(x + c * 2, y + r * 2, 2, 2);
      }
    }
  }
}
