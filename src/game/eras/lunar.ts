import { clamp, lerp } from '../math';
import { GAME_H, GAME_W, type Era, type EraResult, type InputState } from '../types';

export const LUNAR_COLOR = '#ffffff';

type Pt = { x: number; y: number };

export class LunarLanderEra implements Era {
  readonly id = 'lunar' as const;

  private x = GAME_W * 0.35;
  private y = 40;
  private vx = 12;
  private vy = 0;
  private angle = 0;
  private fuel = 700;
  private terrain: Pt[] = [];
  private pads: { x1: number; x2: number; y: number }[] = [];
  private stars: Pt[] = [];
  private thrusting = false;
  private status: 'flying' | 'landed' | 'crashed' = 'flying';
  private statusTimer = 0;

  enter(): void {
    this.buildTerrain();
    this.resetLander();
    this.stars = Array.from({ length: 40 }, () => ({
      x: Math.random() * GAME_W,
      y: Math.random() * (GAME_H * 0.55),
    }));
  }

  update(dt: number, input: InputState): EraResult {
    if (this.status !== 'flying') {
      this.statusTimer -= dt;
      if (this.statusTimer <= 0) {
        if (this.status === 'landed') {
          // Soft loop — stay on moon / relaunch for more landings
          this.resetLander();
        } else {
          this.resetLander();
        }
      }
      return { type: 'continue' };
    }

    const rot = 2.2;
    if (input.left) this.angle -= rot * dt;
    if (input.right) this.angle += rot * dt;
    this.angle = clamp(this.angle, -Math.PI * 0.55, Math.PI * 0.55);

    this.thrusting = false;
    if (input.up && this.fuel > 0) {
      this.thrusting = true;
      this.fuel = Math.max(0, this.fuel - 28 * dt);
      this.vx += Math.sin(this.angle) * 55 * dt;
      this.vy -= Math.cos(this.angle) * 70 * dt;
    }

    // Gravity
    this.vy += 22 * dt;
    this.vx *= 0.999;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.x < 4) {
      this.x = 4;
      this.vx = Math.abs(this.vx) * 0.3;
    }
    if (this.x > GAME_W - 4) {
      this.x = GAME_W - 4;
      this.vx = -Math.abs(this.vx) * 0.3;
    }

    const ground = this.groundAt(this.x);
    if (this.y + 6 >= ground) {
      this.y = ground - 6;
      this.resolveLanding(ground);
    }

    return { type: 'continue' };
  }

  draw(ctx: CanvasRenderingContext2D, _alpha: number): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.fillStyle = LUNAR_COLOR;
    for (const s of this.stars) {
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }

    // Terrain
    ctx.strokeStyle = LUNAR_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.terrain[0].x, this.terrain[0].y);
    for (let i = 1; i < this.terrain.length; i++) {
      ctx.lineTo(this.terrain[i].x, this.terrain[i].y);
    }
    ctx.stroke();

    // Pad markers (no text — short flat ticks)
    for (const p of this.pads) {
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y + 3);
      ctx.lineTo(p.x1, p.y + 8);
      ctx.moveTo(p.x2, p.y + 3);
      ctx.lineTo(p.x2, p.y + 8);
      ctx.stroke();
    }

    // Fuel bar (no labels)
    const fuelW = 60;
    ctx.strokeRect(8, 8, fuelW, 5);
    ctx.fillRect(8, 8, (this.fuel / 700) * fuelW, 5);

    // Lander
    this.drawLander(ctx, this.x, this.y, this.angle, this.thrusting);

    if (this.status === 'crashed') {
      // Debris X
      ctx.beginPath();
      ctx.moveTo(this.x - 5, this.y - 5);
      ctx.lineTo(this.x + 5, this.y + 5);
      ctx.moveTo(this.x + 5, this.y - 5);
      ctx.lineTo(this.x - 5, this.y + 5);
      ctx.stroke();
    }
  }

  private resetLander(): void {
    this.x = 40 + Math.random() * 60;
    this.y = 30;
    this.vx = 8 + Math.random() * 10;
    this.vy = 5;
    this.angle = 0;
    this.fuel = 700;
    this.status = 'flying';
    this.statusTimer = 0;
    this.thrusting = false;
  }

  private buildTerrain(): void {
    this.terrain = [];
    this.pads = [];
    const pts: Pt[] = [];
    let x = 0;
    let y = GAME_H - 50;
    pts.push({ x: 0, y: GAME_H - 40 });

    const padSpecs = [
      { at: 90, w: 36 },
      { at: 210, w: 40 },
    ];

    while (x < GAME_W) {
      const pad = padSpecs.find((p) => x >= p.at && x < p.at + p.w);
      if (pad && x === pad.at) {
        const padY = GAME_H - 55 - Math.random() * 10;
        pts.push({ x: pad.at, y: padY });
        pts.push({ x: pad.at + pad.w, y: padY });
        this.pads.push({ x1: pad.at, x2: pad.at + pad.w, y: padY });
        x = pad.at + pad.w;
        y = padY;
      } else {
        x += 8 + Math.random() * 14;
        y = clamp(y + (Math.random() - 0.5) * 28, GAME_H - 100, GAME_H - 28);
        // Don't overwrite pad zones
        const inPad = padSpecs.some((p) => x > p.at && x < p.at + p.w);
        if (!inPad) pts.push({ x: Math.min(x, GAME_W), y });
        if (x >= GAME_W) break;
      }
    }
    pts.push({ x: GAME_W, y: GAME_H - 35 });
    this.terrain = pts;
  }

  private groundAt(x: number): number {
    for (let i = 0; i < this.terrain.length - 1; i++) {
      const a = this.terrain[i];
      const b = this.terrain[i + 1];
      if (x >= a.x && x <= b.x) {
        const t = (x - a.x) / Math.max(0.001, b.x - a.x);
        return lerp(a.y, b.y, t);
      }
    }
    return GAME_H - 30;
  }

  private resolveLanding(groundY: number): void {
    const onPad = this.pads.some((p) => this.x >= p.x1 + 2 && this.x <= p.x2 - 2 && Math.abs(groundY - p.y) < 2);
    const soft =
      Math.abs(this.vy) < 28 &&
      Math.abs(this.vx) < 22 &&
      Math.abs(this.angle) < 0.35;

    this.vx = 0;
    this.vy = 0;

    if (onPad && soft) {
      this.status = 'landed';
      this.angle = 0;
      this.statusTimer = 2.2;
    } else {
      this.status = 'crashed';
      this.statusTimer = 1.6;
    }
  }

  private drawLander(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    thrust: boolean,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = LUNAR_COLOR;
    ctx.lineWidth = 1;
    // Capsule
    ctx.strokeRect(-4, -6, 8, 8);
    // Legs
    ctx.beginPath();
    ctx.moveTo(-4, 2);
    ctx.lineTo(-8, 8);
    ctx.moveTo(4, 2);
    ctx.lineTo(8, 8);
    ctx.moveTo(-3, 2);
    ctx.lineTo(3, 2);
    ctx.stroke();
    if (thrust) {
      ctx.beginPath();
      ctx.moveTo(-2, 2);
      ctx.lineTo(0, 9 + Math.random() * 3);
      ctx.lineTo(2, 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
