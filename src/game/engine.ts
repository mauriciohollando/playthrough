import { setupCanvas } from './canvas';
import { AsteroidsEra } from './eras/asteroids';
import { CombatEra } from './eras/combat';
import {
  CombatToInvadersTransition,
  type CombatSnapshot,
} from './eras/combatToInvaders';
import { InvadersEra } from './eras/invaders';
import {
  InvadersToAsteroidsTransition,
  type InvadersSnapshot,
} from './eras/invadersToAsteroids';
import { PongEra, type PongSnapshot } from './eras/pong';
import { TransitionEra } from './eras/transition';
import { initInput, pollInput } from './input';
import type { Era, EraId } from './types';

export class GameEngine {
  private era: Era;
  private ctx: CanvasRenderingContext2D;
  private last = 0;
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    const { ctx } = setupCanvas(canvas);
    this.ctx = ctx;
    this.era = new PongEra();
    this.era.enter();
    initInput();
  }

  start(): void {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 1 / 20);

    const input = pollInput();
    const result = this.era.update(dt, input);

    if (result.type === 'evolve') {
      this.evolve(result.next, result.payload);
    }

    this.era.draw(this.ctx, 1);
    requestAnimationFrame(this.frame);
  };

  private evolve(next: EraId, payload?: unknown): void {
    if (next === 'combat' && this.era instanceof PongEra) {
      const snap = (payload as PongSnapshot) ?? this.era.snapshot();
      this.era = new TransitionEra(snap);
      this.era.enter();
      return;
    }
    if (next === 'combat') {
      this.era = new CombatEra();
      this.era.enter();
      return;
    }
    if (next === 'invaders' && this.era instanceof CombatEra) {
      const snap = (payload as CombatSnapshot) ?? this.era.snapshot();
      this.era = new CombatToInvadersTransition(snap);
      this.era.enter();
      return;
    }
    if (next === 'invaders') {
      this.era = new InvadersEra();
      this.era.enter(payload);
      return;
    }
    if (next === 'asteroids' && this.era instanceof InvadersEra) {
      const snap = (payload as InvadersSnapshot) ?? this.era.snapshot();
      this.era = new InvadersToAsteroidsTransition(snap);
      this.era.enter();
      return;
    }
    if (next === 'asteroids') {
      this.era = new AsteroidsEra();
      this.era.enter(payload);
      return;
    }
  }
}
