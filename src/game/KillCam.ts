import { CONFIG } from './config';
import { clamp } from './logic';

/** Share of the kill cam spent easing in and easing out; the rest holds at full strength. */
const EASE_IN = 0.15;
const EASE_OUT = 0.4;

/**
 * Slow motion and zoom on critical (headshot) or chained kills. Runs on real time, so the
 * beat lasts `duration` seconds on screen however slow the world is going.
 */
export class KillCam {
  private clock = 0;
  private left = 0;
  private nextAllowed = 0;
  private lastKill = -Infinity;
  private chain = 0;

  /** Registers a kill; returns true when it starts a kill cam. */
  kill(headshot: boolean): boolean {
    const cfg = CONFIG.killCam;
    this.chain = this.clock - this.lastKill <= cfg.chainWindow ? this.chain + 1 : 1;
    this.lastKill = this.clock;
    if (!headshot && this.chain < cfg.chainKills) return false;
    if (this.left > 0 || this.clock < this.nextAllowed) return false;
    this.chain = 0;
    this.left = cfg.duration;
    this.nextAllowed = this.clock + cfg.cooldown;
    return true;
  }

  update(realDt: number): void {
    this.clock += realDt;
    this.left = Math.max(0, this.left - realDt);
  }

  /** Stops a kill cam in progress (e.g. when the weapon offer takes over). */
  cancel(): void {
    this.left = 0;
  }

  reset(): void {
    this.clock = this.left = this.nextAllowed = this.chain = 0;
    this.lastKill = -Infinity;
  }

  /** 0..1, how strong the effect is right now. */
  get weight(): number {
    if (this.left <= 0) return 0;
    const t = 1 - this.left / CONFIG.killCam.duration;
    const w = t < EASE_IN ? t / EASE_IN : t > 1 - EASE_OUT ? (1 - t) / EASE_OUT : 1;
    const c = clamp(w, 0, 1);
    return c * c * (3 - 2 * c);
  }

  /** Multiplier for the game's delta time. */
  get timeScale(): number {
    return 1 - (1 - CONFIG.killCam.timeScale) * this.weight;
  }

  /** Fraction the field of view narrows by. */
  get zoom(): number {
    return CONFIG.killCam.zoom * this.weight;
  }
}
