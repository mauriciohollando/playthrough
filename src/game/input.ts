import type { InputState } from './types';

const keys = new Set<string>();
let fireWasDown = false;

const UP = new Set(['ArrowUp', 'KeyW', 'w', 'W']);
const DOWN = new Set(['ArrowDown', 'KeyS', 's', 'S']);
const LEFT = new Set(['ArrowLeft', 'KeyA', 'a', 'A']);
const RIGHT = new Set(['ArrowRight', 'KeyD', 'd', 'D']);
const FIRE = new Set(['Space', ' ', 'KeyZ', 'z', 'Z', 'KeyX', 'x', 'X']);

export function initInput(): void {
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    keys.add(e.key);
    if (
      UP.has(e.code) ||
      UP.has(e.key) ||
      DOWN.has(e.code) ||
      DOWN.has(e.key) ||
      LEFT.has(e.code) ||
      LEFT.has(e.key) ||
      RIGHT.has(e.code) ||
      RIGHT.has(e.key) ||
      FIRE.has(e.code) ||
      FIRE.has(e.key)
    ) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    keys.delete(e.key);
  });
  window.addEventListener('blur', () => keys.clear());
}

function anyDown(set: Set<string>): boolean {
  for (const k of set) {
    if (keys.has(k)) return true;
  }
  return false;
}

export function pollInput(): InputState {
  const fire = anyDown(FIRE);
  const firePressed = fire && !fireWasDown;
  fireWasDown = fire;
  return {
    up: anyDown(UP),
    down: anyDown(DOWN),
    left: anyDown(LEFT),
    right: anyDown(RIGHT),
    fire,
    firePressed,
  };
}
