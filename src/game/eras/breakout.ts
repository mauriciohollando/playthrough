import { clamp } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

export const BRK_COLORS = {
  border: '#a0a0a0',
  paddle: '#4040ff',
  ball: '#ffffff',
  rows: ['#e02020', '#e02020', '#e08020', '#e08020', '#40c040', '#40c040', '#e0e020', '#e0e020'] as const,
};

const BORDER = 8;
const PADDLE_W = 28;
const PADDLE_H = 4;
const PADDLE_Y = GAME_H - 24;
const BALL = 4;
const BRICK_ROWS = 8;
const BRICK_COLS = 14;
const BRICK_W = 20;
const BRICK_H = 6;
const BRICK_TOP = 36;
const BRICK_GAP = 1;

type Brick = { x: number; y: number; w: number; h: number; color: string; alive: boolean };

export class BreakoutEra implements Era {
  readonly id = 'breakout' as const;

  private paddleX = GAME_W / 2 - PADDLE_W / 2;
  private ballX = GAME_W / 2 - BALL / 2;
  private ballY = PADDLE_Y - 12;
  private ballVx = 70;
  private ballVy = -95;
  private bricks: Brick[] = [];
  private lives = 3;
  private launched = false;
  private waveIndex = 0;
  private respawnTimer = 0;

  enter(): void {
    this.lives = 3;
    this.waveIndex = 0;
    this.resetBall(true);
    this.buildBricks();
  }

  snapshot(): {
    paddleX: number;
    ballX: number;
    ballY: number;
    bricks: { x: number; y: number; color: string }[];
  } {
    return {
      paddleX: this.paddleX,
      ballX: this.ballX,
      ballY: this.ballY,
      bricks: this.bricks
        .filter((b) => b.alive)
        .map((b) => ({ x: b.x, y: b.y, color: b.color })),
    };
  }

  update(dt: number, input: InputState): EraResult {
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.resetBall(true);
      return { type: 'continue' };
    }

    const speed = 180;
    if (input.left) this.paddleX -= speed * dt;
    if (input.right) this.paddleX += speed * dt;
    this.paddleX = clamp(this.paddleX, BORDER, GAME_W - BORDER - PADDLE_W);

    if (!this.launched) {
      this.ballX = this.paddleX + PADDLE_W / 2 - BALL / 2;
      this.ballY = PADDLE_Y - BALL - 2;
      if (input.firePressed || input.up) {
        this.launched = true;
        this.ballVx = 70 * (Math.random() < 0.5 ? -1 : 1);
        this.ballVy = -95;
      }
      return { type: 'continue' };
    }

    this.ballX += this.ballVx * dt;
    this.ballY += this.ballVy * dt;

    // Walls
    if (this.ballX <= BORDER) {
      this.ballX = BORDER;
      this.ballVx = Math.abs(this.ballVx);
    } else if (this.ballX + BALL >= GAME_W - BORDER) {
      this.ballX = GAME_W - BORDER - BALL;
      this.ballVx = -Math.abs(this.ballVx);
    }
    if (this.ballY <= BORDER + 12) {
      this.ballY = BORDER + 12;
      this.ballVy = Math.abs(this.ballVy);
    }

    // Paddle
    if (
      this.ballVy > 0 &&
      this.ballY + BALL >= PADDLE_Y &&
      this.ballY <= PADDLE_Y + PADDLE_H &&
      this.ballX + BALL >= this.paddleX &&
      this.ballX <= this.paddleX + PADDLE_W
    ) {
      this.ballY = PADDLE_Y - BALL;
      const hit = (this.ballX + BALL / 2 - (this.paddleX + PADDLE_W / 2)) / (PADDLE_W / 2);
      this.ballVx = hit * 110;
      this.ballVy = -Math.abs(this.ballVy);
      const spd = Math.hypot(this.ballVx, this.ballVy);
      const target = Math.min(160, Math.max(100, spd * 1.02));
      this.ballVx = (this.ballVx / spd) * target;
      this.ballVy = (this.ballVy / spd) * target;
    }

    // Bricks
    for (const b of this.bricks) {
      if (!b.alive) continue;
      if (
        this.ballX < b.x + b.w &&
        this.ballX + BALL > b.x &&
        this.ballY < b.y + b.h &&
        this.ballY + BALL > b.y
      ) {
        b.alive = false;
        const overlapL = this.ballX + BALL - b.x;
        const overlapR = b.x + b.w - this.ballX;
        const overlapT = this.ballY + BALL - b.y;
        const overlapB = b.y + b.h - this.ballY;
        const minX = Math.min(overlapL, overlapR);
        const minY = Math.min(overlapT, overlapB);
        if (minX < minY) this.ballVx *= -1;
        else this.ballVy *= -1;
        break;
      }
    }

    if (this.bricks.every((b) => !b.alive)) {
      if (this.waveIndex === 0) {
        return { type: 'evolve', next: 'lunar', payload: this.snapshot() };
      }
      this.waveIndex++;
      this.buildBricks();
      this.resetBall(true);
    }

    if (this.ballY > GAME_H) {
      this.lives--;
      if (this.lives <= 0) {
        this.lives = 3;
        this.buildBricks();
      }
      this.respawnTimer = 0.6;
      this.launched = false;
    }

    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Borders
    ctx.fillStyle = BRK_COLORS.border;
    ctx.fillRect(0, 0, GAME_W, BORDER);
    ctx.fillRect(0, 0, BORDER, GAME_H);
    ctx.fillRect(GAME_W - BORDER, 0, BORDER, GAME_H);

    // Side color strips matching brick rows
    for (let r = 0; r < BRICK_ROWS; r++) {
      ctx.fillStyle = BRK_COLORS.rows[r];
      const y = BRICK_TOP + r * (BRICK_H + BRICK_GAP);
      ctx.fillRect(2, y, 4, BRICK_H);
      ctx.fillRect(GAME_W - 6, y, 4, BRICK_H);
    }
    ctx.fillStyle = BRK_COLORS.paddle;
    ctx.fillRect(2, PADDLE_Y - 20, 4, 40);
    ctx.fillRect(GAME_W - 6, PADDLE_Y - 20, 4, 40);

    for (const b of this.bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    ctx.fillStyle = BRK_COLORS.paddle;
    ctx.fillRect(Math.round(this.paddleX), PADDLE_Y, PADDLE_W, PADDLE_H);

    ctx.fillStyle = BRK_COLORS.ball;
    ctx.fillRect(Math.round(this.ballX), Math.round(this.ballY), BALL, BALL);

    // Lives as small paddles
    for (let i = 0; i < Math.max(0, this.lives - 1); i++) {
      ctx.fillStyle = BRK_COLORS.paddle;
      ctx.fillRect(BORDER + 8 + i * 16, GAME_H - 10, 12, 3);
    }
  }

  private buildBricks(): void {
    this.bricks = [];
    const totalW = BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP;
    const startX = Math.floor((GAME_W - totalW) / 2);
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        this.bricks.push({
          x: startX + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: BRICK_W,
          h: BRICK_H,
          color: BRK_COLORS.rows[r],
          alive: true,
        });
      }
    }
  }

  private resetBall(onPaddle: boolean): void {
    this.launched = !onPaddle;
    this.paddleX = GAME_W / 2 - PADDLE_W / 2;
    this.ballX = this.paddleX + PADDLE_W / 2 - BALL / 2;
    this.ballY = PADDLE_Y - BALL - 2;
    this.ballVx = 70;
    this.ballVy = -95;
  }
}
