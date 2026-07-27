import './style.css';
import { GameEngine } from './game/engine';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('canvas missing');

const game = new GameEngine(canvas);
game.start();
