import { describe, expect, it } from 'vitest';
import { bulletCamDue, bulletCamPhase, entryOffset, flightTime } from './BulletCam';
import { CONFIG } from './config';

const cfg = CONFIG.bulletCam;
const far = cfg.minDistance + 10;

describe('bulletCamDue', () => {
  it('never plays on a headshot too close to follow', () => {
    expect(bulletCamDue(1000, 0, cfg.minDistance - 0.1, 0)).toBe(false);
    expect(bulletCamDue(1000, 0, cfg.minDistance - 0.1, 0, true)).toBe(false);
  });

  it('waits for its cooldown, then plays on a lucky roll', () => {
    expect(bulletCamDue(cfg.firstAfter - 1, cfg.firstAfter, far, 0)).toBe(false);
    expect(bulletCamDue(cfg.firstAfter, cfg.firstAfter, far, 0)).toBe(true);
    expect(bulletCamDue(cfg.firstAfter, cfg.firstAfter, far, cfg.chance)).toBe(false);
  });

  it('plays on every headshot when forced', () => {
    expect(bulletCamDue(0, cfg.firstAfter, far, 0.99, true)).toBe(true);
  });
});

describe('flightTime', () => {
  it('grows with distance within its bounds', () => {
    expect(flightTime(0)).toBe(cfg.flightMin);
    expect(flightTime(1000)).toBe(cfg.flightMax);
    expect(flightTime(22)).toBeGreaterThan(flightTime(20));
  });
});

describe('bulletCamPhase', () => {
  it('chases, then shows the entry, then the aftermath, then ends', () => {
    const f = 3;
    expect(bulletCamPhase(1, f)?.phase).toBe('flight');
    expect(bulletCamPhase(f + 0.1, f)?.phase).toBe('entry');
    expect(bulletCamPhase(f + cfg.entryTime + 0.1, f)?.phase).toBe('after');
    expect(bulletCamPhase(f + cfg.entryTime + cfg.impactTime + 0.01, f)).toBeNull();
  });
});

describe('entryOffset', () => {
  it('creeps up to the head, reaches it at entryHit, and sinks entryDepth in', () => {
    expect(entryOffset(0)).toBeCloseTo(-cfg.entryLead);
    expect(entryOffset(cfg.entryHit)).toBeCloseTo(0);
    expect(entryOffset(1)).toBeCloseTo(cfg.entryDepth);
    expect(entryOffset(0.3)).toBeGreaterThan(entryOffset(0.2));
  });
});
