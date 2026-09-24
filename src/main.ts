import './style.css';
import { loadTextures } from './assets/manifest';
import { Game } from './game/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas, await loadTextures());

if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
