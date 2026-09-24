import { PERKS, type PerkId, type PerkStacks } from './perks';
import type { WeaponDef } from './weapons';

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
  private readonly weaponName = $('hud-weapon');
  private readonly offer = $('offer');
  private readonly offerName = $('offer-name');
  private readonly offerBlurb = $('offer-blurb');
  private readonly offerCurrent = $('offer-current');
  private readonly offerBar = $('offer-timer-bar');
  readonly offerTake = $('offer-take');
  readonly offerKeep = $('offer-keep');
  readonly offerPreview = $('offer-preview') as HTMLCanvasElement;
  private readonly perks = $('perks');
  private readonly perkCards = $('perk-cards');
  private readonly perkBar = $('perk-timer-bar');
  private readonly perkList = $('hud-perks');
  /** Called with the card index when a perk card is clicked. */
  onPerkPicked: (index: number) => void = () => {};
  private readonly level = $('level');
  private readonly levelNumber = $('level-number');
  private readonly levelName = $('level-name');
  private pips: HTMLElement[] = [];
  private counter?: HTMLElement;
  private magazine = 0;

  /** Rebuilds the ammo readout for a weapon: pips for small magazines, a counter otherwise. */
  setWeapon(weapon: WeaponDef): void {
    this.weaponName.textContent = weapon.name;
    this.magazine = weapon.magazine;
    this.ammo.replaceChildren();
    this.pips = [];
    this.counter = undefined;
    if (weapon.magazine <= 8) {
      for (let i = 0; i < weapon.magazine; i++) {
        const pip = document.createElement('span');
        pip.className = weapon.id === 'shotgun' ? 'pip shell' : 'pip';
        this.ammo.appendChild(pip);
        this.pips.push(pip);
      }
    } else {
      this.counter = document.createElement('span');
      this.counter.className = 'ammo-count';
      this.ammo.appendChild(this.counter);
    }
  }

  showOffer(found: WeaponDef, current: WeaponDef): void {
    this.offerName.textContent = found.name;
    this.offerBlurb.textContent = found.blurb;
    this.offerCurrent.textContent = current.name;
    this.offer.hidden = false;
    this.crosshair.hidden = true;
  }

  /** `left` is 1 when the offer appears and 0 when it lapses. */
  updateOffer(left: number): void {
    this.offerBar.style.width = `${Math.round(left * 100)}%`;
  }

  /** Shows the perk cards, numbered 1..n for the keyboard. */
  showPerks(choices: readonly PerkId[], stacks: PerkStacks): void {
    this.perkCards.replaceChildren(
      ...choices.map((id, i) => {
        const perk = PERKS[id];
        const have = stacks[id] ?? 0;
        const card = document.createElement('button');
        card.innerHTML = `<b></b><span class="blurb"></span><span class="stack"></span><kbd>${i + 1}</kbd>`;
        card.querySelector('b')!.textContent = perk.name;
        card.querySelector('.blurb')!.textContent = perk.blurb;
        card.querySelector('.stack')!.textContent = have > 0 ? `${have + 1} / ${perk.maxStacks}` : perk.maxStacks > 1 ? `max ${perk.maxStacks}` : '';
        card.addEventListener('click', () => this.onPerkPicked(i));
        return card;
      }),
    );
    this.perkBar.style.width = '100%';
    this.perks.hidden = false;
    this.crosshair.hidden = true;
  }

  /** `left` is 1 when the cards appear and 0 when the choice lapses. */
  updatePerks(left: number): void {
    this.perkBar.style.width = `${Math.round(left * 100)}%`;
  }

  hidePerks(): void {
    this.perks.hidden = true;
    this.crosshair.hidden = false;
  }

  /** Lists the perks taken this run under the distance ("Quick Hands ×2"). */
  setPerkList(stacks: PerkStacks): void {
    this.perkList.replaceChildren(
      ...(Object.entries(stacks) as [PerkId, number][])
        .filter(([, n]) => n > 0)
        .map(([id, n]) => {
          const row = document.createElement('span');
          row.textContent = n > 1 ? `${PERKS[id].name} ×${n}` : PERKS[id].name;
          return row;
        }),
    );
  }

  /** Flashes the level banner ("LEVEL 3 · The crucified"); it fades out by itself. */
  showLevel(n: number, name: string): void {
    this.levelNumber.textContent = `Level ${n}`;
    this.levelName.textContent = name;
    this.level.hidden = false;
    this.level.classList.remove('show');
    void this.level.offsetWidth; // restart CSS animation
    this.level.classList.add('show');
  }

  hideOffer(): void {
    this.offer.hidden = true;
    this.crosshair.hidden = false;
  }

  show(screen: Screen | null): void {
    for (const [name, el] of Object.entries(this.screens)) el.hidden = name !== screen;
    document.body.classList.toggle('playing', screen === null);
  }

  update(stats: RunStats, ammo: number, reloadProgress: number | null): void {
    this.distance.textContent = `${Math.floor(stats.distance)} m`;
    this.kills.textContent = `${stats.kills}`;
    this.pips.forEach((pip, i) => pip.classList.toggle('spent', i >= ammo));
    if (this.counter) this.counter.textContent = `${ammo} / ${this.magazine}`;
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
    this.hideOffer();
    this.hidePerks();
    this.level.hidden = true;
    this.overStats.innerHTML = `
      <div><b>${Math.floor(stats.distance)} m</b><span>distance</span></div>
      <div><b>${stats.kills}</b><span>kills</span></div>
      <div><b>${stats.headshots}</b><span>headshots</span></div>`;
    this.damage.classList.add('on');
    this.show('over');
  }

  /** A short red flash at the edges (Second Wind shoving off a grab). */
  flashDamage(): void {
    this.damage.classList.add('on');
    setTimeout(() => this.damage.classList.remove('on'), 350);
  }

  clearDamage(): void {
    this.damage.classList.remove('on');
  }
}
