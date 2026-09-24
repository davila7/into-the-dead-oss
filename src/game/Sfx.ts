import type * as THREE from 'three';
import type { WeaponId } from './weapons';

export type Surface = 'wheat' | 'corn';

/** Most zombie voices allowed at once, so a horde doesn't turn into mush. */
const MAX_VOICES = 5;

/** Soft-clipping transfer curve that gives the roar its torn-throat grit. */
const CLIP_CURVE = (() => {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 4);
  return curve;
})();

/**
 * Synthesized sound effects (Web Audio, no files): weapons, footsteps, corn brushing
 * past, fence vaults and positional zombie groans.
 */
interface Cricket {
  freq: number;
  pan: number;
  /** Pulses per chirp and seconds between chirps. */
  pulses: number;
  period: number;
  next: number;
}

export class Sfx {
  private ctx?: AudioContext;
  private out?: AudioNode;
  private noise?: AudioBuffer;
  private voices = 0;
  private cricketBus?: GainNode;
  private readonly cricketsInField: Cricket[] = Array.from({ length: 6 }, () => ({
    freq: 4200 + Math.random() * 1400,
    pan: Math.random() * 2 - 1,
    pulses: 2 + Math.floor(Math.random() * 3),
    period: 0.45 + Math.random() * 0.5,
    next: 0,
  }));

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

  // --- ambience --------------------------------------------------------------

  /**
   * Night crickets around the listener; call every frame. `level` (0..1) sets how loud they
   * are, so they can hush when something gets close. Chirps are scheduled a little ahead.
   */
  crickets(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    if (!this.cricketBus) {
      this.cricketBus = ctx.createGain();
      this.cricketBus.gain.value = 0;
      this.cricketBus.connect(this.out);
    }
    const now = ctx.currentTime;
    this.cricketBus.gain.setTargetAtTime(0.6 * level, now, 0.6);
    for (const c of this.cricketsInField) {
      // After a pause or a hidden tab, pick up from now instead of catching up.
      if (c.next < now) c.next = now + Math.random() * c.period;
      while (c.next < now + 0.25) {
        this.chirp(ctx, c, c.next);
        // Crickets aren't metronomes: a bit of drift, and now and then a rest.
        c.next += c.period * (0.9 + Math.random() * 0.2) + (Math.random() < 0.08 ? 1 + Math.random() * 3 : 0);
      }
    }
  }

  /** One chirp: a few quick pulses of a high, slightly buzzy tone. */
  private chirp(ctx: AudioContext, c: Cricket, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = c.freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    const pulse = 0.016;
    const gapT = 0.012;
    const vol = 0.07 + Math.random() * 0.05;
    for (let i = 0; i < c.pulses; i++) {
      const p = t + i * (pulse + gapT);
      g.gain.setValueAtTime(0, p);
      g.gain.linearRampToValueAtTime(vol, p + 0.004);
      g.gain.linearRampToValueAtTime(0, p + pulse);
    }
    const pan = new StereoPannerNode(ctx, { pan: c.pan });
    osc.connect(g).connect(pan).connect(this.cricketBus!);
    osc.start(t);
    osc.stop(t + c.pulses * (pulse + gapT) + 0.02);
  }

  // --- zombies ---------------------------------------------------------------

  /** The brute: the roar, an octave-ish lower and slower. */
  bellow(pos: THREE.Vector3, kind: 'idle' | 'snarl' | 'death' = 'idle'): void {
    if (kind === 'death') this.moan(pos, true);
    else this.roar(pos, kind === 'snarl', 0.6);
  }

  /** A zombie dog: snarling barks, or a yelp when it dies. */
  bark(pos: THREE.Vector3, kind: 'idle' | 'snarl' | 'death' = 'idle'): void {
    const v = this.voice(pos);
    if (!v) return;
    const { ctx, dest } = v;
    const t0 = ctx.currentTime;
    const count = kind === 'death' ? 1 : kind === 'snarl' ? 3 : 1 + Math.floor(Math.random() * 2);
    let last: OscillatorNode | undefined;
    for (let i = 0; i < count; i++) {
      const t = t0 + i * (0.16 + Math.random() * 0.06);
      const dur = kind === 'death' ? 0.4 : 0.12;
      const f = kind === 'death' ? 900 : 380 + Math.random() * 120;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * (kind === 'death' ? 0.4 : 0.55), t + dur);
      const drive = ctx.createWaveShaper();
      drive.curve = CLIP_CURVE;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      bp.Q.value = 1.2;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(drive).connect(bp).connect(env).connect(dest);
      // Throaty rasp under each bark.
      this.burst(dur, 900, 0.25, 'bandpass', { delay: t - t0, q: 1.5, dest });
      osc.start(t);
      osc.stop(t + dur + 0.02);
      last = osc;
    }
    last!.onended = v.release;
  }

  /**
   * A zombie at `pos` makes a noise. The voice is picked at random so a horde mixes the
   * bleating groan, a distorted roar and a human-sounding moan.
   */
  groan(pos: THREE.Vector3, kind: 'idle' | 'snarl' | 'death' = 'idle'): void {
    const r = Math.random();
    if (kind === 'idle') {
      if (r < 0.4) this.bleat(pos, 'idle');
      else if (r < 0.7) this.roar(pos, false);
      else this.moan(pos, false);
    } else if (kind === 'snarl') {
      if (r < 0.6) this.roar(pos, true);
      else this.bleat(pos, 'snarl');
    } else if (r < 0.5) {
      this.moan(pos, true);
    } else {
      this.bleat(pos, 'death');
    }
  }

  /** Claims a zombie voice slot and a 3D panner at `pos`; undefined when saturated. */
  private voice(pos: THREE.Vector3): { ctx: AudioContext; dest: PannerNode; release: () => void } | undefined {
    const ctx = this.ctx;
    if (!ctx || !this.noise || this.voices >= MAX_VOICES) return undefined;
    const dest = this.panner(pos);
    if (!dest) return undefined;
    this.voices += 1;
    return {
      ctx,
      dest,
      release: () => {
        this.voices -= 1;
        dest.disconnect();
      },
    };
  }

  /**
   * Guttural roar: two detuned low saws and throat noise pushed through a soft clipper,
   * shaped by an open "aah". `lunge` is the short, loud version when one charges.
   */
  private roar(pos: THREE.Vector3, lunge: boolean, pitch = 1): void {
    const v = this.voice(pos);
    if (!v) return;
    const { ctx, dest } = v;
    const t = ctx.currentTime;
    const dur = (lunge ? 0.7 + Math.random() * 0.3 : 1.2 + Math.random() * 0.8) / Math.sqrt(pitch);
    const f0 = (lunge ? 70 + Math.random() * 25 : 45 + Math.random() * 20) * pitch;

    const mix = ctx.createGain();
    const oscs: OscillatorNode[] = [];
    for (const detune of [1, 1.035]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f0 * detune, t);
      osc.frequency.linearRampToValueAtTime(f0 * detune * 1.2, t + dur * 0.3);
      osc.frequency.linearRampToValueAtTime(f0 * detune * 0.7, t + dur);
      osc.connect(mix);
      oscs.push(osc);
    }
    const rasp = this.noiseSource(ctx, t, dur);
    const raspLp = ctx.createBiquadFilter();
    raspLp.type = 'lowpass';
    raspLp.frequency.value = 1400;
    const raspLvl = ctx.createGain();
    raspLvl.gain.value = 0.9;
    rasp.connect(raspLp).connect(raspLvl).connect(mix);

    const drive = ctx.createWaveShaper();
    drive.curve = CLIP_CURVE;
    const pre = ctx.createGain();
    pre.gain.value = 2.5;

    const vowel = ctx.createGain();
    for (const [freq, q, g] of [
      [720, 2.5, 1],
      [1150, 3, 0.6],
      [250, 1, 0.8],
    ] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const lvl = ctx.createGain();
      lvl.gain.value = g;
      drive.connect(bp).connect(lvl).connect(vowel);
    }
    mix.connect(pre).connect(drive);

    // Slow, uneven swell rather than the fast goat-like flutter of the groan.
    const env = ctx.createGain();
    // The clipper adds a lot of level; keep it in line with the other voices.
    const peak = lunge ? 0.45 : 0.3;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + dur * 0.2);
    env.gain.linearRampToValueAtTime(peak * 0.7, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const surge = ctx.createOscillator();
    surge.frequency.value = 3 + Math.random() * 2;
    const surgeDepth = ctx.createGain();
    surgeDepth.gain.value = 0.25;
    const surgeGain = ctx.createGain();
    surgeGain.gain.value = 0.8;
    surge.connect(surgeDepth).connect(surgeGain.gain);

    vowel.connect(surgeGain).connect(env).connect(dest);
    for (const o of [...oscs, surge]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    oscs[0].onended = v.release;
  }

  /**
   * A human-sounding moan of pain: a softer voice in a man's range that rises and then
   * sighs down, gliding from "oh" to "uh", with slow vibrato and breath.
   */
  private moan(pos: THREE.Vector3, dying: boolean): void {
    const v = this.voice(pos);
    if (!v) return;
    const { ctx, dest } = v;
    const t = ctx.currentTime;
    const dur = dying ? 0.8 + Math.random() * 0.3 : 1.4 + Math.random() * 1;
    // Mostly low voices, now and then a higher, more desperate one.
    const f0 = Math.random() < 0.75 ? 105 + Math.random() * 45 : 180 + Math.random() * 50;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    if (dying) {
      osc.frequency.linearRampToValueAtTime(f0 * 1.1, t + dur * 0.15);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + dur);
    } else {
      osc.frequency.linearRampToValueAtTime(f0 * 1.22, t + dur * 0.35);
      osc.frequency.linearRampToValueAtTime(f0 * 0.78, t + dur);
    }
    const vib = ctx.createOscillator();
    vib.frequency.value = 4 + Math.random() * 1.5;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = f0 * 0.025;
    vib.connect(vibDepth).connect(osc.frequency);

    // Soften the saw so it reads as a throat, not a buzzer.
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 2200;
    osc.connect(soft);

    const vowel = ctx.createGain();
    for (const [from, to, q, g] of [
      [450, 620, 6, 1],
      [800, 1050, 7, 0.5],
      [2500, 2400, 8, 0.12],
    ] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(from, t);
      bp.frequency.linearRampToValueAtTime(to, t + dur);
      bp.Q.value = q;
      const lvl = ctx.createGain();
      lvl.gain.value = g;
      soft.connect(bp).connect(lvl).connect(vowel);
    }
    const breath = this.noiseSource(ctx, t, dur);
    const breathBp = ctx.createBiquadFilter();
    breathBp.type = 'bandpass';
    breathBp.frequency.value = 1300;
    breathBp.Q.value = 0.8;
    const breathLvl = ctx.createGain();
    breathLvl.gain.value = 0.18;
    breath.connect(breathBp).connect(breathLvl).connect(vowel);

    const env = ctx.createGain();
    const peak = dying ? 1.2 : 0.9;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + dur * 0.3);
    env.gain.setValueAtTime(peak, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    vowel.connect(env).connect(dest);

    for (const o of [osc, vib]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    osc.onended = v.release;
  }

  /**
   * The original groan: a buzzy glottal source through two vowel formants, with a fast
   * flutter that gives it its bleating, goat-like edge. `snarl` is the harsher lunge version.
   */
  private bleat(pos: THREE.Vector3, kind: 'idle' | 'snarl' | 'death'): void {
    const v = this.voice(pos);
    if (!v) return;
    const { ctx, dest } = v;

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
    osc.onended = v.release;
  }
}
