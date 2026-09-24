/** Keyboard + pointer state. Pointer position is kept in normalized device coords. */
export class Input {
  readonly aim = { x: 0, y: 0 };
  private readonly keys = new Set<string>();
  private touchSteer = 0;
  private fireQueued = false;
  private reloadQueued = false;
  private pauseQueued = false;
  private choiceQueued: 'take' | 'keep' | null = null;
  private pickQueued: number | null = null;
  private pointerHeld = false;

  constructor(private readonly canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.fireQueued = true;
      if (e.code === 'KeyR') this.reloadQueued = true;
      if (e.code === 'KeyP' || e.code === 'Escape') this.pauseQueued = true;
      if (e.code === 'KeyE' || e.code === 'Enter') this.choiceQueued = 'take';
      if (e.code === 'KeyQ') this.choiceQueued = 'keep';
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) this.pickQueued = Number(digit[1]) - 1;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointerHeld = false;
    });

    canvas.addEventListener('pointermove', (e) => this.setAim(e));
    canvas.addEventListener('pointerdown', (e) => {
      this.setAim(e);
      if (e.button === 0) {
        this.fireQueued = true;
        this.pointerHeld = true;
      }
    });
    window.addEventListener('pointerup', () => (this.pointerHeld = false));
    window.addEventListener('pointercancel', () => (this.pointerHeld = false));
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

  /** Trigger held down (click or Space), for automatic weapons. */
  get fireHeld(): boolean {
    return this.pointerHeld || this.keys.has('Space');
  }

  /** Queues a choice from the on-screen offer buttons. */
  choose(choice: 'take' | 'keep'): void {
    this.choiceQueued = choice;
  }

  /** Queues a perk card (0-based) from the on-screen buttons. */
  pick(index: number): void {
    this.pickQueued = index;
  }

  /** 0-based perk card picked with 1-9 or a click, if any. */
  consumePick(): number | null {
    const v = this.pickQueued;
    this.pickQueued = null;
    return v;
  }

  consumeChoice(): 'take' | 'keep' | null {
    const v = this.choiceQueued;
    this.choiceQueued = null;
    return v;
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
    this.choiceQueued = null;
    this.pickQueued = null;
  }
}
