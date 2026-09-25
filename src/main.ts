import './style.css';
import { loadAssets } from './assets/manifest';
import { Game } from './game/Game';
import { Online } from './online/Online';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas, await loadAssets());

if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;

const online = new Online();
game.onRunStart = () => online.runStarted();
game.onRunEnd = (stats) => void online.runEnded(stats);
void online.init();

const start = document.getElementById('start-btn') as HTMLButtonElement;
start.disabled = false;
start.textContent = 'Start';
