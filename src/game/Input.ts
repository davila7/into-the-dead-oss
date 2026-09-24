/** Keyboard + pointer state. Pointer position is kept in normalized device coords. */
export class Input {
  readonly aim = { x: 0, y: 0 };
  private readonly keys = new Set<string>();
  private touchSteer = 0;
  private fireQueued = false;
  private reloadQueued = false;
  private pauseQueued = false;

  constructor(private readonly canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.fireQueued = true;
      if (e.code === 'KeyR') this.reloadQueued = true;
      if (e.code === 'KeyP' || e.code === 'Escape') this.pauseQueued = true;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointermove', (e) => this.setAim(e));
    canvas.addEventListener('pointerdown', (e) => {
      this.setAim(e);
      if (e.button === 0) this.fireQueued = true;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private setAim(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.aim.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.aim.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  /** Wires on-screen steer buttons (touch devices). */
  bindSteerButton(el: HTMLElement, dir: -1 | 1): void {
    const release = () => {
      if (this.touchSteer === dir) this.touchSteer = 0;
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchSteer = dir;
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
  }

  /** -1 = left, 1 = right. */
  get steer(): number {
    let s = this.touchSteer;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s += 1;
    return Math.max(-1, Math.min(1, s));
  }

  consumeFire(): boolean {
    const v = this.fireQueued;
    this.fireQueued = false;
    return v;
  }

  consumeReload(): boolean {
    const v = this.reloadQueued;
    this.reloadQueued = false;
    return v;
  }

  consumePause(): boolean {
    const v = this.pauseQueued;
    this.pauseQueued = false;
    return v;
  }

  clearQueued(): void {
    this.fireQueued = this.reloadQueued = this.pauseQueued = false;
  }
}
