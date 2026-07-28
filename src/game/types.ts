export const GAME_W = 320;
export const GAME_H = 240;

export type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
  firePressed: boolean;
};

export type EraId =
  | 'pong'
  | 'combat'
  | 'invaders'
  | 'asteroids'
  | 'pacman'
  | 'breakout'
  | 'lunar'
  | 'galaxian'
  | 'football';

export type EraResult =
  | { type: 'continue' }
  | { type: 'evolve'; next: EraId; payload?: unknown };

export interface Era {
  readonly id: EraId;
  enter(payload?: unknown): void;
  update(dt: number, input: InputState): EraResult;
  draw(ctx: CanvasRenderingContext2D, alpha: number): void;
}
