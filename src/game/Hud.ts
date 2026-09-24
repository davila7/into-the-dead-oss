import { CONFIG } from './config';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

export type Screen = 'menu' | 'paused' | 'over';

export interface RunStats {
  distance: number;
  kills: number;
  headshots: number;
}

/** DOM overlay: stats, ammo, crosshair and menu screens. */
export class Hud {
  readonly startButton = $('start-btn');
  readonly retryButton = $('retry-btn');
  readonly steerLeft = $('steer-left');
  readonly steerRight = $('steer-right');
  private readonly distance = $('hud-distance');
  private readonly kills = $('hud-kills');
  private readonly ammo = $('hud-ammo');
  private readonly reload = $('hud-reload');
  private readonly reloadBar = $('hud-reload-bar');
  private readonly crosshair = $('crosshair');
  private readonly damage = $('damage');
  private readonly screens: Record<Screen, HTMLElement> = {
    menu: $('screen-menu'),
    paused: $('screen-paused'),
    over: $('screen-over'),
  };
  private readonly overStats = $('over-stats');
  private readonly pips: HTMLElement[] = [];

  constructor() {
    for (let i = 0; i < CONFIG.gun.magazine; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip';
      this.ammo.appendChild(pip);
      this.pips.push(pip);
    }
  }

  show(screen: Screen | null): void {
    for (const [name, el] of Object.entries(this.screens)) el.hidden = name !== screen;
    document.body.classList.toggle('playing', screen === null);
  }

  update(stats: RunStats, ammo: number, reloadProgress: number | null): void {
    this.distance.textContent = `${Math.floor(stats.distance)} m`;
    this.kills.textContent = `${stats.kills}`;
    this.pips.forEach((pip, i) => pip.classList.toggle('spent', i >= ammo));
    this.reload.hidden = reloadProgress === null;
    if (reloadProgress !== null) this.reloadBar.style.width = `${Math.round(reloadProgress * 100)}%`;
  }

  moveCrosshair(ndcX: number, ndcY: number): void {
    this.crosshair.style.left = `${((ndcX + 1) / 2) * 100}%`;
    this.crosshair.style.top = `${((1 - ndcY) / 2) * 100}%`;
  }

  pulseCrosshair(hit: boolean): void {
    this.crosshair.classList.remove('fire', 'hit');
    void this.crosshair.offsetWidth; // restart CSS animation
    this.crosshair.classList.add(hit ? 'hit' : 'fire');
  }

  gameOver(stats: RunStats): void {
    this.overStats.innerHTML = `
      <div><b>${Math.floor(stats.distance)} m</b><span>distance</span></div>
      <div><b>${stats.kills}</b><span>kills</span></div>
      <div><b>${stats.headshots}</b><span>headshots</span></div>`;
    this.damage.classList.add('on');
    this.show('over');
  }

  clearDamage(): void {
    this.damage.classList.remove('on');
  }
}
