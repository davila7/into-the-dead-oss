import type * as THREE from 'three';
import type { WeaponId } from './weapons';

export type Surface = 'wheat' | 'corn';

/** Most zombie voices allowed at once, so a horde doesn't turn into mush. */
const MAX_VOICES = 5;

/**
 * Synthesized sound effects (Web Audio, no files): weapons, footsteps, corn brushing
 * past, fence vaults and positional zombie groans.
 */
export class Sfx {
  private ctx?: AudioContext;
  private out?: AudioNode;
  private noise?: AudioBuffer;
  private voices = 0;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // Gentle bus compression keeps shotgun blasts and groan pile-ups from clipping.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(comp).connect(ctx.destination);
      this.out = master;
      const l = ctx.listener;
      if (l.forwardX) {
        l.forwardX.value = 0;
        l.forwardY.value = 0;
        l.forwardZ.value = -1;
        l.upX.value = 0;
        l.upY.value = 1;
        l.upZ.value = 0;
      } else {
        l.setOrientation(0, 0, -1, 0, 1, 0);
      }
    }
    void this.ctx.resume();
  }

  /** Keeps positional sounds anchored to the camera. */
  setListener(pos: THREE.Vector3): void {
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
    }
  }

  // --- building blocks -------------------------------------------------------

  private noiseSource(ctx: AudioContext, t: number, duration: number): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    // Random offset so repeated sounds don't share the same grain.
    src.start(t, Math.random() * 1.4, duration + 0.05);
    return src;
  }

  /** Filtered noise with an exponential decay. */
  private burst(
    duration: number,
    freq: number,
    gain: number,
    type: BiquadFilterType = 'lowpass',
    { delay = 0, q = 1, attack = 0.002, dest }: { delay?: number; q?: number; attack?: number; dest?: AudioNode } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.out) return;
    const t = ctx.currentTime + delay;
    const src = this.noiseSource(ctx, t, duration);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(dest ?? this.out);
  }

  /** A short pitched blip, used for low thumps and metal pings. */
  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    gain: number,
    { delay = 0, dest }: { delay?: number; dest?: AudioNode } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(dest ?? this.out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private panner(pos: THREE.Vector3): PannerNode | undefined {
    const ctx = this.ctx;
    if (!ctx || !this.out) return undefined;
    const p = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 4,
      rolloffFactor: 1.3,
      maxDistance: 80,
      positionX: pos.x,
      positionY: 1.6,
      positionZ: pos.z,
    });
    p.connect(this.out);
    return p;
  }

  // --- weapons ---------------------------------------------------------------

  shot(weapon: WeaponId = 'pistol'): void {
    switch (weapon) {
      case 'shotgun':
        this.burst(0.6, 1100, 1.1);
        this.burst(0.12, 4200, 0.5, 'highpass');
        this.tone('sine', 110, 38, 0.35, 0.9);
        // Pump racked after the blast.
        this.burst(0.05, 1800, 0.35, 'bandpass', { delay: 0.32, q: 4 });
        this.burst(0.06, 1200, 0.4, 'bandpass', { delay: 0.45, q: 4 });
        break;
      case 'rifle':
        this.burst(0.9, 2400, 0.9);
        this.burst(0.05, 6500, 0.6, 'highpass');
        this.tone('sine', 90, 45, 0.2, 0.5);
        // Lever cycled.
        this.burst(0.04, 2600, 0.3, 'bandpass', { delay: 0.28, q: 6 });
        this.burst(0.04, 1900, 0.3, 'bandpass', { delay: 0.4, q: 6 });
        break;
      case 'smg':
        this.burst(0.12, 2600, 0.55);
        this.burst(0.04, 5500, 0.3, 'highpass');
        break;
      default:
        this.burst(0.35, 1800, 0.9);
        this.burst(0.08, 5000, 0.4, 'highpass');
    }
  }

  click(): void {
    this.burst(0.04, 3000, 0.3, 'bandpass');
  }

  reload(): void {
    this.click();
    this.burst(0.05, 1500, 0.3, 'bandpass', { delay: 0.18, q: 3 });
  }

  /** Dropping one gun and racking the other. */
  swap(): void {
    this.burst(0.08, 900, 0.35, 'bandpass', { q: 2 }); // old gun thuds into the dirt
    this.tone('sine', 140, 60, 0.12, 0.3);
    this.burst(0.05, 2800, 0.4, 'bandpass', { delay: 0.2, q: 8 });
    this.tone('triangle', 2400, 2100, 0.08, 0.06, { delay: 0.2 });
    this.burst(0.07, 1600, 0.45, 'bandpass', { delay: 0.34, q: 6 });
    this.burst(0.04, 3400, 0.35, 'bandpass', { delay: 0.42, q: 8 });
  }

  /** Soft cue when a weapon is found and the choice pops up. */
  offer(): void {
    this.tone('sine', 660, 640, 0.5, 0.07);
    this.tone('sine', 990, 960, 0.6, 0.05, { delay: 0.08 });
  }

  hit(): void {
    this.burst(0.12, 400, 0.5);
  }

  // --- movement --------------------------------------------------------------

  footstep(surface: Surface): void {
    const v = 0.85 + Math.random() * 0.3;
    // Boot into soft soil.
    this.burst(0.09, 180, 0.4 * v);
    this.tone('sine', 75, 45, 0.07, 0.18 * v);
    if (surface === 'wheat') {
      // Dry stalks crunching underfoot and swishing at the shins.
      this.burst(0.07, 3200, 0.07 * v, 'highpass', { delay: 0.01 });
      this.burst(0.22, 2200, 0.05 * v, 'bandpass', { attack: 0.06, q: 0.7 });
    } else {
      this.rustle(0.8 * v);
    }
  }

  /** Corn leaves dragging across the body; `intensity` ~0..1.5. */
  rustle(intensity = 1): void {
    const dur = 0.25 + Math.random() * 0.25;
    this.burst(dur, 3200 + Math.random() * 1800, 0.14 * intensity, 'bandpass', { attack: 0.05, q: 0.6 });
    this.burst(dur * 0.8, 900 + Math.random() * 400, 0.08 * intensity, 'bandpass', { attack: 0.08, q: 0.8 });
    // Dry leaf crackles on top.
    for (let i = 0; i < 3; i++) {
      this.burst(0.015, 5000, 0.08 * intensity, 'highpass', { delay: Math.random() * dur });
    }
  }

  /** Climbing over a rotten fence: creak, crack, landing. */
  vault(): void {
    this.tone('sawtooth', 210, 120, 0.4, 0.05, { delay: 0.05 });
    this.burst(0.35, 650, 0.12, 'bandpass', { delay: 0.05, q: 9 });
    this.burst(0.07, 1500, 0.55, 'highpass', { delay: 0.32 }); // rail cracks
    this.burst(0.18, 700, 0.3, 'lowpass', { delay: 0.34 });
    this.burst(0.16, 140, 0.8, 'lowpass', { delay: 0.85 }); // landing
    this.tone('sine', 70, 40, 0.14, 0.4, { delay: 0.85 });
    this.burst(0.12, 2600, 0.08, 'highpass', { delay: 0.87 });
  }

  // --- zombies ---------------------------------------------------------------

  /**
   * A groan from a zombie at `pos`: a buzzy glottal source through two vowel formants,
   * with a wobble, breath noise and 3D panning. `snarl` is the harsher lunge version.
   */
  groan(pos: THREE.Vector3, kind: 'idle' | 'snarl' | 'death' = 'idle'): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || this.voices >= MAX_VOICES) return;
    const dest = this.panner(pos);
    if (!dest) return;
    this.voices += 1;

    const snarl = kind === 'snarl';
    const death = kind === 'death';
    const dur = snarl ? 0.5 + Math.random() * 0.3 : death ? 0.6 : 0.9 + Math.random() * 0.9;
    const f0 = snarl ? 120 + Math.random() * 60 : 62 + Math.random() * 45;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * (death ? 1.3 : 1), t);
    osc.frequency.linearRampToValueAtTime(f0 * (death ? 0.55 : 0.82), t + dur);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 5 + Math.random() * 4;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = f0 * 0.06;
    wobble.connect(wobbleDepth).connect(osc.frequency);

    // "uh" for idle groans, "ah" for snarls.
    const mix = ctx.createGain();
    const [f1, f2] = snarl ? [800, 1250] : [520 + Math.random() * 120, 1050 + Math.random() * 200];
    for (const [freq, q, g] of [
      [f1, 5, 1],
      [f2, 7, 0.55],
    ] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const lvl = ctx.createGain();
      lvl.gain.value = g;
      osc.connect(bp).connect(lvl).connect(mix);
    }
    // Wet breath.
    const breath = this.noiseSource(ctx, t, dur);
    const breathBp = ctx.createBiquadFilter();
    breathBp.type = 'bandpass';
    breathBp.frequency.value = snarl ? 1800 : 900;
    const breathLvl = ctx.createGain();
    breathLvl.gain.value = snarl ? 0.5 : 0.25;
    breath.connect(breathBp).connect(breathLvl).connect(mix);

    // Rough, uneven amplitude: tremolo on top of a swell-and-fade envelope.
    const env = ctx.createGain();
    const peak = snarl ? 1.1 : death ? 0.8 : 0.6;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + dur * 0.25);
    env.gain.setValueAtTime(peak, t + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const trem = ctx.createOscillator();
    trem.frequency.value = 9 + Math.random() * 8;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.35;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.7;
    trem.connect(tremDepth).connect(tremGain.gain);

    mix.connect(tremGain).connect(env).connect(dest);
    for (const o of [osc, wobble, trem]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    osc.onended = () => {
      this.voices -= 1;
      dest.disconnect();
    };
  }
}
