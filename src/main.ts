import './style.css';
import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

const game = new Game(canvas, uiRoot);
game.boot();

// Dev-only debug hook for automated playtesting.
if (import.meta.env.DEV) {
  (window as unknown as { __lf: Game }).__lf = game;
}
