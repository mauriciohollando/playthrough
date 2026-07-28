import { clamp, dist } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

export const FB_COLORS = {
  field: '#808080',
  line: '#ffffff',
  sidebar: '#000000',
  player: '#ffffff',
};

type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  offense: boolean;
  hasBall: boolean;
};

const FIELD_X = 48;
const FIELD_W = GAME_W - 96;
const FIELD_Y = 8;
const FIELD_H = GAME_H - 16;
const SPEED = 55;
const AI_SPEED = 42;

export class FootballEra implements Era {
  readonly id = 'football' as const;

  private players: Player[] = [];
  private ballX = 0;
  private ballY = 0;
  private playActive = false;
  private huddleTimer = 0.8;
  private scoreHome = 0;
  private scoreAway = 0;
  private down = 1;
  private lineOfScrimmage = FIELD_X + 40;

  enter(): void {
    this.scoreHome = 0;
    this.scoreAway = 0;
    this.down = 1;
    this.lineOfScrimmage = FIELD_X + 50;
    this.setupPlay();
  }

  update(dt: number, input: InputState): EraResult {
    if (this.huddleTimer > 0) {
      this.huddleTimer -= dt;
      if (this.huddleTimer <= 0) this.playActive = true;
      return { type: 'continue' };
    }

    const carrier = this.players.find((p) => p.hasBall && p.offense);

    if (this.playActive && carrier) {
      let dx = 0;
      let dy = 0;
      if (input.left) dx -= 1;
      if (input.right) dx += 1;
      if (input.up) dy -= 1;
      if (input.down) dy += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        carrier.vx = (dx / len) * SPEED;
        carrier.vy = (dy / len) * SPEED;
      } else {
        carrier.vx *= 0.85;
        carrier.vy *= 0.85;
      }
    }

    for (const p of this.players) {
      if (!(p.hasBall && p.offense)) {
        if (p.offense) {
          const threat = this.nearest(p, false);
          if (threat) {
            const a = Math.atan2(threat.y - p.y, threat.x - p.x);
            p.vx = Math.cos(a) * AI_SPEED * 0.7;
            p.vy = Math.sin(a) * AI_SPEED * 0.7;
          }
        } else {
          const target = carrier ?? { x: this.ballX, y: this.ballY };
          const a = Math.atan2(target.y - p.y, target.x - p.x);
          p.vx = Math.cos(a) * AI_SPEED;
          p.vy = Math.sin(a) * AI_SPEED;
        }
      }

      if (this.playActive) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.x = clamp(p.x, FIELD_X + 4, FIELD_X + FIELD_W - 4);
        p.y = clamp(p.y, FIELD_Y + 6, FIELD_Y + FIELD_H - 6);
      }
    }

    if (carrier) {
      this.ballX = carrier.x;
      this.ballY = carrier.y;
      if (carrier.x >= FIELD_X + FIELD_W - 14) {
        this.scoreHome++;
        this.down = 1;
        this.lineOfScrimmage = FIELD_X + 50;
        this.setupPlay();
      }
    }

    if (carrier && this.playActive) {
      for (const d of this.players) {
        if (d.offense) continue;
        if (dist(carrier, d) < 7) {
          this.lineOfScrimmage = clamp(
            carrier.x,
            FIELD_X + 20,
            FIELD_X + FIELD_W - 40,
          );
          this.down++;
          if (this.down > 4) {
            this.down = 1;
            this.scoreAway++;
            this.lineOfScrimmage = FIELD_X + 50;
          }
          this.setupPlay();
          break;
        }
      }
    }

    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    ctx.fillStyle = FB_COLORS.sidebar;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.fillStyle = FB_COLORS.field;
    ctx.fillRect(FIELD_X, FIELD_Y, FIELD_W, FIELD_H);

    ctx.strokeStyle = FB_COLORS.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(FIELD_X + 1, FIELD_Y + 1, FIELD_W - 2, FIELD_H - 2);

    ctx.lineWidth = 1;
    ctx.fillStyle = FB_COLORS.line;
    for (let i = 1; i <= 5; i++) {
      const x = FIELD_X + (FIELD_W * i) / 6;
      ctx.fillRect(Math.round(x), FIELD_Y, 1, FIELD_H);
    }

    ctx.globalAlpha = 0.7;
    const midY = FIELD_Y + FIELD_H / 2;
    for (let x = FIELD_X + 4; x < FIELD_X + FIELD_W; x += 6) {
      ctx.fillRect(x, midY - 18, 3, 1);
      ctx.fillRect(x, midY + 18, 3, 1);
    }
    ctx.globalAlpha = 1;

    ctx.globalAlpha = 0.5;
    ctx.fillRect(Math.round(this.lineOfScrimmage), FIELD_Y, 1, FIELD_H);
    ctx.globalAlpha = 1;

    for (const p of this.players) {
      if (p.offense) this.drawDiamond(ctx, p.x, p.y);
      else this.drawX(ctx, p.x, p.y);
    }

    ctx.fillStyle = FB_COLORS.line;
    ctx.fillRect(Math.round(this.ballX) - 1, Math.round(this.ballY) - 1, 2, 2);

    for (let i = 0; i < Math.min(9, this.scoreHome); i++) {
      this.drawDiamond(ctx, 14, 20 + i * 12);
    }
    for (let i = 0; i < Math.min(9, this.scoreAway); i++) {
      this.drawX(ctx, GAME_W - 14, 20 + i * 12);
    }
  }

  private setupPlay(): void {
    this.playActive = false;
    this.huddleTimer = 0.7;
    const los = this.lineOfScrimmage;
    const cy = FIELD_Y + FIELD_H / 2;

    this.players = [
      { x: los - 6, y: cy, vx: 0, vy: 0, offense: true, hasBall: true },
      { x: los - 14, y: cy - 16, vx: 0, vy: 0, offense: true, hasBall: false },
      { x: los - 14, y: cy + 16, vx: 0, vy: 0, offense: true, hasBall: false },
      { x: los - 22, y: cy - 28, vx: 0, vy: 0, offense: true, hasBall: false },
      { x: los - 22, y: cy + 28, vx: 0, vy: 0, offense: true, hasBall: false },
      { x: los - 30, y: cy - 8, vx: 0, vy: 0, offense: true, hasBall: false },
      { x: los - 30, y: cy + 8, vx: 0, vy: 0, offense: true, hasBall: false },
      { x: los + 14, y: cy, vx: 0, vy: 0, offense: false, hasBall: false },
      { x: los + 14, y: cy - 14, vx: 0, vy: 0, offense: false, hasBall: false },
      { x: los + 14, y: cy + 14, vx: 0, vy: 0, offense: false, hasBall: false },
      { x: los + 28, y: cy - 24, vx: 0, vy: 0, offense: false, hasBall: false },
      { x: los + 28, y: cy + 24, vx: 0, vy: 0, offense: false, hasBall: false },
      { x: los + 40, y: cy - 8, vx: 0, vy: 0, offense: false, hasBall: false },
      { x: los + 40, y: cy + 8, vx: 0, vy: 0, offense: false, hasBall: false },
    ];
    this.ballX = los - 6;
    this.ballY = cy;
  }

  private nearest(from: Player, offense: boolean): Player | null {
    let best: Player | null = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.offense !== offense || p === from) continue;
      const d = dist(from, p);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = FB_COLORS.player;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 3, y);
    ctx.lineTo(x, y + 4);
    ctx.lineTo(x - 3, y);
    ctx.closePath();
    ctx.fill();
  }

  private drawX(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.strokeStyle = FB_COLORS.player;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 3);
    ctx.lineTo(x + 3, y + 3);
    ctx.moveTo(x + 3, y - 3);
    ctx.lineTo(x - 3, y + 3);
    ctx.stroke();
  }
}
