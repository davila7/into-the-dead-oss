/** Tiny synthesized sound effects so the prototype needs no audio files. */
export class Sfx {
  private ctx?: AudioContext;
  private noise?: AudioBuffer;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
  }

  private burst(duration: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + duration);
  }

  shot(): void {
    this.burst(0.35, 1800, 0.9);
    this.burst(0.08, 5000, 0.4, 'highpass');
  }

  click(): void {
    this.burst(0.04, 3000, 0.3, 'bandpass');
  }

  reload(): void {
    this.click();
    setTimeout(() => this.click(), 180);
  }

  hit(): void {
    this.burst(0.12, 400, 0.5);
  }
}
