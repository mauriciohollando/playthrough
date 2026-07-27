import { clamp } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

const PADDLE_W = 4;
const PADDLE_H = 28;
const BALL = 4;
const PADDLE_X_L = 16;
const PADDLE_X_R = GAME_W - 20;
const WALL = 4;
const SPEED_PADDLE = 140;
const BALL_SPEED = 110;

export type PongSnapshot = {
  leftY: number;
  rightY: number;
  ballX: number;
  ballY: number;
  ballVx: number;
  ballVy: number;
};

export class PongEra implements Era {
  readonly id = 'pong' as const;

  leftY = GAME_H / 2 - PADDLE_H / 2;
  rightY = GAME_H / 2 - PADDLE_H / 2;
  ballX = GAME_W / 2 - BALL / 2;
  ballY = GAME_H / 2 - BALL / 2;
  ballVx = BALL_SPEED;
  ballVy = BALL_SPEED * 0.6;
  private aiError = 0;
  private aiMistakeTimer = 0;
  private aiIdle = false;

  enter(): void {
    this.resetBall(true);
    this.leftY = GAME_H / 2 - PADDLE_H / 2;
    this.rightY = GAME_H / 2 - PADDLE_H / 2;
    this.aiError = 0;
    this.aiMistakeTimer = 0.6;
    this.aiIdle = false;
  }

  snapshot(): PongSnapshot {
    return {
      leftY: this.leftY,
      rightY: this.rightY,
      ballX: this.ballX,
      ballY: this.ballY,
      ballVx: this.ballVx,
      ballVy: this.ballVy,
    };
  }

  update(dt: number, input: InputState): EraResult {
    if (input.up) this.leftY -= SPEED_PADDLE * dt;
    if (input.down) this.leftY += SPEED_PADDLE * dt;
    this.leftY = clamp(this.leftY, WALL, GAME_H - WALL - PADDLE_H);

    // AI right paddle — slower, with occasional mistakes
    this.aiMistakeTimer -= dt;
    if (this.aiMistakeTimer <= 0) {
      this.aiMistakeTimer = 0.45 + Math.random() * 1.1;
      this.aiError = (Math.random() - 0.5) * PADDLE_H * 1.6;
      this.aiIdle = Math.random() < 0.28;
    }

    if (!this.aiIdle) {
      const target = this.ballY + BALL / 2 - PADDLE_H / 2 + this.aiError;
      const aiSpeed = SPEED_PADDLE * 0.38;
      const center = this.rightY + PADDLE_H / 2;
      if (center < target - 6) this.rightY += aiSpeed * dt;
      else if (center > target + 6) this.rightY -= aiSpeed * dt;
    }
    this.rightY = clamp(this.rightY, WALL, GAME_H - WALL - PADDLE_H);

    this.ballX += this.ballVx * dt;
    this.ballY += this.ballVy * dt;

    // Top / bottom walls
    if (this.ballY <= WALL) {
      this.ballY = WALL;
      this.ballVy = Math.abs(this.ballVy);
    } else if (this.ballY + BALL >= GAME_H - WALL) {
      this.ballY = GAME_H - WALL - BALL;
      this.ballVy = -Math.abs(this.ballVy);
    }

    // Left paddle
    if (
      this.ballVx < 0 &&
      this.ballX <= PADDLE_X_L + PADDLE_W &&
      this.ballX + BALL >= PADDLE_X_L &&
      this.ballY + BALL >= this.leftY &&
      this.ballY <= this.leftY + PADDLE_H
    ) {
      this.ballX = PADDLE_X_L + PADDLE_W;
      const hit = (this.ballY + BALL / 2 - (this.leftY + PADDLE_H / 2)) / (PADDLE_H / 2);
      this.ballVx = Math.abs(this.ballVx) * 1.05;
      this.ballVy = hit * BALL_SPEED * 1.1;
      this.capBall();
    }

    // Right paddle
    if (
      this.ballVx > 0 &&
      this.ballX + BALL >= PADDLE_X_R &&
      this.ballX <= PADDLE_X_R + PADDLE_W &&
      this.ballY + BALL >= this.rightY &&
      this.ballY <= this.rightY + PADDLE_H
    ) {
      this.ballX = PADDLE_X_R - BALL;
      const hit = (this.ballY + BALL / 2 - (this.rightY + PADDLE_H / 2)) / (PADDLE_H / 2);
      this.ballVx = -Math.abs(this.ballVx) * 1.05;
      this.ballVy = hit * BALL_SPEED * 1.1;
      this.capBall();
    }

    // Player scores (ball past right)
    if (this.ballX > GAME_W) {
      return { type: 'evolve', next: 'combat', payload: this.snapshot() };
    }

    // AI scores — reset serve
    if (this.ballX + BALL < 0) {
      this.resetBall(true);
    }

    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.fillStyle = '#ffffff';
    // Walls
    ctx.fillRect(0, 0, GAME_W, WALL);
    ctx.fillRect(0, GAME_H - WALL, GAME_W, WALL);

    // Center dashed line
    const dash = 4;
    const gap = 4;
    const cx = Math.floor(GAME_W / 2) - 1;
    for (let y = WALL + 2; y < GAME_H - WALL; y += dash + gap) {
      ctx.fillRect(cx, y, 2, dash);
    }

    // Paddles
    ctx.fillRect(PADDLE_X_L, Math.round(this.leftY), PADDLE_W, PADDLE_H);
    ctx.fillRect(PADDLE_X_R, Math.round(this.rightY), PADDLE_W, PADDLE_H);

    // Ball
    ctx.fillRect(Math.round(this.ballX), Math.round(this.ballY), BALL, BALL);
  }

  private capBall(): void {
    const max = BALL_SPEED * 1.8;
    const speed = Math.hypot(this.ballVx, this.ballVy);
    if (speed > max) {
      this.ballVx = (this.ballVx / speed) * max;
      this.ballVy = (this.ballVy / speed) * max;
    }
    if (Math.abs(this.ballVx) < BALL_SPEED * 0.7) {
      this.ballVx = Math.sign(this.ballVx || 1) * BALL_SPEED * 0.7;
    }
  }

  private resetBall(toRight: boolean): void {
    this.ballX = GAME_W / 2 - BALL / 2;
    this.ballY = GAME_H / 2 - BALL / 2;
    const angle = (Math.random() * 0.6 - 0.3) * Math.PI;
    const dir = toRight ? 1 : -1;
    this.ballVx = Math.cos(angle) * BALL_SPEED * dir;
    this.ballVy = Math.sin(angle) * BALL_SPEED;
  }
}

export const PONG_LAYOUT = {
  PADDLE_W,
  PADDLE_H,
  BALL,
  PADDLE_X_L,
  PADDLE_X_R,
  WALL,
};
