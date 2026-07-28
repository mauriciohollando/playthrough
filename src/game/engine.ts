import { setupCanvas } from './canvas';
import { AsteroidsEra } from './eras/asteroids';
import {
  AsteroidsToPacManTransition,
  type AsteroidsSnapshot,
} from './eras/asteroidsToPacman';
import { BreakoutEra } from './eras/breakout';
import {
  BreakoutToLunarTransition,
  type BreakoutSnapshot,
} from './eras/breakoutToLunar';
import { CombatEra } from './eras/combat';
import {
  CombatToInvadersTransition,
  type CombatSnapshot,
} from './eras/combatToInvaders';
import { GalaxianEra, type GalaxianSnapshot } from './eras/galaxian';
import {
  GalaxianToFootballTransition,
} from './eras/galaxianToFootball';
import { FootballEra } from './eras/football';
import {
  FootballToWarriorTransition,
  type FootballSnapshot,
} from './eras/footballToWarrior';
import { InvadersEra } from './eras/invaders';
import {
  InvadersToAsteroidsTransition,
  type InvadersSnapshot,
} from './eras/invadersToAsteroids';
import { LunarLanderEra } from './eras/lunar';
import {
  LunarToGalaxianTransition,
  type LunarSnapshot,
} from './eras/lunarToGalaxian';
import { PacManEra } from './eras/pacman';
import {
  PacManToBreakoutTransition,
  type PacManSnapshot,
} from './eras/pacmanToBreakout';
import { PongEra, type PongSnapshot } from './eras/pong';
import { RallyXEra } from './eras/rallyx';
import { TransitionEra } from './eras/transition';
import { WarriorEra } from './eras/warrior';
import {
  WarriorToRallyXTransition,
  type WarriorSnapshot,
} from './eras/warriorToRallyx';
import { initInput, pollInput } from './input';
import type { Era, EraId } from './types';

/** Playable eras in evolution order (transitions skipped for debug jumps). */
const ERA_ORDER: EraId[] = [
  'pong',
  'combat',
  'invaders',
  'asteroids',
  'pacman',
  'breakout',
  'lunar',
  'galaxian',
  'football',
  'warrior',
  'rallyx',
];

export class GameEngine {
  private era: Era;
  private ctx: CanvasRenderingContext2D;
  private last = 0;
  private running = false;
  private debugIndex = 0;

  constructor(canvas: HTMLCanvasElement) {
    const { ctx } = setupCanvas(canvas);
    this.ctx = ctx;
    this.era = new PongEra();
    this.era.enter();
    initInput();
    this.initDebugKeys();
  }

  start(): void {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private initDebugKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.code === 'Digit0' || e.key === '0') {
        e.preventDefault();
        this.debugSkip(1);
      } else if (e.code === 'Digit9' || e.key === '9') {
        e.preventDefault();
        this.debugSkip(-1);
      }
    });
  }

  private debugSkip(delta: number): void {
    const len = ERA_ORDER.length;
    this.debugIndex = (this.debugIndex + delta + len) % len;
    this.jumpToEra(ERA_ORDER[this.debugIndex]);
  }

  private jumpToEra(id: EraId): void {
    switch (id) {
      case 'pong':
        this.era = new PongEra();
        break;
      case 'combat':
        this.era = new CombatEra();
        break;
      case 'invaders':
        this.era = new InvadersEra();
        break;
      case 'asteroids':
        this.era = new AsteroidsEra();
        break;
      case 'pacman':
        this.era = new PacManEra();
        break;
      case 'breakout':
        this.era = new BreakoutEra();
        break;
      case 'lunar':
        this.era = new LunarLanderEra();
        break;
      case 'galaxian':
        this.era = new GalaxianEra();
        break;
      case 'football':
        this.era = new FootballEra();
        break;
      case 'warrior':
        this.era = new WarriorEra();
        break;
      case 'rallyx':
        this.era = new RallyXEra();
        break;
    }
    this.era.enter();
    this.debugIndex = ERA_ORDER.indexOf(id);
  }

  private syncDebugIndex(id: EraId): void {
    const i = ERA_ORDER.indexOf(id);
    if (i >= 0) this.debugIndex = i;
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
      this.syncDebugIndex('combat');
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
      this.syncDebugIndex('invaders');
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
      this.syncDebugIndex('asteroids');
      return;
    }
    if (next === 'pacman' && this.era instanceof AsteroidsEra) {
      const snap = (payload as AsteroidsSnapshot) ?? this.era.snapshot();
      this.era = new AsteroidsToPacManTransition(snap);
      this.era.enter();
      return;
    }
    if (next === 'pacman') {
      this.era = new PacManEra();
      this.era.enter();
      this.syncDebugIndex('pacman');
      return;
    }
    if (next === 'breakout' && this.era instanceof PacManEra) {
      const snap = (payload as PacManSnapshot) ?? this.era.snapshot();
      this.era = new PacManToBreakoutTransition(snap);
      this.era.enter();
      return;
    }
    if (next === 'breakout') {
      this.era = new BreakoutEra();
      this.era.enter();
      this.syncDebugIndex('breakout');
      return;
    }
    if (next === 'lunar' && this.era instanceof BreakoutEra) {
      const snap = (payload as BreakoutSnapshot) ?? this.era.snapshot();
      this.era = new BreakoutToLunarTransition(snap);
      this.era.enter();
      return;
    }
    if (next === 'lunar') {
      this.era = new LunarLanderEra();
      this.era.enter();
      this.syncDebugIndex('lunar');
      return;
    }
    if (next === 'galaxian' && this.era instanceof LunarLanderEra) {
      const snap = (payload as LunarSnapshot) ?? this.era.snapshot();
      this.era = new LunarToGalaxianTransition(snap);
      this.era.enter();
      return;
    }
    if (next === 'galaxian') {
      this.era = new GalaxianEra();
      this.era.enter();
      this.syncDebugIndex('galaxian');
      return;
    }
    if (next === 'football' && this.era instanceof GalaxianEra) {
      const snap = (payload as GalaxianSnapshot) ?? this.era.snapshot();
      this.era = new GalaxianToFootballTransition(snap);
      this.era.enter();
      return;
    }
    if (next === 'football') {
      this.era = new FootballEra();
      this.era.enter();
      this.syncDebugIndex('football');
      return;
    }
    if (next === 'warrior' && this.era instanceof FootballEra) {
      const snap = (payload as FootballSnapshot) ?? this.era.snapshot();
      this.era = new FootballToWarriorTransition(snap);
      this.era.enter();
      return;
    }
    if (next === 'warrior') {
      this.era = new WarriorEra();
      this.era.enter();
      this.syncDebugIndex('warrior');
      return;
    }
    if (next === 'rallyx' && this.era instanceof WarriorEra) {
      const snap = (payload as WarriorSnapshot) ?? this.era.snapshot();
      this.era = new WarriorToRallyXTransition(snap);
      this.era.enter();
      return;
    }
    if (next === 'rallyx') {
      this.era = new RallyXEra();
      this.era.enter();
      this.syncDebugIndex('rallyx');
      return;
    }
  }
}
