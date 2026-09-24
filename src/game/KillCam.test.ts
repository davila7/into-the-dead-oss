import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { KillCam } from './KillCam';

const cfg = CONFIG.killCam;

describe('KillCam', () => {
  it('starts on a headshot kill and slows time at its peak', () => {
    const k = new KillCam();
    expect(k.kill(true)).toBe(true);
    k.update(cfg.duration * 0.4);
    expect(k.timeScale).toBeCloseTo(cfg.timeScale);
    expect(k.zoom).toBeCloseTo(cfg.zoom);
  });

  it('is back to normal after its duration', () => {
    const k = new KillCam();
    k.kill(true);
    k.update(cfg.duration + 0.01);
    expect(k.timeScale).toBe(1);
    expect(k.zoom).toBe(0);
  });

  it('ignores a lone body-shot kill', () => {
    const k = new KillCam();
    expect(k.kill(false)).toBe(false);
    expect(k.timeScale).toBe(1);
  });

  it('starts on a chain of quick kills, not on slow ones', () => {
    const quick = new KillCam();
    const slow = new KillCam();
    for (let i = 1; i <= cfg.chainKills; i++) {
      expect(quick.kill(false)).toBe(i === cfg.chainKills);
      expect(slow.kill(false)).toBe(false);
      quick.update(cfg.chainWindow * 0.5);
      slow.update(cfg.chainWindow * 1.5);
    }
  });

  it('counts kills from one shot (same frame) towards a chain', () => {
    const k = new KillCam();
    const started = Array.from({ length: cfg.chainKills }, () => k.kill(false));
    expect(started.at(-1)).toBe(true);
  });

  it('waits out the cooldown before another kill cam', () => {
    const k = new KillCam();
    k.kill(true);
    k.update(cfg.duration + 0.01);
    expect(k.kill(true)).toBe(false);
    k.update(cfg.cooldown);
    expect(k.kill(true)).toBe(true);
  });

  it('cancel and reset stop it at once', () => {
    const k = new KillCam();
    k.kill(true);
    k.update(0.05);
    k.cancel();
    expect(k.timeScale).toBe(1);
    k.reset();
    expect(k.kill(true)).toBe(true);
  });
});
